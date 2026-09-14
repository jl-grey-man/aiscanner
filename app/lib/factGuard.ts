/**
 * factGuard.ts — Förankra AI-texten i premiumrapporten i verifierade fakta (Audit #6)
 *
 * Syntesen och Report Writer hittade på fakta: fel öppettider, påhittade
 * menyer/drinkar och priser, FAQ-svar och undersidor som inte finns. Därför:
 *
 *   1. `buildVerifiedFacts()` samlar det vi faktiskt VET: telefon (Google +
 *      sajten), öppettider (Places-perioder → weekdayDescriptions → sajtens
 *      eget schema), kända interna URL:er (sitemap + interna länkar + skrapade
 *      sidor) och skrapat meny-/tjänsteinnehåll.
 *   2. `formatFactsForPrompt()` + `GROUNDING_RULES` ger prompterna fakta och ett
 *      uttryckligt förbud mot att hitta på.
 *   3. `groundReport()` är efterkontrollen: den går igenom richCodeExample,
 *      richSteps, richRelevance och synthesis.actionPlan/summary och
 *        - rättar telefonnummer som inte är kända (eller tar bort dem om inget är känt)
 *        - rättar öppettider som avviker från de verifierade (eller tar bort dem)
 *        - tar bort interna URL:er/sökvägar som aldrig hittades på sajten
 *        - tar bort MenuItem/pris i JSON-LD som inte finns i skrapat innehåll
 *      Allt som ändras loggas (`[FactCheck] ...`).
 */

import { toInternationalPhone, type OpeningPeriod } from './masterSchema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Öppettider per veckodag (0 = söndag … 6 = lördag). [] = stängt. Intervall "HH:MM-HH:MM". */
export type HoursByDay = Record<number, string[]>

export interface ServicePage {
  url: string
  h1: string
  text: string
}

export interface VerifiedFacts {
  /** Sajtens origin efter redirects, t.ex. "https://www.tvakanten.se". */
  origin: string
  /** Värdnamn utan www. */
  host: string
  /** Kända telefonnummer, det mest pålitliga (Google) först. */
  phones: string[]
  hoursByDay: HoursByDay | null
  hoursSource: 'Google' | 'sajtens schema' | null
  /** Normaliserade interna sökvägar som bevisligen finns (alltid minst "/"). */
  knownPaths: string[]
  /** Skrapade meny-/tjänstesidor (text max 800 tecken per sida). */
  servicePages: ServicePage[]
  /** FAQ-frågor som redan finns på sajten. */
  faqQuestions: string[]
  /** Gemener: all skrapad text — används för att förankra menyrätter och priser. */
  corpus: string
}

export interface ScrapedPageInput {
  url: string
  title?: string
  metaDescription?: string
  h1?: string
  h2s?: string[]
  bodyText?: string
  phones?: string[]
  internalLinks?: { paths?: string[] }
}

export interface VerifiedFactsInput {
  url: string
  pages?: ScrapedPageInput[]
  sitemapXml?: string | null
  placePhone?: string | null
  weekdayHours?: string[] | null
  openingPeriods?: OpeningPeriod[] | null
  schemaHours?: { dayOfWeek: string; opens: string; closes: string }[] | null
  faqQuestions?: string[]
  /** Övriga URL:er som bevisligen finns (t.ex. og:image, Places websiteUri). */
  extraUrls?: (string | null | undefined)[]
}

export type CorrectionKind = 'öppettider' | 'telefon' | 'url' | 'meny' | 'pris'

export interface Correction {
  field: string
  kind: CorrectionKind
  action: 'rättad' | 'borttagen'
  detail: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_SV = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const DAY_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

/** Standardfiler som får nämnas även om de inte hittades (de är ofta just det kunden ska skapa). */
const ALLOWED_PATHS = /^\/(robots\.txt|sitemap(_index)?\.xml|llms(-full)?\.txt|favicon\.ico|\.well-known(\/.*)?|wp-admin(\/.*)?|wp-login\.php)$/

const SERVICE_PATH_RE = /men[uy]|tj[aä]nst|behandling|pris|service|utbud|dryck|lunch|a-la-carte/i

/**
 * Signalerar att en sökväg i texten bara är ett EXEMPEL på en sida kunden ska
 * skapa — inte ett påstående om att sidan redan finns. GROUNDING_RULES säger
 * uttryckligen att sådana förslag ska formuleras med ord ("Skapa en ny
 * undersida, exempelvis /vanliga-fragor") — de ska få stå kvar. Kräver både ett
 * skapa-verb OCH ordet sida/undersida i SAMMA textbit (en mening eller kodrad).
 * Gäller bara bar text: en riktig <a href>/markdown-länk isoleras redan till
 * bara själva href-värdet innan unknownInternalRefs() anropas (se groundProse/
 * groundCodeLines), så en sådan länk matchar aldrig den här signalen och tas
 * fortfarande bort om sidan är okänd.
 */
const PAGE_CREATION_SIGNAL_RE = /\b(?:skapa|lägg\s+till|bygg|föreslå)\w*\b[\s\S]*?\b(?:ny\w*\s+)?(?:under)?sid\w*\b/iu

const MAX_KNOWN_PATHS = 2000
const PROMPT_MAX_URLS = 40

// ---------------------------------------------------------------------------
// Normalisering
// ---------------------------------------------------------------------------

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

/** "/Om-Oss/?a=1#x" → "/om-oss". Rot = "/". */
export function normalizePath(path: string): string {
  let p = path.split(/[?#]/)[0] || '/'
  try { p = decodeURI(p) } catch { /* behåll */ }
  p = p.toLowerCase().replace(/\/{2,}/g, '/')
  if (!p.startsWith('/')) p = '/' + p
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

/** Nationella siffror: "+46 31-313 33 36" → "0313133336". */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (/^\s*\+\s*46/.test(raw) || d.startsWith('0046')) d = '0' + d.replace(/^(00)?46/, '')
  return d
}

function hhmm(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null
  if (hour === 24 && minute !== 0) return null
  // 24:00 och 23:59 betyder midnatt i praktiken
  if (hour === 24 || (hour === 23 && minute === 59)) return '00:00'
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseClock(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?$/)
  if (!m) return null
  return hhmm(Number(m[1]), m[2] ? Number(m[2]) : 0)
}

// ---------------------------------------------------------------------------
// Öppettider
// ---------------------------------------------------------------------------

function emptyWeek(): HoursByDay {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
}

export function hoursFromPeriods(periods?: OpeningPeriod[] | null): HoursByDay | null {
  if (!Array.isArray(periods) || periods.length === 0) return null
  const week = emptyWeek()
  if (periods.length === 1 && !periods[0]?.close && periods[0]?.open?.day === 0 && periods[0].open.hour === 0) {
    for (let d = 0; d < 7; d++) week[d] = ['00:00-00:00']
    return week
  }
  for (const p of periods) {
    const day = p?.open?.day
    if (!Number.isInteger(day) || day < 0 || day > 6 || !p.close) return null
    const open = hhmm(p.open.hour, p.open.minute ?? 0)
    const close = hhmm(p.close.hour, p.close.minute ?? 0)
    if (!open || !close) return null
    week[day].push(`${open}-${close}`)
  }
  return week
}

/** Places `weekdayDescriptions` på svenska ("tisdag: 12:00–23:00", "måndag: Stängt"). Kräver alla 7 dagar. */
export function hoursFromWeekdayDescriptions(desc?: string[] | null): HoursByDay | null {
  if (!Array.isArray(desc) || desc.length === 0) return null
  const week: Partial<HoursByDay> = {}
  for (const raw of desc) {
    const line = raw.replace(/[\u00a0\u202f\u2009]/g, ' ')
    const m = line.match(/^\s*([a-zåäö]+)\s*:\s*(.+)$/i)
    if (!m) return null
    const day = DAY_SV.indexOf(m[1].toLowerCase())
    if (day === -1) return null
    const value = m[2].trim()
    if (/stängt/i.test(value)) { week[day] = []; continue }
    if (/dygnet runt/i.test(value)) { week[day] = ['00:00-00:00']; continue }
    const ranges: string[] = []
    for (const r of value.matchAll(/(\d{1,2}[:.]\d{2})\s*[–—-]\s*(\d{1,2}[:.]\d{2})/g)) {
      const open = parseClock(r[1])
      const close = parseClock(r[2])
      if (!open || !close) return null
      ranges.push(`${open}-${close}`)
    }
    if (ranges.length === 0) return null
    week[day] = ranges
  }
  for (let d = 0; d < 7; d++) if (!week[d]) return null
  return week as HoursByDay
}

export function hoursFromSchema(list?: { dayOfWeek: string; opens: string; closes: string }[] | null): HoursByDay | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const week = emptyWeek()
  for (const s of list) {
    const day = DAY_EN.indexOf(String(s.dayOfWeek).toLowerCase())
    const open = parseClock(s.opens)
    const close = parseClock(s.closes)
    if (day === -1 || !open || !close) return null
    week[day].push(`${open}-${close}`)
  }
  return week
}

const pretty = (range: string) => range.replace('-', '–')

/** Kompakt svensk text, måndag först: "måndag stängt, tisdag–onsdag 12:00–23:00, torsdag 12:00–00:00". */
export function formatHoursSv(week: HoursByDay): string {
  const groups: { days: number[]; value: string }[] = []
  for (const d of MONDAY_FIRST) {
    const value = week[d].length === 0 ? 'stängt' : week[d].map(pretty).join(', ')
    const last = groups[groups.length - 1]
    if (last && last.value === value) last.days.push(d)
    else groups.push({ days: [d], value })
  }
  return groups.map(g => {
    const days = g.days.length === 1 ? DAY_SV[g.days[0]] : `${DAY_SV[g.days[0]]}–${DAY_SV[g.days[g.days.length - 1]]}`
    return `${days} ${g.value}`
  }).join(', ')
}

/** Verifierade öppettider → schema.org openingHoursSpecification (grupperat på samma tider). */
export function hoursToSpecification(week: HoursByDay): Record<string, unknown>[] {
  const groups = new Map<string, number[]>()
  for (const d of MONDAY_FIRST) {
    for (const range of week[d]) groups.set(range, [...(groups.get(range) ?? []), d])
  }
  return [...groups.entries()].map(([range, days]) => {
    const [opens, closes] = range.split('-')
    return {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days.map(d => DAY_EN[d][0].toUpperCase() + DAY_EN[d].slice(1)),
      opens,
      closes: closes === '00:00' && opens === '00:00' ? '23:59' : closes,
    }
  })
}

function sameWeek(a: HoursByDay, b: HoursByDay): boolean {
  for (let d = 0; d < 7; d++) {
    if ([...a[d]].sort().join('|') !== [...b[d]].sort().join('|')) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Bygg fakta
// ---------------------------------------------------------------------------

export function extractSitemapUrls(xml?: string | null): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)]
    .map(m => m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim())
    .filter(Boolean)
}

export function buildVerifiedFacts(input: VerifiedFactsInput): VerifiedFacts {
  const pages = input.pages ?? []
  const baseUrl = new URL(pages[0]?.url || input.url)
  const host = stripWww(baseUrl.hostname)

  const paths = new Set<string>(['/'])
  const addUrl = (u: string | null | undefined) => {
    if (!u || paths.size >= MAX_KNOWN_PATHS) return
    try {
      const parsed = new URL(u, baseUrl.origin)
      if (stripWww(parsed.hostname) === host) paths.add(normalizePath(parsed.pathname))
    } catch { /* ogiltig URL */ }
  }
  addUrl(input.url)
  for (const u of extractSitemapUrls(input.sitemapXml)) addUrl(u)
  for (const page of pages) {
    addUrl(page.url)
    for (const p of page.internalLinks?.paths ?? []) addUrl(p)
  }
  for (const u of input.extraUrls ?? []) addUrl(u)

  const phones: string[] = []
  const seenDigits = new Set<string>()
  for (const p of [input.placePhone, ...pages.flatMap(pg => pg.phones ?? [])]) {
    if (!p || !p.trim()) continue
    const d = phoneDigits(p)
    if (d.length < 7 || seenDigits.has(d)) continue
    seenDigits.add(d)
    phones.push(p.trim())
  }

  let hoursByDay = hoursFromPeriods(input.openingPeriods) ?? hoursFromWeekdayDescriptions(input.weekdayHours)
  let hoursSource: VerifiedFacts['hoursSource'] = hoursByDay ? 'Google' : null
  if (!hoursByDay) {
    hoursByDay = hoursFromSchema(input.schemaHours)
    if (hoursByDay) hoursSource = 'sajtens schema'
  }

  const servicePages: ServicePage[] = pages
    .filter((pg, i) => i > 0 && SERVICE_PATH_RE.test(safePathname(pg.url)) && (pg.bodyText ?? '').trim().length > 0)
    .map(pg => ({ url: pg.url, h1: (pg.h1 ?? '').trim(), text: (pg.bodyText ?? '').slice(0, 800) }))

  const faqQuestions = [...new Set((input.faqQuestions ?? []).map(q => q.trim()).filter(Boolean))]
  const corpus = [
    ...pages.flatMap(pg => [pg.title, pg.metaDescription, pg.h1, ...(pg.h2s ?? []), pg.bodyText]),
    ...faqQuestions,
  ].filter(Boolean).join('\n').toLowerCase()

  return {
    origin: baseUrl.origin,
    host,
    phones,
    hoursByDay,
    hoursSource,
    knownPaths: [...paths],
    servicePages,
    faqQuestions,
    corpus,
  }
}

function safePathname(u: string): string {
  try { return new URL(u).pathname } catch { return '' }
}

// ---------------------------------------------------------------------------
// Prompt-delar
// ---------------------------------------------------------------------------

/** Faktablock för syntes- och Report Writer-prompterna. */
export function formatFactsForPrompt(facts: VerifiedFacts, opts: { includeContact?: boolean } = {}): string {
  const lines: string[] = ['VERIFIERADE FAKTA FRÅN SAJTEN OCH GOOGLE (det enda du får påstå om företaget):']
  if (opts.includeContact !== false) {
    lines.push(`- Telefon: ${facts.phones.length > 0 ? facts.phones.join(', ') : 'saknas — skriv inget telefonnummer'}`)
    lines.push(facts.hoursByDay
      ? `- Öppettider (${facts.hoursSource}): ${formatHoursSv(facts.hoursByDay)}`
      : '- Öppettider: saknas — skriv inga öppettider')
  }
  const subpages = facts.knownPaths.filter(p => p !== '/')
  if (subpages.length > 0) {
    const shown = subpages.slice(0, PROMPT_MAX_URLS).map(p => `${facts.origin}${p}`)
    lines.push(`- Befintliga undersidor (sitemap/interna länkar)${subpages.length > shown.length ? `, ${shown.length} av ${subpages.length}` : ''}:\n${shown.map(u => `    ${u}`).join('\n')}`)
  } else {
    lines.push(`- Befintliga undersidor: inga hittades — länka bara till startsidan ${facts.origin}/`)
  }
  if (facts.servicePages.length > 0) {
    lines.push('- Skrapat meny-/tjänsteinnehåll (max 800 tecken per sida):')
    for (const sp of facts.servicePages) {
      lines.push(`    [${sp.url}]${sp.h1 ? ` ${sp.h1}:` : ''} ${sp.text.replace(/\s+/g, ' ')}`)
    }
  } else {
    lines.push('- Skrapat meny-/tjänsteinnehåll: inget — inga rätter, drycker, behandlingar eller priser är kända')
  }
  lines.push(facts.faqQuestions.length > 0
    ? `- FAQ-frågor som redan finns på sajten: ${facts.faqQuestions.join(' | ')}`
    : '- FAQ-frågor på sajten: inga')
  return lines.join('\n')
}

/** Uttryckligt förbud mot påhittade fakta — samma regler i syntes och Report Writer. */
export const GROUNDING_RULES = [
  '- HITTA ALDRIG PÅ fakta: inga påhittade öppettider, telefonnummer, priser, menyrätter, drycker, behandlingar/tjänster, FAQ-svar eller URL:er. Använd bara värdena i VERIFIERADE FAKTA och företagsinformationen.',
  '- Öppettider: återge dem exakt per dag som de står i fakta — slå aldrig ihop dagar som har olika tider. Saknas de: nämn inga tider.',
  '- URL:er och länkar: använd bara startsidan och undersidorna i listan. Föreslå nya sidor med ord ("skapa en undersida med era priser"), aldrig som en påhittad sökväg eller länk.',
  '- Menu/MenuItem/Offer/priser: bara rätter, drycker, tjänster och priser som står i det skrapade innehållet. Finns inget: ge ingen sådan kod — beskriv i stegen vilka uppgifter kunden själv ska fylla i.',
  '- FAQ: svar får bara bygga på verifierade fakta (öppettider, adress, telefon, skrapat innehåll). Övriga relevanta frågor listas i stegen som frågor kunden själv ska besvara — skriv aldrig svaret åt dem.',
].join('\n')

// ---------------------------------------------------------------------------
// Efterkontroll — text
// ---------------------------------------------------------------------------

const L = '\\p{L}'
const DAY_WORD = `(?:måndag(?:ar|en)?|tisdag(?:ar|en)?|onsdag(?:ar|en)?|torsdag(?:ar|en)?|fredag(?:ar|en)?|lördag(?:ar|en)?|söndag(?:ar|en)?|mån|tis|ons|tors?|fre|lör|sön|vardagar|helger(?:na)?|helgen|alla dagar|varje dag|dagligen)`
const DAY_SPEC = `${DAY_WORD}(?:\\s*(?:[-–—]|till)\\s*${DAY_WORD}|(?:\\s*(?:,|och|&)\\s*${DAY_WORD})*)`
const TIME_SPEC = `(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:[-–—]|till|och)\\s*(\\d{1,2})(?:[:.](\\d{2}))?(?!\\d)`
const HOURS_ITEM_RE = new RegExp(
  `(?<![${L}])(${DAY_SPEC})(?![${L}])\\s*:?\\s*(?:(?:kl\\.?|klockan|öppet|mellan|från)\\s*)*(?:${TIME_SPEC}|(stängt|stängd)(?![${L}]))`,
  'giu',
)
const DAY_WORD_RE = new RegExp(DAY_WORD, 'giu')

function dayIndex(word: string): number[] {
  const w = word.toLowerCase()
  if (w === 'vardagar') return [1, 2, 3, 4, 5]
  if (w.startsWith('helg')) return [6, 0]
  if (w === 'alla dagar' || w === 'varje dag' || w === 'dagligen') return [0, 1, 2, 3, 4, 5, 6]
  const prefixes = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']
  const i = prefixes.findIndex(p => w.startsWith(p))
  return i === -1 ? [] : [i]
}

function daysOf(spec: string): number[] {
  const words = [...spec.matchAll(DAY_WORD_RE)].map(m => m[0])
  if (words.length === 2 && /[-–—]|till/.test(spec.replace(words[0], '').replace(words[1], ''))) {
    const from = dayIndex(words[0])[0]
    const to = dayIndex(words[1])[0]
    if (from === undefined || to === undefined) return []
    const out: number[] = []
    const a = MONDAY_FIRST.indexOf(from), b = MONDAY_FIRST.indexOf(to)
    if (b < a) return []
    for (let i = a; i <= b; i++) out.push(MONDAY_FIRST[i])
    return out
  }
  return [...new Set(words.flatMap(dayIndex))]
}

interface HoursClaim { start: number; end: number; valid: boolean }

function findHoursClaims(text: string, truth: HoursByDay | null): HoursClaim[] {
  const claims: HoursClaim[] = []
  HOURS_ITEM_RE.lastIndex = 0
  for (const m of text.matchAll(HOURS_ITEM_RE)) {
    const days = daysOf(m[1])
    if (days.length === 0) continue
    let valid = false
    if (truth) {
      if (m[6]) {
        valid = days.every(d => truth[d].length === 0)
      } else {
        const open = hhmm(Number(m[2]), m[3] ? Number(m[3]) : 0)
        const close = hhmm(Number(m[4]), m[5] ? Number(m[5]) : 0)
        if (!open || !close) continue // inte en tid (t.ex. "2-3 veckor")
        valid = days.every(d => truth[d].includes(`${open}-${close}`))
      }
    }
    claims.push({ start: m.index!, end: m.index! + m[0].length, valid })
  }
  return claims
}

/** Slår ihop påståenden som hänger ihop ("tisdag 12–23, fredag 12–01 och söndag 13–23. Måndag stängt"). */
function chainClaims(text: string, claims: HoursClaim[]): HoursClaim[] {
  const chains: HoursClaim[] = []
  for (const c of claims) {
    const last = chains[chains.length - 1]
    if (last && /^[\s,;.&]*(?:och|samt)?[\s,;.&]*$/i.test(text.slice(last.end, c.start)) && !text.slice(last.end, c.start).includes('\n')) {
      last.end = c.end
      last.valid = last.valid && c.valid
    } else {
      chains.push({ ...c })
    }
  }
  return chains
}

const PHONE_RE = /(?<![\d\w+])(?:\+46|0046|0)\s?\(?[0-9]{1,3}\)?[\s-]{0,3}[0-9]{2,3}[\s-]{0,3}[0-9]{2,3}(?:[\s-]{0,3}[0-9]{2,3})?(?![\d])/g

function phoneIsKnown(found: string, facts: VerifiedFacts): boolean {
  const d = phoneDigits(found)
  return facts.phones.some(p => phoneDigits(p) === d)
}

function looksLikePhone(found: string): boolean {
  const n = phoneDigits(found).length
  return n >= 8 && n <= 11
}

/** Den kända telefonen i samma stil som det påhittade numret (internationellt om +46 användes). */
function replacementPhone(found: string, facts: VerifiedFacts): string {
  const primary = facts.phones[0]
  return /^\s*(\+|00)/.test(found) ? toInternationalPhone(primary) : primary
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pathIsKnown(path: string, facts: VerifiedFacts): boolean {
  const p = normalizePath(path)
  return ALLOWED_PATHS.test(p) || facts.knownPaths.includes(p)
}

/** Interna URL:er (absoluta mot sajtens värd) och sökvägar i en textbit som inte finns på sajten. */
function unknownInternalRefs(text: string, facts: VerifiedFacts): string[] {
  const out: string[] = []
  // Ett uttryckligt "skapa en ny sida"-förslag gör hela textbiten till ett exempel,
  // inte ett påstående — bar-text-sökvägar i den flaggas då inte som okända.
  if (PAGE_CREATION_SIGNAL_RE.test(text)) return out

  const hostRe = new RegExp(`(?<![\\w.-])(?:https?:\\/\\/)?(?:www\\.)?${escapeRe(facts.host)}(\\/[^\\s"'<>)\\]\`]*)?`, 'gi')
  for (const m of text.matchAll(hostRe)) {
    const path = (m[1] ?? '/').replace(/[.,;:!?]+$/, '')
    if (!pathIsKnown(path, facts)) out.push(m[0].replace(/[.,;:!?]+$/, ''))
  }
  const withoutHost = text.replace(hostRe, ' ')
  const relRe = /(?:(?:href|src|action)\s*=\s*["']|\]\(|(?<=^|[\s(`"'“]))(\/(?!\/)[\p{L}\d][\p{L}\d\-_.~%/]*)/gu
  for (const m of withoutHost.matchAll(relRe)) {
    const path = m[1].replace(/[.,;:!?]+$/, '')
    if (!pathIsKnown(path, facts)) out.push(path)
  }
  return out
}

interface Ctx { field: string; log: Correction[] }

/** Rättning till hela veckans öppettider är bara rimlig när texten faktiskt handlar om öppettider (inte t.ex. lunchtider). */
const HOURS_CONTEXT_RE = /öppe[tn]|öppettid|tider|stäng|opening/i

function isOpeningHoursContext(text: string, start: number): boolean {
  return HOURS_CONTEXT_RE.test(text.slice(Math.max(0, start - 80), start))
}

/** Rättar öppettider och telefon i en textbit där rättning är säker. */
function correctInPlace(text: string, facts: VerifiedFacts, ctx: Ctx): string {
  let out = text
  if (facts.hoursByDay) {
    const verified = formatHoursSv(facts.hoursByDay)
    const chains = chainClaims(out, findHoursClaims(out, facts.hoursByDay)).filter(c => !c.valid && isOpeningHoursContext(out, c.start))
    for (const c of [...chains].reverse()) {
      ctx.log.push({ field: ctx.field, kind: 'öppettider', action: 'rättad', detail: `"${out.slice(c.start, c.end)}" → "${verified}"` })
      out = out.slice(0, c.start) + verified + out.slice(c.end)
    }
  }
  if (facts.phones.length > 0) {
    out = out.replace(PHONE_RE, (found) => {
      if (!looksLikePhone(found) || phoneIsKnown(found, facts)) return found
      const repl = replacementPhone(found, facts)
      ctx.log.push({ field: ctx.field, kind: 'telefon', action: 'rättad', detail: `"${found}" → "${repl}"` })
      return repl
    })
  }
  return out
}

/** Skäl att ta bort en mening/rad som inte går att rätta, eller null. */
function removalReason(text: string, facts: VerifiedFacts): { kind: CorrectionKind; detail: string } | null {
  const claim = findHoursClaims(text, facts.hoursByDay).find(c => !c.valid)
  if (claim) {
    const what = facts.hoursByDay ? 'tider som avviker från verifierade öppettider' : 'overifierade öppettider'
    return { kind: 'öppettider', detail: `${what} "${text.slice(claim.start, claim.end)}"` }
  }
  if (facts.phones.length === 0) {
    const phone = [...text.matchAll(PHONE_RE)].map(m => m[0]).find(looksLikePhone)
    if (phone) return { kind: 'telefon', detail: `okänt telefonnummer "${phone}"` }
  }
  const refs = unknownInternalRefs(text, facts)
  if (refs.length > 0) return { kind: 'url', detail: `okänd intern URL ${refs.join(', ')}` }
  return null
}

/** Prosa: rätta i text, gör om länkar till okända sidor till ren text, ta bort meningar som inte går att rätta. */
export function groundProse(text: string, facts: VerifiedFacts, ctx: Ctx): string {
  let out = correctInPlace(text, facts, ctx)
  // [text](okänd intern länk) → text
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    if (unknownInternalRefs(` ${href} `, facts).length === 0) return whole
    ctx.log.push({ field: ctx.field, kind: 'url', action: 'borttagen', detail: `länk ${href} (texten "${label}" behölls)` })
    return label
  })

  const lines = out.split('\n')
  const kept: ListLine[] = []
  let droppedListItem = false
  for (const line of lines) {
    const prefix = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)?/)?.[0] ?? ''
    const body = line.slice(prefix.length)
    const sentences = body.split(/(?<=[.!?])\s+(?=[\p{Lu}*"„“(])/u)
    const keptSentences = sentences.filter(s => {
      const reason = removalReason(s, facts)
      if (!reason) return true
      ctx.log.push({ field: ctx.field, kind: reason.kind, action: 'borttagen', detail: `${reason.detail} i "${s.trim().slice(0, 160)}"` })
      return false
    })
    if (body.trim() && keptSentences.length === 0) {
      if (/^\s*\d+[.)]\s/.test(prefix)) {
        droppedListItem = true
        kept.push({ text: line, dropped: true })
      }
      continue
    }
    kept.push({ text: prefix + keptSentences.join(' '), dropped: false })
  }
  if (!droppedListItem) return kept.map(l => l.text).join('\n')
  return renumberLists(kept).join('\n')
}

interface ListLine { text: string; dropped: boolean }

/**
 * Numrerar om numrerade listor efter att steg tagits bort (1, 3, 4 → 1, 2, 3).
 * Borttagna steg tar inget nummer men sätter listans startnummer (2, 3 kvar av 1–3 → 1, 2).
 */
function renumberLists(lines: ListLine[]): string[] {
  const next = new Map<number, number>()
  const out: string[] = []
  for (const { text, dropped } of lines) {
    const m = text.match(/^(\s*)(\d+)([.)])(\s+)/)
    if (!m) {
      // En ny, icke-indragen textrad (t.ex. en rubrik) avslutar listan
      if (text.trim() && !/^\s/.test(text)) next.clear()
      out.push(text)
      continue
    }
    const indent = m[1].length
    for (const k of [...next.keys()]) if (k > indent) next.delete(k)
    const n = next.get(indent) ?? Number(m[2])
    if (dropped) {
      next.set(indent, n)
      continue
    }
    next.set(indent, n + 1)
    out.push(`${m[1]}${n}${m[3]}${m[4]}${text.slice(m[0].length)}`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Efterkontroll — JSON-LD (strukturellt)
// ---------------------------------------------------------------------------

const URL_KEYS = new Set(['url', '@id', 'href', 'sameAs', 'image', 'logo', 'hasMenu', 'menu', 'mainEntityOfPage', 'contentUrl', 'target', 'urlTemplate', 'photo', 'item'])
const META_KEYS = new Set(['@type', '@context', '@id'])

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type']
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string').map(x => x.toLowerCase())
}

function priceGrounded(price: unknown, facts: VerifiedFacts): boolean {
  const s = String(price ?? '').trim().replace(/[.,]00$/, '')
  if (!/\d/.test(s)) return true
  return new RegExp(`(?<!\\d)${escapeRe(s)}(?!\\d)`).test(facts.corpus)
}

function textGrounded(name: unknown, facts: VerifiedFacts): boolean {
  const s = String(name ?? '').trim().toLowerCase()
  return s.length >= 2 && facts.corpus.includes(s)
}

function specToWeek(spec: unknown): HoursByDay | null {
  const list = (Array.isArray(spec) ? spec : [spec]).filter(isObj)
  if (list.length === 0) return null
  const week = emptyWeek()
  for (const s of list) {
    const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).map(d => DAY_EN.indexOf(String(d ?? '').split('/').pop()!.toLowerCase()))
    const open = parseClock(String(s.opens ?? ''))
    const close = parseClock(String(s.closes ?? ''))
    if (!open || !close || days.some(d => d === -1)) return null
    for (const d of days) week[d].push(`${open}-${close}`)
  }
  return week
}

/** Returnerar undefined om noden ska tas bort. */
function groundJsonValue(value: unknown, key: string | null, facts: VerifiedFacts, ctx: Ctx): unknown {
  if (Array.isArray(value)) {
    const out = value.map(v => groundJsonValue(v, key, facts, ctx)).filter(v => v !== undefined)
    return out.length === 0 && value.length > 0 ? undefined : out
  }
  if (typeof value === 'string') {
    if (key === 'telephone' || key === 'faxNumber') {
      if (phoneIsKnown(value, facts)) return value
      if (facts.phones.length > 0) {
        const repl = replacementPhone(value, facts)
        ctx.log.push({ field: ctx.field, kind: 'telefon', action: 'rättad', detail: `${key} "${value}" → "${repl}"` })
        return repl
      }
      ctx.log.push({ field: ctx.field, kind: 'telefon', action: 'borttagen', detail: `${key} "${value}"` })
      return undefined
    }
    if (key && URL_KEYS.has(key)) {
      const refs = unknownInternalRefs(value, facts)
      if (refs.length === 0) return value
      ctx.log.push({ field: ctx.field, kind: 'url', action: 'borttagen', detail: `${key} ${refs.join(', ')}` })
      return undefined
    }
    const grounded = groundProse(value, facts, ctx)
    return grounded.trim() ? grounded : undefined
  }
  if (!isObj(value)) return value

  const types = typesOf(value)
  if (types.includes('menuitem') && !textGrounded(value.name, facts)) {
    ctx.log.push({ field: ctx.field, kind: 'meny', action: 'borttagen', detail: `MenuItem "${String(value.name ?? '')}" finns inte i skrapat innehåll` })
    return undefined
  }
  if ('price' in value && !priceGrounded(value.price, facts)) {
    ctx.log.push({ field: ctx.field, kind: 'pris', action: 'borttagen', detail: `pris "${String(value.price)}" finns inte i skrapat innehåll` })
    return undefined
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === 'openingHoursSpecification' || k === 'openingHours') {
      const claimed = k === 'openingHoursSpecification' ? specToWeek(v) : null
      if (facts.hoursByDay && claimed && sameWeek(claimed, facts.hoursByDay)) { out[k] = v; continue }
      if (facts.hoursByDay) {
        out.openingHoursSpecification = hoursToSpecification(facts.hoursByDay)
        ctx.log.push({ field: ctx.field, kind: 'öppettider', action: 'rättad', detail: `${k} ${JSON.stringify(v).slice(0, 160)} → verifierade tider (${facts.hoursSource})` })
      } else {
        ctx.log.push({ field: ctx.field, kind: 'öppettider', action: 'borttagen', detail: `${k} utan verifierad källa` })
      }
      continue
    }
    if (k === 'priceRange' && !priceGrounded(v, facts)) {
      ctx.log.push({ field: ctx.field, kind: 'pris', action: 'borttagen', detail: `priceRange "${String(v)}"` })
      continue
    }
    const g = groundJsonValue(v, k, facts, ctx)
    if (g !== undefined) out[k] = g
  }

  // Frågor utan svar, menysektioner utan rätter och tomma noder är meningslösa.
  if ('acceptedAnswer' in value && !('acceptedAnswer' in out)) return undefined
  for (const listKey of ['hasMenuItem', 'hasMenuSection']) {
    if (listKey in value && !(listKey in out) && !['hasMenuItem', 'hasMenuSection'].some(k => k in out)) return undefined
  }
  if (Object.keys(value).some(k => !META_KEYS.has(k)) && Object.keys(out).every(k => META_KEYS.has(k))) return undefined
  return out
}

/** undefined = inte JSON. null = allt togs bort. */
function groundJsonText(text: string, facts: VerifiedFacts, ctx: Ctx): string | null | undefined {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return undefined }
  const grounded = groundJsonValue(parsed, null, facts, ctx)
  return grounded === undefined ? null : JSON.stringify(grounded, null, 2)
}

// ---------------------------------------------------------------------------
// Efterkontroll — kod och markdown
// ---------------------------------------------------------------------------

/** Kod som inte är JSON: rätta tider/telefon, ta bort <a> till okända sidor och rader som inte går att rätta. */
function groundCodeLines(code: string, facts: VerifiedFacts, ctx: Ctx): string {
  let out = correctInPlace(code, facts, ctx)
  out = out.replace(/(<li\b[^>]*>\s*)?<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>(\s*<\/li>)?/gi,
    (whole: string, _li: string | undefined, href: string) => {
      if (unknownInternalRefs(`href="${href}"`, facts).length === 0) return whole
      ctx.log.push({ field: ctx.field, kind: 'url', action: 'borttagen', detail: `<a href="${href}">` })
      return ''
    })
  const kept: string[] = []
  for (const line of out.split('\n')) {
    const reason = removalReason(line, facts)
    if (reason) {
      ctx.log.push({ field: ctx.field, kind: reason.kind, action: 'borttagen', detail: `${reason.detail} (rad "${line.trim().slice(0, 160)}")` })
      continue
    }
    kept.push(line)
  }
  return kept.join('\n').replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
}

const JSON_LD_BLOCK_RE = /(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi

/** Efterkontroll av ett kodblock (JSON-LD, JSON eller HTML). Returnerar null om inget substantiellt återstår. */
export function groundCode(code: string | null | undefined, facts: VerifiedFacts, ctx: Ctx): string | null {
  if (!code || !code.trim()) return code ?? null
  let result: string
  if (/<script[^>]*type=["']application\/ld\+json["']/i.test(code)) {
    const parts: string[] = []
    let last = 0
    for (const m of code.matchAll(JSON_LD_BLOCK_RE)) {
      parts.push(groundCodeLines(code.slice(last, m.index), facts, ctx))
      const grounded = groundJsonText(m[2].trim(), facts, ctx)
      if (grounded === undefined) parts.push(m[1] + groundCodeLines(m[2], facts, ctx) + m[3])
      else if (grounded !== null) parts.push(`${m[1]}\n${grounded}\n${m[3]}`)
      last = m.index! + m[0].length
    }
    parts.push(groundCodeLines(code.slice(last), facts, ctx))
    result = parts.join('')
  } else {
    const grounded = /^\s*[[{]/.test(code) ? groundJsonText(code.trim(), facts, ctx) : undefined
    result = grounded === undefined ? groundCodeLines(code, facts, ctx) : grounded ?? ''
  }
  result = result.replace(/,(\s*[}\]])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()
  if (result.replace(/<\/?script[^>]*>|[\s{}[\],"':]/g, '').length < 10) return null
  return result
}

/** Efterkontroll av markdown (prosa + kodblock inom ```-fences). */
export function groundMarkdown(md: string | null | undefined, facts: VerifiedFacts, ctx: Ctx): string | null {
  if (!md) return md ?? null
  const out: string[] = []
  let last = 0
  for (const m of md.matchAll(/^([ \t]*)```([^\n`]*)\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm)) {
    out.push(groundProse(md.slice(last, m.index), facts, ctx))
    const indent = m[1]
    const inner = m[3].split('\n').map(l => (l.startsWith(indent) ? l.slice(indent.length) : l)).join('\n')
    const grounded = groundCode(inner, facts, ctx)
    if (grounded) out.push(`${indent}\`\`\`${m[2]}\n${grounded.split('\n').map(l => indent + l).join('\n')}\n${indent}\`\`\``)
    last = m.index! + m[0].length
  }
  out.push(groundProse(md.slice(last), facts, ctx))
  const result = out.join('').replace(/\n{3,}/g, '\n\n').trim()
  return result || null
}

// ---------------------------------------------------------------------------
// Hela rapporten
// ---------------------------------------------------------------------------

export interface GroundableCheck {
  key: string
  richRelevance?: string | null
  richSteps?: string | null
  richCodeExample?: string | null
}

export interface GroundableSynthesis {
  actionPlan: string
  summary: string
}

/**
 * Kör efterkontrollen på premiumrapportens AI-text (muterar) och loggar varje
 * rättning/borttagning. Returnerar listan med ändringar.
 */
export function groundReport(
  checks: GroundableCheck[],
  synthesis: GroundableSynthesis | null,
  facts: VerifiedFacts,
): Correction[] {
  const log: Correction[] = []
  for (const check of checks) {
    if (check.richCodeExample) check.richCodeExample = groundCode(check.richCodeExample, facts, { field: `${check.key}.richCodeExample`, log })
    if (check.richSteps) check.richSteps = groundMarkdown(check.richSteps, facts, { field: `${check.key}.richSteps`, log })
    if (check.richRelevance) check.richRelevance = groundMarkdown(check.richRelevance, facts, { field: `${check.key}.richRelevance`, log })
  }
  if (synthesis) {
    synthesis.actionPlan = groundMarkdown(synthesis.actionPlan, facts, { field: 'synthesis.actionPlan', log }) ?? synthesis.actionPlan
    synthesis.summary = groundMarkdown(synthesis.summary, facts, { field: 'synthesis.summary', log }) ?? synthesis.summary
  }
  for (const c of log) console.warn(`[FactCheck] ${c.field}: ${c.kind} ${c.action} — ${c.detail}`)
  console.log(`[FactCheck] ${log.length} ändringar (${log.filter(c => c.action === 'rättad').length} rättade, ${log.filter(c => c.action === 'borttagen').length} borttagna)`)
  return log
}
