/**
 * competitorComparison.ts — Audit #9 (konkurrentdelen), paid-only.
 *
 * Gratisrapportens låsta sektion lovar att vi "jämför er AI-synlighet med era tre
 * största konkurrenter baserat på samma kontroller". Här scannas därför topp 3
 * närliggande konkurrenter (Places Nearby, med egen webbplats) med EXAKT samma
 * scrapers som huvudscanningen (scrapeWebsite + scrapeEnhanced, båda via safeFetch)
 * och bedöms med samma logik som checkBuilder — inga LLM-anrop.
 *
 * Rättvisa: både "ni" och konkurrenterna bedöms med samma deterministiska funktion
 * (`evaluateComparisonStatuses`), så jämförelsen är äpplen mot äpplen. För de tre
 * kontroller som i huvudrapporten bedöms av Flash (ogTags, llmsTxt, faqSchema)
 * används en deterministisk ersättare som följer Flash-promptens egna REGLER — men
 * bara det som går att avgöra i kod (finns/saknas), aldrig kvalitetsomdömen.
 */

import type { CheckKey, CheckResult, CompetitorComparisonData } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'
import { buildCheckResults } from './checkBuilder'
import type { ScrapedData } from './scraper'
import { scrapeWebsite } from './scraper'
import type { EnhancedData } from './enhancedScraper'
import { scrapeEnhanced } from './enhancedScraper'
import type { DirectoryResult } from './directoryChecker'
import type { NearbyCompetitor } from './places'

type Status = CheckResult['status']

/**
 * Kontroller som avgörs deterministiskt ur skrapad data (CHECK_REGISTRY-ordning).
 * Utelämnade med flit: checks som kräver LLM-omdöme (aiCrawlers, socialPresence,
 * hreflang, contentDepth, serviceSchema, eatSignals), externa API:er (cwv,
 * directories, napConsistency, openingHours, aiMentions, gbp …) samt dubbletter
 * (localSubtype/schemaAny/jsonLd mäter samma sak som localBusiness på startsidan).
 */
export const COMPARISON_KEYS: CheckKey[] = [
  'https',
  'robotsTxt',
  'sitemap',
  'llmsTxt',
  'canonical',
  'ogTags',
  'phone',
  'googleMaps',
  'localBusiness',
  'faqSchema',
  'semanticHtml',
  'h1',
  'title',
  'metaDescription',
]

export const MAX_COMPETITOR_SCANS = 3
export const COMPETITOR_SCAN_TIMEOUT_MS = 25_000

/** Svenska "har …"-fraser för sammanfattningen till syntesprompten. */
const HAS_PHRASE: Record<string, string> = {
  https: 'HTTPS',
  robotsTxt: 'en robots.txt',
  sitemap: 'en sitemap.xml',
  llmsTxt: 'en llms.txt-fil',
  canonical: 'en canonical-tagg',
  ogTags: 'kompletta Open Graph-taggar',
  phone: 'telefonnummer synligt på startsidan',
  googleMaps: 'en Google Maps-inbäddning',
  localBusiness: 'LocalBusiness-schema',
  faqSchema: 'FAQ-schema',
  semanticHtml: 'semantisk HTML (main + nav)',
  h1: 'en H1-rubrik',
  title: 'en title-tagg',
  metaDescription: 'en metabeskrivning',
}

/**
 * Plattformar som ofta står som "webbplats" i Google-profilen men inte är
 * företagets egen sajt — att scanna dem skulle mäta Facebooks/Bokadirekts markup.
 */
const PLATFORM_HOSTS = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'youtube.com',
  'twitter.com', 'x.com', 'linktr.ee', 'bokadirekt.se', 'tripadvisor.com',
  'tripadvisor.se', 'foodora.se', 'wolt.com', 'thefork.se', 'google.com', 'g.page',
]

function normHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function isPlatformHost(host: string): boolean {
  const h = normHost(host)
  return PLATFORM_HOSTS.some(p => h === p || h.endsWith(`.${p}`))
}

export type CompetitorWithWebsite = NearbyCompetitor & { websiteUri: string }

/**
 * Topp N (listan är redan sorterad på avstånd) konkurrenter med en egen webbplats.
 * Hoppar över: saknad/ogiltig websiteUri, icke-http(s), plattformsvärdar, samma
 * domän som den scannade sajten (kedjor/dubbla Place-ID:n) och dubbletter per domän.
 */
export function selectCompetitorsToScan(
  list: NearbyCompetitor[] | null | undefined,
  ownUrl: string,
  max = MAX_COMPETITOR_SCANS,
): CompetitorWithWebsite[] {
  let ownHost = ''
  try { ownHost = normHost(new URL(ownUrl).hostname) } catch { /* okänd egen värd */ }

  const seenHosts = new Set<string>()
  const selected: CompetitorWithWebsite[] = []
  for (const c of list ?? []) {
    if (selected.length >= max) break
    if (!c.websiteUri) continue
    let u: URL
    try { u = new URL(c.websiteUri) } catch { continue }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    const host = normHost(u.hostname)
    if (!host || host === ownHost || isPlatformHost(host) || seenHosts.has(host)) continue
    seenHosts.add(host)
    selected.push({ ...c, websiteUri: stripTrackingFromWebsite(u) })
  }
  return selected
}

/**
 * Googles websiteUri har ofta spårningsparametrar (?utm_source=…) — inte en del av
 * sajten. Tar bort utm_* och fragment. Används även när en lagrad rapports
 * konkurrentwebbplats hämtas färskt (placesContent.ts), så adressen blir densamma.
 */
export function stripTrackingFromWebsite(website: URL | string): string {
  let u: URL
  try { u = new URL(website.toString()) } catch { return website.toString() }
  for (const param of [...u.searchParams.keys()]) {
    if (param.toLowerCase().startsWith('utm_')) u.searchParams.delete(param)
  }
  u.hash = ''
  return u.toString()
}

/** En "textfil" som egentligen är en HTML-sida (soft 404) räknas som saknad. */
function isHtmlDocument(text: string | null | undefined): boolean {
  return typeof text === 'string' && /^\s*</.test(text)
}

/**
 * Deterministiska ersättare för Flash-bedömningarna av ogTags och llmsTxt —
 * reglerna följer buildTechnicalPrompt (route.ts): ogTags ok = alla tre finns,
 * warning = någon saknas, bad = alla saknas; llmsTxt ok = filen finns, bad = saknas.
 * (Flash-promptens "warning = finns men saknar viktigt innehåll" kräver ett
 * kvalitetsomdöme och avgörs därför inte här.)
 */
export function deterministicTechnicalResult(
  enhanced: Pick<EnhancedData, 'ogTitle' | 'ogDescription' | 'ogImage'>,
  llmsTxt: string | null,
): Record<string, unknown> {
  const ogCount = [enhanced.ogTitle, enhanced.ogDescription, enhanced.ogImage].filter(Boolean).length
  const hasLlms = !!llmsTxt && llmsTxt.trim().length > 0 && !isHtmlDocument(llmsTxt)
  return {
    ogTags: {
      status: ogCount === 3 ? 'ok' : ogCount > 0 ? 'warning' : 'bad',
      finding: `${ogCount} av 3 Open Graph-taggar (og:title, og:description, og:image) finns.`,
    },
    llmsTxt: {
      status: hasLlms ? 'ok' : 'bad',
      finding: hasLlms ? 'llms.txt finns.' : 'llms.txt saknas.',
    },
  }
}

/**
 * Deterministisk ersättare för Flash-bedömningen av faqSchema — regeln följer
 * buildFAQContentPrompt: ok = FAQPage-schema, warning = FAQ-innehåll i HTML men
 * inget schema, bad = inget FAQ alls. checkBuilder lägger dessutom på sin egen
 * scraper-override (FAQPage-schema på någon skrapad undersida → ok).
 */
export function deterministicFaqResult(
  enhanced: Pick<EnhancedData, 'hasFAQSchema' | 'hasFAQContent'>,
): Record<string, unknown> {
  return {
    faqSchema: {
      status: enhanced.hasFAQSchema ? 'ok' : enhanced.hasFAQContent ? 'warning' : 'bad',
      finding: enhanced.hasFAQSchema
        ? 'FAQPage-schema finns.'
        : enhanced.hasFAQContent ? 'FAQ-innehåll finns men inget FAQPage-schema.' : 'Inget FAQ-innehåll hittades.',
    },
  }
}

const NEUTRAL_DIRECTORY_RESULT: DirectoryResult = {
  foundInSameAs: [],
  directories: [],
  foundCount: 0,
  totalChecked: 0,
  napConsistency: {
    checked: false,
    consistent: null,
    phone: { values: [], consistent: false },
    address: { values: [], consistent: false },
    finding: '',
    fix: '',
  },
  status: 'warning',
  finding: '',
  fix: '',
}

/**
 * Statusar för COMPARISON_KEYS, framräknade av checkBuilder själv (ingen
 * duplicerad bedömningslogik). LLM-/API-indata ersätts med neutrala värden — de
 * påverkar inte någon av COMPARISON_KEYS. Ren funktion, muterar inte indata.
 */
export function evaluateComparisonStatuses(input: {
  url: string
  scraperData: ScrapedData
  enhancedData: EnhancedData
}): Record<string, Status> {
  const scraperData: ScrapedData = {
    ...input.scraperData,
    llmsTxt: isHtmlDocument(input.scraperData.llmsTxt) ? null : input.scraperData.llmsTxt,
  }
  const enhancedData: EnhancedData = {
    ...input.enhancedData,
    robotsTxt: isHtmlDocument(input.enhancedData.robotsTxt) ? '' : input.enhancedData.robotsTxt,
  }
  // Slutlig URL efter redirects (http → https räknas som https, likadant för alla).
  const finalUrl = scraperData.pages[0]?.url || input.url

  const checks = buildCheckResults({
    scraperData,
    enhancedData,
    technicalResult: deterministicTechnicalResult(enhancedData, scraperData.llmsTxt),
    faqResult: deterministicFaqResult(enhancedData),
    eatResult: {},
    directoryResult: NEUTRAL_DIRECTORY_RESULT,
    aiMentionResult: null,
    reviewReplyResult: { total: 0, status: 'notMeasured', finding: '', fix: '', sampleNote: '' },
    placeData: null,
    url: finalUrl,
    isHttps: finalUrl.startsWith('https://'),
    cwvMetrics: null,
    competitorList: null,
  })

  const byKey = new Map(checks.map(c => [c.key, c.status]))
  const statuses: Record<string, Status> = {}
  for (const key of COMPARISON_KEYS) statuses[key] = byKey.get(key) ?? 'notMeasured'
  return statuses
}

export function countOk(statuses: Record<string, Status>): number {
  return COMPARISON_KEYS.filter(k => statuses[k] === 'ok').length
}

export interface CompetitorSiteData {
  scraperData: ScrapedData
  enhancedData: EnhancedData
}

export type CompetitorSiteScraper = (url: string) => Promise<CompetitorSiteData>

/** Samma scrapers som huvudscanningen — båda går via safeFetch (SSRF-skydd per hopp). */
export const scrapeCompetitorSite: CompetitorSiteScraper = async (url) => {
  const [scraperData, enhancedData] = await Promise.all([scrapeWebsite(url), scrapeEnhanced(url)])
  return { scraperData, enhancedData }
}

export interface CompetitorScanOutcome {
  competitor: CompetitorWithWebsite
  statuses: Record<string, Status> | null
  error: string | null
  ms: number
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout efter ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Scannar konkurrenternas sajter parallellt, var och en med egen tidsgräns.
 * Kastar aldrig — en sajt som inte svarar blir `statuses: null` (scanned: false).
 */
export async function scanCompetitorSites(
  competitors: CompetitorWithWebsite[],
  opts: { scraper?: CompetitorSiteScraper; timeoutMs?: number } = {},
): Promise<CompetitorScanOutcome[]> {
  const scraper = opts.scraper ?? scrapeCompetitorSite
  const timeoutMs = opts.timeoutMs ?? COMPETITOR_SCAN_TIMEOUT_MS

  return Promise.all(competitors.map(async (competitor): Promise<CompetitorScanOutcome> => {
    const started = Date.now()
    try {
      const data = await withTimeout(scraper(competitor.websiteUri), timeoutMs)
      const statuses = evaluateComparisonStatuses({ url: competitor.websiteUri, ...data })
      return { competitor, statuses, error: null, ms: Date.now() - started }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[Competitors] ${competitor.name} (${competitor.websiteUri}) kunde inte scannas: ${message}`)
      return { competitor, statuses: null, error: message, ms: Date.now() - started }
    }
  }))
}

/** null när det inte fanns någon konkurrent med egen webbplats att jämföra mot. */
export function buildCompetitorComparison(
  youStatuses: Record<string, Status>,
  outcomes: CompetitorScanOutcome[],
): CompetitorComparisonData | null {
  if (outcomes.length === 0) return null
  return {
    keys: [...COMPARISON_KEYS],
    you: { statuses: youStatuses, okCount: countOk(youStatuses) },
    competitors: outcomes.map(o => ({
      placeId: o.competitor.placeId,
      name: o.competitor.name,
      website: o.competitor.websiteUri,
      rating: o.competitor.rating,
      reviewCount: o.competitor.userRatingCount,
      scanned: o.statuses !== null,
      statuses: o.statuses ?? {},
      okCount: o.statuses ? countOk(o.statuses) : null,
    })),
  }
}

const MEASURED: Status[] = ['ok', 'warning', 'bad']

/**
 * Verifierade skillnader: en sida klarar kontrollen (ok) medan den andra har
 * uppmätt fel/varning. notMeasured/notApplicable på någon sida → ingen skillnad.
 */
export function diffStatuses(
  you: Record<string, Status>,
  them: Record<string, Status>,
): { theyAhead: CheckKey[]; youAhead: CheckKey[] } {
  const theyAhead: CheckKey[] = []
  const youAhead: CheckKey[] = []
  for (const key of COMPARISON_KEYS) {
    const a = you[key]
    const b = them[key]
    if (!MEASURED.includes(a) || !MEASURED.includes(b)) continue
    if (b === 'ok' && a !== 'ok') theyAhead.push(key)
    else if (a === 'ok' && b !== 'ok') youAhead.push(key)
  }
  return { theyAhead, youAhead }
}

function websiteHost(website: string): string {
  try { return normHost(new URL(website).hostname) } catch { return website }
}

/** Kort, verifierad sammanfattning till syntesprompten ("Kometen har FAQ-schema, ni inte."). */
export function formatComparisonForPrompt(comparison: CompetitorComparisonData | null): string {
  if (!comparison || comparison.competitors.length === 0) {
    return 'KONKURRENTJÄMFÖRELSE (webbplatser): Ingen konkurrent med egen webbplats kunde jämföras — påstå INGENTING om vad konkurrenternas sajter har eller saknar.'
  }

  const total = comparison.keys.length
  const labels = new Map(CHECK_REGISTRY.map(e => [e.key, e.label]))
  const lines: string[] = [
    `KONKURRENTJÄMFÖRELSE (webbplatser) — VERIFIERAD: samma ${total} deterministiska kontroller körda på konkurrenternas egna sajter (inga AI-bedömningar).`,
    `Kontroller: ${comparison.keys.map(k => labels.get(k) ?? k).join(', ')}.`,
    `Ni: ${comparison.you.okCount}/${total} godkända.`,
  ]

  // Aggregat räknade i kod — så att modellen aldrig behöver (eller får) generalisera
  // själv ("ingen av konkurrenterna har …") utifrån raderna per konkurrent.
  const scanned = comparison.competitors.filter(c => c.scanned)
  if (scanned.length > 0) {
    const you = comparison.you.statuses
    const failed = (s: Status | undefined) => s === 'bad' || s === 'warning'
    const phrase = (k: CheckKey) => HAS_PHRASE[k] ?? labels.get(k) ?? k
    const onlyYou = comparison.keys.filter(k => you[k] === 'ok' && scanned.every(c => failed(c.statuses[k])))
    const allThemNotYou = comparison.keys.filter(k => failed(you[k]) && scanned.every(c => c.statuses[k] === 'ok'))
    lines.push(`Bara ni (ingen av de ${scanned.length} scannade konkurrenterna): ${onlyYou.length > 0 ? onlyYou.map(phrase).join(', ') : '—'}.`)
    lines.push(`Alla ${scanned.length} scannade konkurrenter har, men inte ni: ${allThemNotYou.length > 0 ? allThemNotYou.map(phrase).join(', ') : '—'}.`)

    // Per kontroll: exakt vilka som har/saknar — bara där resultaten skiljer sig. Utan
    // detta slog modellen ihop kontroller med olika "saknar"-listor i samma mening
    // ("sitemap och llms.txt, som Kometen och Familjen saknar" fast Familjen har llms.txt).
    const perKey: string[] = []
    for (const k of comparison.keys) {
      const parties = [{ name: 'ni', status: you[k] }, ...scanned.map(c => ({ name: c.name, status: c.statuses[k] }))]
      const has = parties.filter(p => p.status === 'ok').map(p => p.name)
      const lacks = parties.filter(p => failed(p.status)).map(p => p.name)
      if (has.length === 0 || lacks.length === 0) continue
      perKey.push(`- ${phrase(k)} — har: ${has.join(', ')}; saknar: ${lacks.join(', ')}.`)
    }
    if (perKey.length > 0) {
      lines.push('Per kontroll där resultaten skiljer sig (har = godkänd, saknar = fel eller ofullständig):', ...perKey)
    }
  }

  lines.push('Per konkurrent:')
  for (const c of comparison.competitors) {
    const meta = [
      websiteHost(c.website),
      c.rating !== null ? `${c.rating.toFixed(1)}/5` : null,
      c.reviewCount !== null ? `${c.reviewCount} recensioner` : null,
    ].filter(Boolean).join(', ')

    if (!c.scanned) {
      lines.push(`- ${c.name} (${meta}): sajten kunde inte scannas — dra inga slutsatser om den.`)
      continue
    }

    const { theyAhead, youAhead } = diffStatuses(comparison.you.statuses, c.statuses)
    const diffs = [
      ...theyAhead.map(k => `${c.name} har ${HAS_PHRASE[k] ?? labels.get(k) ?? k}, ni inte.`),
      ...youAhead.map(k => `Ni har ${HAS_PHRASE[k] ?? labels.get(k) ?? k}, ${c.name} inte.`),
    ]
    lines.push(`- ${c.name} (${meta}): ${c.okCount}/${total} godkända. ${diffs.length > 0 ? diffs.join(' ') : 'Samma resultat som ni på alla kontroller.'}`)
  }

  return lines.join('\n')
}
