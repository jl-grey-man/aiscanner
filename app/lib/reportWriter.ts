/**
 * reportWriter.ts — Enriches bad/warning checks with tailored Pro-generated content
 *
 * For EVERY bad/warning check (paid tier) it produces:
 *   - richRelevance: "Varför spelar det roll för [Företag]?"
 *   - richSteps: "Steg för steg" (numbered markdown)
 *   - richCodeExample: Company-specific, copy-paste-ready code
 *
 * Reliability model (no silent gaps):
 *   - Checks are split into small batches (max 3 checks, sorted by category) so a
 *     single broken/truncated generation never takes a whole category down.
 *   - Batches run in parallel behind a concurrency limit.
 *   - Each call goes through withRetry (app/lib/retry.ts): Gemini 2.5 Pro first,
 *     Gemini 2.5 Flash as fallback for the checks Pro could not deliver.
 *   - timeout/max_tokens scale with batch size, and a total time budget keeps
 *     the paid scan bounded (Pro reserves time for its Flash fallback).
 *   - Every enrichable check gets `richStatus` ('pro' | 'flash' | 'missing').
 *     'missing' is always logged with its reason — never silent.
 *
 * Runs in parallel with Pro synthesis.
 */

import type { CheckResult } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'
import { withRetry } from './retry'
import {
  applyMasterSchema,
  buildMasterSchema,
  dedupeCodeExamples,
  pickMasterOwner,
  referencingKeys,
  type MasterSchema,
  type OpeningPeriod,
} from './masterSchema'
import { formatFactsForPrompt, GROUNDING_RULES, type VerifiedFacts } from './factGuard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Vilken modell som levererade det rika innehållet, eller 'missing' om inget komplett innehåll kunde tas fram. */
export type RichStatus = 'pro' | 'flash' | 'missing'

export interface RichCheckData {
  richRelevance: string | null
  richSteps: string | null
  richCodeExample: string | null
  richStatus: RichStatus
  /** Checken vars kodblock redan täcker den här (huvudschemat eller en dubblett). richCodeExample = bara delta. */
  codeRef?: string
}

/** Huvudschemat (Audit #7) och checken som äger dess kodblock. */
interface MasterContext {
  ownerKey: string
  ownerLabel: string
  master: MasterSchema
}

type RichContent = Omit<RichCheckData, 'richStatus'>

export interface BusinessMeta {
  companyName: string
  bransch: string
  city: string | null
  url: string
  domain: string
  phone?: string
  // Extra fält så Pro kan generera komplett kod utan placeholders.
  // Alla är optional — om de saknas måste Pro UTELÄMNA fältet (inte skriva ANPASSA).
  streetAddress?: string | null
  postalCode?: string | null
  formattedAddress?: string | null
  email?: string | null
  latitude?: number | null
  longitude?: number | null
  placeId?: string | null
  primaryType?: string | null
  googleRating?: number | null
  reviewCount?: number | null
  weekdayHours?: string[] | null
  /** Places `regularOpeningHours.periods` — används för huvudschemats openingHoursSpecification. */
  openingPeriods?: OpeningPeriod[] | null
  schemaTypes?: string[]
  socialLinks?: string[]
  title?: string | null
  h1?: string | null
  /** Audit #6: verifierade fakta (kända URL:er, skrapat meny-/tjänsteinnehåll, FAQ-frågor) + förbud mot påhittade fakta. */
  verifiedFacts?: VerifiedFacts | null
}

/**
 * Ett ENKELT LLM-anrop (utan egen retry — Report Writer sköter retry själv via withRetry).
 * Ska kasta vid fel; ett fel med `permanent: true` retryas inte.
 */
export type CallOpenRouterFn = (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown: boolean,
  maxTokensOverride?: number,
  /** Utelämnad = anroparens standard (0.2). Bedömningsanrop skickar ASSESSMENT_TEMPERATURE. */
  temperature?: number,
) => Promise<any>

/**
 * Temperatur för Flash-BEDÖMNINGAR (status-avgörande anrop: teknik/FAQ/E-A-T i route.ts,
 * AI-svarsklassificeringen i aiMentionChecker.ts). 0 = samma indata ger så långt det går
 * samma status → stabila poäng. Textgenerering (syntes, Report Writer) behåller 0.2.
 */
export const ASSESSMENT_TEMPERATURE = 0

export interface ReportWriterOptions {
  /** Max antal checks per LLM-anrop. */
  batchSize?: number
  /** Max antal samtidiga batchar. */
  concurrency?: number
  /** Antal försök (inkl. första) mot Pro per batch. */
  proAttempts?: number
  /** Antal försök (inkl. första) mot Flash-reserven per batch. */
  flashAttempts?: number
  /** Bas-fördröjning för withRetry:s exponentiella backoff. */
  retryBaseDelayMs?: number
  /** Total tidsbudget för hela Report Writer-körningen. */
  budgetMs?: number
  /** Klocka (injiceras i tester). */
  now?: () => number
}

export const REPORT_WRITER_DEFAULTS: Required<Omit<ReportWriterOptions, 'now'>> = {
  batchSize: 3,
  concurrency: 4,
  proAttempts: 2,
  flashAttempts: 2,
  retryBaseDelayMs: 1000,
  budgetMs: 170_000,
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Kategoriordning för batch-planeringen — närliggande checks hamnar i samma anrop. */
const CATEGORY_ORDER: string[] = ['technical', 'local', 'ai-readiness', 'content', 'ai-test', 'gbp']

const PRO_MODEL = 'google/gemini-2.5-pro'
const FLASH_MODEL = 'google/gemini-2.5-flash'

/** Ett anrop startas inte (och retryas inte) om mindre tid än så här återstår av budgeten. */
const MIN_CALL_MS = 15_000

/**
 * Tar bort JSON-nycklarna `aggregateRating` och `review` rekursivt ur en
 * JSON- eller JSON-LD-sträng. Googles riktlinjer förbjuder self-serving
 * review-markup (ett företag som betygsätter sig själv i sitt eget schema),
 * och siffran blir snabbt inaktuell. Detta är ett säkerhetsnät utöver
 * promptregeln nedan — Pro följer inte alltid instruktionen.
 *
 * Försöker hitta JSON-LD-innehållet (inuti <script>-taggar om sådana finns,
 * annars hela strängen) och `JSON.parse` det för en korrekt rekursiv
 * borttagning. Om parsningen misslyckas (trasig/ofullständig JSON från
 * modellen) faller vi tillbaka på en regex som tar bort nyckeln + dess
 * objekt/array-värde på bästa möjliga sätt (balanserade klamrar på
 * godtyckligt djup går inte att uttrycka med regex).
 */
function stripAggregateRatingAndReview(code: string): string {
  const KEYS = ['aggregateRating', 'review']

  const stripKeysRecursive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripKeysRecursive)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (KEYS.includes(k)) continue
        out[k] = stripKeysRecursive(v)
      }
      return out
    }
    return value
  }

  const tryParseAndStrip = (jsonText: string): string | null => {
    try {
      const parsed = JSON.parse(jsonText)
      return JSON.stringify(stripKeysRecursive(parsed), null, 2)
    } catch {
      return null
    }
  }

  const regexFallback = (text: string): string => {
    let out = text
    for (const key of KEYS) {
      // Objekt-värde, upp till en nivås nästlade klamrar
      out = out.replace(new RegExp(`"${key}"\\s*:\\s*\\{[^{}]*(\\{[^{}]*\\}[^{}]*)*\\},?\\s*`, 'g'), '')
      // Array-värde av objekt (t.ex. "review": [ {...}, {...} ]), samma nästlingsdjup
      out = out.replace(new RegExp(`"${key}"\\s*:\\s*\\[[^\\[\\]]*(\\{[^{}]*\\}[^\\[\\]]*)*\\],?\\s*`, 'g'), '')
    }
    return out
  }

  if (/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(code)) {
    return code.replace(
      /(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
      (_match, open, inner, close) => {
        const stripped = tryParseAndStrip(inner.trim())
        const body = stripped !== null ? stripped : regexFallback(inner)
        return `${open}\n${body}\n${close}`
      }
    )
  }

  const trimmed = code.trim()
  const stripped = tryParseAndStrip(trimmed)
  if (stripped !== null) return stripped
  return regexFallback(code)
}

/**
 * Defensiv tvätt av Pro-genererad richCodeExample. Pro envisas ibland med att
 * skriva `<!-- ANPASSA: ... -->`-platshållare i kod trots att vi instruerat
 * den att utelämna fält där data saknas. Vi rensar bort sådana rader så
 * paid-koden inte innehåller dem. Vi tar också bort dubbla markdown-fences
 * (Pro skriver ibland ```json ... ``` runt koden trots att UI:t redan
 * renderar den i ett kodblock) och aggregateRating/review (se
 * `stripAggregateRatingAndReview` ovan).
 *
 * - Strippar ledande/avslutande markdown-fence-rader.
 * - Tar bort aggregateRating/review rekursivt.
 * - Tar bort hela rader som innehåller platshållare-mönster.
 * - Städar trailing commas som blir kvar.
 * - Returnerar null om det knappt finns något substantiellt kvar.
 */
export function sanitizeCodeExample(code: string | null): string | null {
  if (!code) return null

  let working = code
    .replace(/^```[a-z]*\s*\n/i, '')
    .replace(/\n```\s*$/, '')

  working = stripAggregateRatingAndReview(working)

  const placeholderRegex = /<!--\s*(ANPASSA|TODO|FYLL)[\s\S]*?-->|<(DITT|DIN|ANGE|LÄGG|PLACEHOLDER|FÖRETAGSNAMN|TJÄNST|STAD|GATUADRESS|POSTNUMMER|TELEFONNUMMER|DOMÄN|FACEBOOKSIDA|INSTAGRAMKONTO|LATITUD|LONGITUD|EPOST|ORGNUMMER|PERSONNAMN|VERKSAMHETSTYP|BESKRIVNING|TITEL|NY[ -]?FRÅGA|NY[ -]?SVAR|SVAR \d|FRÅGA \d|KORT|ERBJUDANDE|SPECIALITET|ANTAL|EXAMPLE|YOUR_)[^>]*>/i

  const lines = working.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (placeholderRegex.test(line)) continue
    kept.push(line)
  }
  // Städa trailing commas före } eller ]
  let cleaned = kept.join('\n').replace(/,(\s*[}\]])/g, '$1')
  // Städa tomma "key": "" eller "key": ,
  cleaned = cleaned.replace(/^\s*"[^"]+"\s*:\s*"",?\s*$/gm, '')
  // Komprimera 3+ tomma rader till max 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // Substantiell innehåll-check: minst 20 alfanumeriska tecken
  if (cleaned.replace(/[\s{}\[\],"':]/g, '').length < 20) return null
  return cleaned.trim()
}

// ---------------------------------------------------------------------------
// Planning helpers
// ---------------------------------------------------------------------------

/** Bara bad/warning-checks (ej syntes) får rikt innehåll. */
export function isEnrichable(check: CheckResult): boolean {
  return (check.status === 'bad' || check.status === 'warning') && check.key !== 'synthesis'
}

/**
 * Sorterar checks kategorivis (CATEGORY_ORDER, sedan registry-id) och delar upp
 * dem i batchar om högst `batchSize` checks.
 */
export function planBatches(checks: CheckResult[], batchSize: number = REPORT_WRITER_DEFAULTS.batchSize): CheckResult[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize måste vara ett heltal ≥ 1 (fick ${batchSize})`)
  }
  const entryByKey = new Map(CHECK_REGISTRY.map(e => [e.key as string, e]))
  const categoryRank = (c: CheckResult) => {
    const idx = CATEGORY_ORDER.indexOf(entryByKey.get(c.key)?.category ?? '')
    return idx === -1 ? CATEGORY_ORDER.length : idx
  }
  const idOf = (c: CheckResult) => entryByKey.get(c.key)?.id ?? Number.MAX_SAFE_INTEGER
  const sorted = [...checks].sort((a, b) => categoryRank(a) - categoryRank(b) || idOf(a) - idOf(b))

  const batches: CheckResult[][] = []
  for (let i = 0; i < sorted.length; i += batchSize) {
    batches.push(sorted.slice(i, i + batchSize))
  }
  return batches
}

/**
 * Timeout och max_tokens per anrop, skalat efter antal checks i batchen.
 * Pro "tänker" innan den svarar (reasoning-tokens räknas mot max_tokens) och är
 * långsammare än Flash — därför får Pro mer av båda.
 */
export function callLimitsFor(model: 'pro' | 'flash', batchSize: number): { timeoutMs: number; maxTokens: number } {
  const n = Math.max(1, batchSize)
  return model === 'pro'
    ? { timeoutMs: 30_000 + 25_000 * n, maxTokens: 4_000 + 2_500 * n }
    : { timeoutMs: 20_000 + 10_000 * n, maxTokens: 2_000 + 2_000 * n }
}

/** Kör `worker` över `items` med högst `limit` samtidiga anrop. Resultatordningen följer `items`. */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const laneCount = Math.min(Math.max(1, limit), items.length)
  const lanes = Array.from({ length: laneCount }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
  return results
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function enrichChecksWithReportWriter(
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
  options: ReportWriterOptions = {},
): Promise<Record<string, RichCheckData>> {
  const { now = Date.now, ...overrides } = options
  const opts = { ...REPORT_WRITER_DEFAULTS, ...overrides }

  const enrichable = checks.filter(isEnrichable)
  if (enrichable.length === 0) return {}

  const startedAt = now()
  const deadline = startedAt + opts.budgetMs
  const batches = planBatches(enrichable, opts.batchSize)

  // Audit #7: ETT huvudschema, byggt deterministiskt av verifierad data och ägt av
  // den mest relevanta schema-checken. Övriga schema-checks hänvisar dit.
  const ownerKey = pickMasterOwner(enrichable)
  const master = ownerKey ? buildMasterSchema(meta) : null
  const masterCtx: MasterContext | null = ownerKey && master
    ? { ownerKey, ownerLabel: CHECK_REGISTRY.find(e => e.key === ownerKey)?.label ?? ownerKey, master }
    : null

  const batchResults = await runWithConcurrency(batches, opts.concurrency, batch =>
    enrichBatch(batch, meta, callOpenRouter, opts, deadline, now, masterCtx)
  )

  const result: Record<string, RichCheckData> = {}
  for (const batchResult of batchResults) Object.assign(result, batchResult)

  if (masterCtx) {
    applyMasterSchema(result, masterCtx.ownerKey, masterCtx.master)
    const refs = Object.keys(result).filter(k => result[k].codeRef === masterCtx.ownerKey)
    console.log(`[ReportWriter] Huvudschema (${masterCtx.master.type}) i ${masterCtx.ownerKey}; hänvisar: ${refs.join(', ') || 'inga'}`)
  }
  // Säkerhetsnät: kodblock som ändå är för lika visas bara en gång. Bara kort som
  // renderas (fix-text finns) får vara mål för en hänvisning.
  dedupeCodeExamples(result, {
    first: masterCtx?.ownerKey ?? null,
    referenceable: new Set(enrichable.filter(c => c.fix !== null).map(c => c.key)),
  })

  const counts: Record<RichStatus, number> = { pro: 0, flash: 0, missing: 0 }
  for (const data of Object.values(result)) counts[data.richStatus]++
  const summary = `[ReportWriter] ${enrichable.length} checks i ${batches.length} batchar: pro=${counts.pro} flash=${counts.flash} missing=${counts.missing} (${Math.round((now() - startedAt) / 1000)} s)`
  if (counts.missing > 0) console.error(summary)
  else console.log(summary)

  return result
}

/**
 * Skriver in rikt innehåll på checkarna (muterar dem). Varje berikningsbar check
 * får `richStatus`; en check som helt saknas i `rich` (t.ex. om Report Writer
 * kraschade) markeras 'missing' och loggas. Returnerar nycklarna som saknar
 * komplett rikt innehåll.
 */
export function applyRichData(checks: CheckResult[], rich: Record<string, RichCheckData>): string[] {
  const missing: string[] = []
  for (const check of checks) {
    if (!isEnrichable(check)) continue
    const data = rich[check.key]
    if (data) {
      check.richRelevance = data.richRelevance
      check.richSteps = data.richSteps
      check.richCodeExample = data.richCodeExample
      check.richStatus = data.richStatus
      if (data.codeRef) check.codeRef = data.codeRef
    } else {
      check.richStatus = 'missing'
      console.error(`[ReportWriter] Rikt innehåll SAKNAS för ${check.key}: inget resultat från Report Writer`)
    }
    if (check.richStatus === 'missing') missing.push(check.key)
  }
  return missing
}

// ---------------------------------------------------------------------------
// Per-batch logic
// ---------------------------------------------------------------------------

type Stage = { kind: 'pro' | 'flash'; label: string; model: string; attempts: number }

async function enrichBatch(
  batch: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
  opts: Required<Omit<ReportWriterOptions, 'now'>>,
  deadline: number,
  now: () => number,
  masterCtx: MasterContext | null = null,
): Promise<Record<string, RichCheckData>> {
  const out: Record<string, RichCheckData> = {}
  const partial = new Map<string, RichContent>()
  const reasons = new Map<string, string[]>()
  const addReason = (key: string, reason: string) => reasons.set(key, [...(reasons.get(key) ?? []), reason])

  const stages: Stage[] = [
    { kind: 'pro', label: 'Pro', model: PRO_MODEL, attempts: opts.proAttempts },
    { kind: 'flash', label: 'Flash', model: FLASH_MODEL, attempts: opts.flashAttempts },
  ]

  let pending = batch
  for (let s = 0; s < stages.length && pending.length > 0; s++) {
    const stage = stages[s]
    if (stage.attempts < 1) continue
    const keys = pending.map(c => c.key)
    const hasFallback = stages.slice(s + 1).some(st => st.attempts > 0)
    // Pro lämnar tid kvar åt Flash-reserven för samma batch.
    const reserveMs = hasFallback ? callLimitsFor('flash', pending.length).timeoutMs : 0

    try {
      const parsed = await callStage(stage, pending, meta, callOpenRouter, opts, deadline, reserveMs, now, masterCtx)
      const stillPending: CheckResult[] = []
      for (const check of pending) {
        const data = parsed[check.key]
        if (data && data.richRelevance && data.richSteps) {
          out[check.key] = { ...data, richStatus: stage.kind }
        } else {
          if (data) mergePartial(partial, check.key, data)
          addReason(check.key, `${stage.label}: ofullständigt svar (saknar ${data ? missingFields(data) : 'nyckeln'})`)
          stillPending.push(check)
        }
      }
      if (stillPending.length > 0) {
        console.warn(`[ReportWriter] ${stage.label} gav ofullständigt innehåll för [${stillPending.map(c => c.key).join(', ')}]${hasFallback ? ' — provar Flash' : ''}`)
      }
      pending = stillPending
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      for (const key of keys) addReason(key, `${stage.label}: ${msg}`)
      console.warn(`[ReportWriter] ${stage.label} misslyckades för [${keys.join(', ')}]: ${msg}${hasFallback ? ' — provar Flash' : ''}`)
    }
  }

  for (const check of pending) {
    const best = partial.get(check.key)
    out[check.key] = {
      richRelevance: best?.richRelevance ?? null,
      richSteps: best?.richSteps ?? null,
      richCodeExample: best?.richCodeExample ?? null,
      richStatus: 'missing',
    }
    console.error(`[ReportWriter] Rikt innehåll SAKNAS för ${check.key}: ${(reasons.get(check.key) ?? ['okänd orsak']).join(' | ')}`)
  }
  return out
}

async function callStage(
  stage: Stage,
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
  opts: Required<Omit<ReportWriterOptions, 'now'>>,
  deadline: number,
  reserveMs: number,
  now: () => number,
  masterCtx: MasterContext | null,
): Promise<Record<string, RichContent>> {
  const { systemPrompt, userPrompt } = buildBatchPrompt(checks, meta, masterCtx)
  const limits = callLimitsFor(stage.kind, checks.length)

  return withRetry(
    async () => {
      const available = deadline - now() - reserveMs
      if (available < MIN_CALL_MS) {
        const err = new Error(`tidsbudgeten räcker inte för ett ${stage.label}-anrop (${Math.max(0, Math.round(available / 1000))} s kvar)`)
        ;(err as any).budgetExhausted = true
        throw err
      }
      const keyList = checks.map(c => c.key).join(', ')
      const timeoutMs = Math.min(limits.timeoutMs, available)
      const t0 = now()
      try {
        const raw = await callOpenRouter(
          stage.model,
          systemPrompt,
          userPrompt,
          timeoutMs,
          false, // JSON mode
          limits.maxTokens,
        )
        const parsed = parseBatchResponse(raw, checks)
        if (Object.keys(parsed).length === 0) {
          throw new Error('AI-svaret innehöll ingen av check-nycklarna')
        }
        console.log(`[ReportWriter] ${stage.label} svarade för [${keyList}] på ${Math.round((now() - t0) / 1000)} s`)
        return parsed
      } catch (err) {
        // Varje misslyckat försök loggas — withRetry sväljer annars mellanliggande fel.
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[ReportWriter] ${stage.label}-försök misslyckades för [${keyList}] efter ${Math.round((now() - t0) / 1000)} s (timeout ${Math.round(timeoutMs / 1000)} s): ${msg.slice(0, 200)}`)
        throw err
      }
    },
    {
      attempts: stage.attempts,
      baseDelayMs: opts.retryBaseDelayMs,
      isRetryable: (err) => !(err as any)?.permanent && !(err as any)?.budgetExhausted,
    },
  )
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function parseBatchResponse(raw: unknown, checks: CheckResult[]): Record<string, RichContent> {
  const parsed: Record<string, RichContent> = {}
  if (!raw || typeof raw !== 'object') return parsed
  for (const check of checks) {
    const data = (raw as Record<string, unknown>)[check.key]
    if (!data || typeof data !== 'object') continue
    const d = data as Record<string, unknown>
    parsed[check.key] = {
      richRelevance: nonEmptyString(d.richRelevance),
      richSteps: nonEmptyString(d.richSteps),
      richCodeExample: sanitizeCodeExample(nonEmptyString(d.richCodeExample)),
    }
  }
  return parsed
}

function mergePartial(partial: Map<string, RichContent>, key: string, data: RichContent) {
  const prev = partial.get(key)
  partial.set(key, {
    richRelevance: prev?.richRelevance ?? data.richRelevance,
    richSteps: prev?.richSteps ?? data.richSteps,
    richCodeExample: prev?.richCodeExample ?? data.richCodeExample,
  })
}

function missingFields(data: RichContent): string {
  return [!data.richRelevance && 'richRelevance', !data.richSteps && 'richSteps'].filter(Boolean).join(', ')
}

function buildBatchPrompt(
  checks: CheckResult[],
  meta: BusinessMeta,
  masterCtx: MasterContext | null = null,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `Du är en senior svensk AI-sökningskonsult som skriver kundrapporter. Du skriver alltid på svenska. Dina texter är professionella, konkreta och handlingsbara. Du svarar ENBART med giltig JSON.`

  const checkDescriptions = checks.map(c => {
    const reg = CHECK_REGISTRY.find(e => e.key === c.key)
    return {
      key: c.key,
      label: reg?.label ?? c.key,
      status: c.status,
      finding: c.finding,
      fix: c.fix ?? '',
      codeExample: c.codeExample ?? '',
      data: c.data ?? null,
    }
  })

  // Bygg en kompakt företags-fakta-block där vi tar med ENDAST kända fält.
  // Saknade fält listas inte alls — då vet Pro att de inte finns, och utelämnar dem ur koden
  // (istället för att skriva ANPASSA-platshållare).
  const knownFacts: string[] = [
    `- Namn: ${meta.companyName}`,
    `- Bransch: ${meta.bransch}`,
    `- URL: ${meta.url}`,
    `- Domän: ${meta.domain}`,
  ]
  if (meta.city) knownFacts.push(`- Stad: ${meta.city}`)
  if (meta.streetAddress) knownFacts.push(`- Gatuadress: ${meta.streetAddress}`)
  if (meta.postalCode) knownFacts.push(`- Postnummer: ${meta.postalCode}`)
  if (meta.formattedAddress) knownFacts.push(`- Komplett adress (Google Places): ${meta.formattedAddress}`)
  if (meta.phone) knownFacts.push(`- Telefon: ${meta.phone}`)
  if (meta.email) knownFacts.push(`- E-post: ${meta.email}`)
  if (typeof meta.latitude === 'number' && typeof meta.longitude === 'number') {
    knownFacts.push(`- Koordinater: lat=${meta.latitude}, lng=${meta.longitude}`)
  }
  if (meta.placeId) knownFacts.push(`- Google Maps-länk (använd EXAKT denna som sameAs — konstruera ALDRIG en egen cid-URL av Place ID:t): https://www.google.com/maps/place/?q=place_id:${meta.placeId}`)
  if (meta.primaryType) knownFacts.push(`- Google primaryType: ${meta.primaryType}`)
  if (typeof meta.googleRating === 'number') knownFacts.push(`- Google-betyg: ${meta.googleRating}/5 (${meta.reviewCount ?? 0} recensioner)`)
  if (meta.weekdayHours && meta.weekdayHours.length > 0) {
    knownFacts.push(`- Öppettider (Google):\n${meta.weekdayHours.map(h => `    ${h}`).join('\n')}`)
  }
  if (meta.schemaTypes && meta.schemaTypes.length > 0) knownFacts.push(`- Befintliga schema-typer på sajten: ${meta.schemaTypes.join(', ')}`)
  if (meta.socialLinks && meta.socialLinks.length > 0) knownFacts.push(`- Sociala länkar/sameAs: ${meta.socialLinks.join(', ')}`)
  if (meta.title) knownFacts.push(`- Sidans <title>: "${meta.title}"`)
  if (meta.h1) knownFacts.push(`- Sidans <h1>: "${meta.h1}"`)

  const keyList = checks.map(c => `"${c.key}"`).join(', ')

  // Huvudschemat (Audit #7): visas bara för batchar som berörs, och modellen får inte upprepa det.
  let masterBlock = ''
  const masterRules: string[] = []
  if (masterCtx) {
    const { ownerKey, ownerLabel, master } = masterCtx
    const batchKeys = checks.map(c => c.key as string)
    const ownerInBatch = batchKeys.includes(ownerKey)
    const refs = referencingKeys(batchKeys, ownerKey, master)
    if (ownerInBatch || refs.length > 0) {
      masterBlock = `\nHUVUDSCHEMA — företagets JSON-LD är redan genererat av oss från den verifierade datan ovan och visas som kodblock i kortet "${ownerLabel}":\n${master.code}\n`
    }
    if (ownerInBatch) {
      masterRules.push(`- "${ownerKey}": sätt richCodeExample till null — huvudschemat ovan läggs in i det kortet automatiskt. richSteps ska förklara hur ${meta.companyName} lägger in kodblocket på sajten och kontrollerar att det fungerar.`)
    }
    if (refs.length > 0) {
      masterRules.push(`- ${refs.map(k => `"${k}"`).join(', ')}: upprepa ALDRIG huvudschemat eller delar av det — skriv i richSteps att grundkoden finns i kortet "${ownerLabel}". richCodeExample får bara innehålla det som INTE redan finns i huvudschemat (t.ex. en synlig HTML-rad på sajten), annars null.`)
    }
    masterRules.push(`- Schema för annat än själva företaget (t.ex. Service, Menu, FAQPage) ska referera till företaget med {"@id": "${master.id}"} i stället för att upprepa namn, adress och telefon.`)
  }

  // Audit #6: kända undersidor, skrapat meny-/tjänsteinnehåll och FAQ-frågor + förbud mot påhittade fakta.
  // Telefon/öppettider finns redan i knownFacts ovan.
  const factsBlock = meta.verifiedFacts ? `\n${formatFactsForPrompt(meta.verifiedFacts, { includeContact: false })}\n` : ''
  const groundingRules = meta.verifiedFacts ? `${GROUNDING_RULES}\n` : ''

  const userPrompt = `Företagsinformation (allt nedan är verifierad data — använd EXAKT dessa värden, hitta inte på):
${knownFacts.join('\n')}
${factsBlock}${masterBlock}
Dessa kontroller har problem. Skriv FÖR VARJE en rapport-text med tre delar:

${JSON.stringify(checkDescriptions, null, 2)}

Returnera JSON med varje check-key som nyckel — exakt dessa nycklar: ${keyList}
{
  "[check-key]": {
    "richRelevance": "1-3 meningar, nämn företagsnamnet (${meta.companyName}), förklara varför just DETTA företag påverkas.",
    "richSteps": "Numrerade steg (1. 2. 3.), max 6 steg, konkreta och handlingsbara. Markdown-format.",
    "richCodeExample": "Komplett, copy-paste-ready kod med företagets faktiska data. UTELÄMNA helt fält där data saknas — skriv ALDRIG ANPASSA-platshållare. null om checken inte lämpar sig för kodexempel."
  }
}

REGLER:
- Varje nyckel (${keyList}) MÅSTE finnas med och ha både richRelevance och richSteps ifyllda.
- Om en check har ett "data"-fält, ANVÄND den råa datan i din analys. Nämn specifika värden (t.ex. "Eniro har adressen Stampgatan 8 medan Hitta har Syster Estrids Gata 13").
- richRelevance: Kort, personligt, nämn ALLTID "${meta.companyName}" i texten
- richSteps: Numrerade 1-6 steg, varje steg en konkret handling. Skriv i imperativ form ("Lägg till...", "Skapa...", "Kontrollera...")
- richCodeExample: KRITISKT — använd ENDAST data som finns i "Företagsinformation" ovan. Om gatuadress, postnummer, e-post, image-URL, cuisine-typ eller annat värde INTE finns där: TA BORT FÄLTET HELT ur JSON/HTML/kod. SKRIV ALDRIG \`<!-- ANPASSA: ... -->\`, \`<!-- TODO -->\`, \`<DITT FÖRETAGSNAMN>\`, \`<PLACEHOLDER>\`, \`<ange ...>\`, \`<lägg till ...>\` eller liknande platshållare i paid-rapporten — de hör hemma i gratis-mallar, inte här.
- Inkludera ALDRIG aggregateRating eller review i kodexempel — Googles riktlinjer förbjuder self-serving review-markup.
- Om en Google Maps-länk finns i Företagsinformation ovan: använd den EXAKT som sameAs-värde. Konstruera ALDRIG en egen Google Maps-URL av Place ID:t (t.ex. \`?cid=<Place ID>\`) — Place ID är inte samma sak som ett cid, och en sådan länk blir trasig.
- KONKRET EXEMPEL: om openingHours saknas i META → utelämna hela "openingHoursSpecification"-arrayen, inkludera den INTE med ANPASSA-värden. Om "image" saknas → utelämna "image"-fältet helt. Om "servesCuisine" saknas → utelämna det.
- Bättre att lämna ett kort men 100% korrekt schema än ett långt med fyllnadstexter.
${masterRules.length > 0 ? masterRules.join('\n') + '\n' : ''}${groundingRules}- Svara ENBART med giltig JSON — inga kodblock-markeringar, ingen text utanför JSON
- Alla texter på svenska`

  return { systemPrompt, userPrompt }
}
