/**
 * reportWriter.ts — Enriches bad/warning checks with tailored Pro-generated content
 *
 * Runs 3-4 parallel Gemini 2.5 Pro calls (batched by category) to produce:
 *   - richRelevance: "Varför spelar det roll för [Företag]?"
 *   - richSteps: "Steg för steg" (numbered markdown)
 *   - richCodeExample: Company-specific, copy-paste-ready code
 *
 * Designed to run in parallel with Pro synthesis — adds zero extra latency.
 */

import type { CheckResult, CheckKey } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RichCheckData {
  richRelevance: string | null
  richSteps: string | null
  richCodeExample: string | null
}

interface BusinessMeta {
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
  schemaTypes?: string[]
  socialLinks?: string[]
  title?: string | null
  h1?: string | null
}

type CallOpenRouterFn = (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown?: boolean,
  maxTokensOverride?: number,
) => Promise<any>

// ---------------------------------------------------------------------------
// Category batching config
// ---------------------------------------------------------------------------

const BATCH_CATEGORIES: string[][] = [
  ['technical'],
  ['local'],
  ['ai-readiness'],
  ['content', 'ai-test', 'gbp'],
]

const PRO_MODEL = 'google/gemini-2.5-pro-preview-03-25'

/**
 * Defensiv tvätt av Pro-genererad richCodeExample. Pro envisas ibland med att
 * skriva `<!-- ANPASSA: ... -->`-platshållare i kod trots att vi instruerat
 * den att utelämna fält där data saknas. Vi rensar bort sådana rader så
 * paid-koden inte innehåller dem.
 *
 * - Tar bort hela rader som innehåller platshållare-mönster.
 * - Städar trailing commas som blir kvar.
 * - Returnerar null om det knappt finns något substantiellt kvar.
 */
function sanitizeCodeExample(code: string | null): string | null {
  if (!code) return null
  const placeholderRegex = /<!--\s*(ANPASSA|TODO|FYLL)[\s\S]*?-->|<(DITT|DIN|ANGE|LÄGG|PLACEHOLDER|FÖRETAGSNAMN|TJÄNST|STAD|GATUADRESS|POSTNUMMER|TELEFONNUMMER|DOMÄN|FACEBOOKSIDA|INSTAGRAMKONTO|LATITUD|LONGITUD|EPOST|ORGNUMMER|PERSONNAMN|VERKSAMHETSTYP|BESKRIVNING|TITEL|NY[ -]?FRÅGA|NY[ -]?SVAR|SVAR \d|FRÅGA \d|KORT|ERBJUDANDE|SPECIALITET|ANTAL|EXAMPLE|YOUR_)[^>]*>/i

  const lines = code.split('\n')
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
// Main export
// ---------------------------------------------------------------------------

export async function enrichChecksWithReportWriter(
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
): Promise<Record<string, RichCheckData>> {
  // Only enrich bad/warning checks (not ok, notMeasured, notApplicable, synthesis)
  const enrichable = checks.filter(
    c => (c.status === 'bad' || c.status === 'warning') && c.key !== 'synthesis'
  )

  if (enrichable.length === 0) return {}

  // Build category lookup
  const categoryByKey = new Map<string, string>()
  for (const entry of CHECK_REGISTRY) {
    categoryByKey.set(entry.key, entry.category)
  }

  // Group checks into batches
  const batches: { categories: string[]; checks: CheckResult[] }[] = []
  for (const cats of BATCH_CATEGORIES) {
    const catSet = new Set(cats)
    const batchChecks = enrichable.filter(c => catSet.has(categoryByKey.get(c.key) ?? ''))
    if (batchChecks.length > 0) {
      batches.push({ categories: cats, checks: batchChecks })
    }
  }

  // Run all batches in parallel
  const batchResults = await Promise.all(
    batches.map(batch => runBatch(batch.checks, meta, callOpenRouter))
  )

  // Merge all results into a single map
  const result: Record<string, RichCheckData> = {}
  for (const batchResult of batchResults) {
    for (const [key, data] of Object.entries(batchResult)) {
      result[key] = data
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-batch logic
// ---------------------------------------------------------------------------

async function runBatch(
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
): Promise<Record<string, RichCheckData>> {
  const systemPrompt = `Du är en senior svensk AI-sökningskonsult som skriver kundrapporter. Du skriver alltid på svenska. Dina texter är professionella, konkreta och handlingsbara.`

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
  if (meta.placeId) knownFacts.push(`- Google Place ID: ${meta.placeId}`)
  if (meta.primaryType) knownFacts.push(`- Google primaryType: ${meta.primaryType}`)
  if (typeof meta.googleRating === 'number') knownFacts.push(`- Google-betyg: ${meta.googleRating}/5 (${meta.reviewCount ?? 0} recensioner)`)
  if (meta.weekdayHours && meta.weekdayHours.length > 0) {
    knownFacts.push(`- Öppettider (Google):\n${meta.weekdayHours.map(h => `    ${h}`).join('\n')}`)
  }
  if (meta.schemaTypes && meta.schemaTypes.length > 0) knownFacts.push(`- Befintliga schema-typer på sajten: ${meta.schemaTypes.join(', ')}`)
  if (meta.socialLinks && meta.socialLinks.length > 0) knownFacts.push(`- Sociala länkar/sameAs: ${meta.socialLinks.join(', ')}`)
  if (meta.title) knownFacts.push(`- Sidans <title>: "${meta.title}"`)
  if (meta.h1) knownFacts.push(`- Sidans <h1>: "${meta.h1}"`)

  const userPrompt = `Företagsinformation (allt nedan är verifierad data — använd EXAKT dessa värden, hitta inte på):
${knownFacts.join('\n')}

Dessa kontroller har problem. Skriv FÖR VARJE en rapport-text med tre delar:

${JSON.stringify(checkDescriptions, null, 2)}

Returnera JSON med varje check-key som nyckel:
{
  "[check-key]": {
    "richRelevance": "1-3 meningar, nämn företagsnamnet (${meta.companyName}), förklara varför just DETTA företag påverkas.",
    "richSteps": "Numrerade steg (1. 2. 3.), max 6 steg, konkreta och handlingsbara. Markdown-format.",
    "richCodeExample": "Komplett, copy-paste-ready kod med företagets faktiska data. UTELÄMNA helt fält där data saknas — skriv ALDRIG ANPASSA-platshållare. null om checken inte lämpar sig för kodexempel."
  }
}

REGLER:
- Om en check har ett "data"-fält, ANVÄND den råa datan i din analys. Nämn specifika värden (t.ex. "Eniro har adressen Stampgatan 8 medan Hitta har Syster Estrids Gata 13").
- richRelevance: Kort, personligt, nämn ALLTID "${meta.companyName}" i texten
- richSteps: Numrerade 1-6 steg, varje steg en konkret handling. Skriv i imperativ form ("Lägg till...", "Skapa...", "Kontrollera...")
- richCodeExample: KRITISKT — använd ENDAST data som finns i "Företagsinformation" ovan. Om gatuadress, postnummer, e-post, image-URL, cuisine-typ eller annat värde INTE finns där: TA BORT FÄLTET HELT ur JSON/HTML/kod. SKRIV ALDRIG \`<!-- ANPASSA: ... -->\`, \`<!-- TODO -->\`, \`<DITT FÖRETAGSNAMN>\`, \`<PLACEHOLDER>\`, \`<ange ...>\`, \`<lägg till ...>\` eller liknande platshållare i paid-rapporten — de hör hemma i gratis-mallar, inte här.
- KONKRET EXEMPEL: om openingHours saknas i META → utelämna hela "openingHoursSpecification"-arrayen, inkludera den INTE med ANPASSA-värden. Om "image" saknas → utelämna "image"-fältet helt. Om "servesCuisine" saknas → utelämna det.
- Bättre att lämna ett kort men 100% korrekt schema än ett långt med fyllnadstexter.
- Svara ENBART med giltig JSON — inga kodblock-markeringar, ingen text utanför JSON
- Alla texter på svenska`

  try {
    const result = await callOpenRouter(
      PRO_MODEL,
      systemPrompt,
      userPrompt,
      60000,
      false, // JSON mode
      8000,
    )

    // Parse and validate the result
    const parsed: Record<string, RichCheckData> = {}
    for (const check of checks) {
      const data = result?.[check.key]
      if (data && typeof data === 'object') {
        parsed[check.key] = {
          richRelevance: typeof data.richRelevance === 'string' ? data.richRelevance : null,
          richSteps: typeof data.richSteps === 'string' ? data.richSteps : null,
          richCodeExample: sanitizeCodeExample(typeof data.richCodeExample === 'string' ? data.richCodeExample : null),
        }
      }
    }
    return parsed
  } catch (err: any) {
    console.error(`[ReportWriter] Batch failed:`, err.message)
    return {}
  }
}
