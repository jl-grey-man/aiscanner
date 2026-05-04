/**
 * checkBuilder.ts -- Maps all raw scan data into exactly 37 CheckResult objects.
 *
 * This is the central bridge between the untyped scan outputs (scraper, Flash AI,
 * directory checker, AI mention checker, Places API) and the typed ScanResult contract.
 *
 * Every check MUST be present (id 1-37) in CHECK_REGISTRY order.
 * If a data source is unavailable or returns invalid data, the check gets
 * status 'notMeasured' with a Swedish finding explaining why.
 *
 * Task: 2.1
 */

import type { CheckResult, CheckKey } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'
import type { ScrapedData, PageSummary } from './scraper'
import type { EnhancedData } from './enhancedScraper'
import type { DirectoryResult } from './directoryChecker'
import type { AIMentionResult } from './aiMentionChecker'

// ---------------------------------------------------------------------------
// Types for function params
// ---------------------------------------------------------------------------

export interface BuildCheckResultsParams {
  scraperData: ScrapedData
  enhancedData: EnhancedData
  technicalResult: Record<string, unknown>
  faqResult: Record<string, unknown>
  eatResult: Record<string, unknown>
  directoryResult: DirectoryResult
  aiMentionResult: AIMentionResult | null
  reviewReplyResult: {
    total: number
    withReply: number
    responseRate: number
    status: 'ok' | 'warning' | 'bad'
    finding: string
    fix: string
    sampleNote: string
  }
  placeData: Record<string, unknown> | null
  url: string
  isHttps: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckStatus = CheckResult['status']

/** Safely extract a Flash AI sub-result with fallback for missing/invalid data. */
function safeFlashCheck(
  flashResult: Record<string, unknown>,
  key: string
): {
  status: CheckStatus
  finding: string
  fix: string | null
  codeExample: string | null
  data: Record<string, unknown> | null
} {
  const sub = flashResult?.[key] as Record<string, unknown> | undefined
  if (!sub || typeof sub !== 'object') {
    return {
      status: 'notMeasured',
      finding: 'Kunde inte analysera.',
      fix: null,
      codeExample: null,
      data: null,
    }
  }

  const rawStatus = String(sub.status ?? 'unknown')
  const validStatuses: CheckStatus[] = ['ok', 'warning', 'bad', 'notMeasured', 'notApplicable']
  const status: CheckStatus = validStatuses.includes(rawStatus as CheckStatus)
    ? (rawStatus as CheckStatus)
    : 'notMeasured'

  return {
    status,
    finding: typeof sub.finding === 'string' ? sub.finding : 'Kunde inte analysera.',
    fix: typeof sub.fix === 'string' && sub.fix.length > 0 ? sub.fix : null,
    codeExample: typeof sub.codeExample === 'string' && sub.codeExample.length > 0 ? sub.codeExample : null,
    data: sub,
  }
}

/** Determine priority from status. */
function priorityFromStatus(status: CheckStatus): CheckResult['priority'] {
  if (status === 'bad') return 'critical'
  if (status === 'warning') return 'important'
  return null
}

/** Build a single CheckResult from registry entry + computed fields. */
function makeCheck(
  key: CheckKey,
  status: CheckStatus,
  source: CheckResult['source'],
  finding: string,
  fix: string | null,
  data: Record<string, unknown> | null = null,
  codeExample: string | null = null
): CheckResult {
  const reg = CHECK_REGISTRY.find((r) => r.key === key)
  if (!reg) {
    throw new Error(`Unknown check key: ${key}`)
  }
  return {
    id: reg.id,
    key,
    status,
    source,
    finding,
    fix,
    data,
    codeExample,
    priority: priorityFromStatus(status),
    tier: reg.tier,
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCheckResults(params: BuildCheckResultsParams): CheckResult[] {
  const {
    scraperData,
    enhancedData,
    technicalResult,
    faqResult,
    eatResult,
    directoryResult,
    aiMentionResult,
    reviewReplyResult,
    placeData,
    isHttps,
  } = params

  const page: PageSummary | undefined = scraperData.pages[0]
  const allPages: PageSummary[] = scraperData.pages ?? []

  // Aggregate signals across ALL scraped pages (not just main page)
  // AI search engines crawl subpages too — /kontakt, /om-oss etc.
  const allSchemaTypes = new Set<string>()
  let anyPageHasGoogleMaps = false
  let anyPageHasFaqSchema = false
  let anyPageHasServiceSchema = false
  let anyPageHasAbout = false
  let anyPageHasOrganizationSchema = false
  let anyPageHasPersonSchema = false
  const SERVICE_SCHEMA_TYPES = [
    'service', 'plumbingservice', 'electricalservice', 'hvacbusiness',
    'autobodyshop', 'autorepair', 'beautysalon', 'dayspa', 'hairsalon',
    'healthclub', 'housepaintingservice', 'locksmithservice', 'movingcompany',
    'roofingcontractor', 'tattooparlorservice', 'product',
  ]
  for (const p of allPages) {
    if (p.hasGoogleMaps) anyPageHasGoogleMaps = true
    // Detect about page by URL path
    try {
      const path = new URL(p.url).pathname.toLowerCase()
      if (/om(-|_)?(oss|rubik|f.retag|bolaget|oss)|about/i.test(path)) anyPageHasAbout = true
    } catch { /* skip */ }
    for (const t of p.schemaTypes ?? []) {
      allSchemaTypes.add(t)
      const lower = t.toLowerCase()
      if (lower.includes('faqpage')) anyPageHasFaqSchema = true
      if (SERVICE_SCHEMA_TYPES.some(s => lower.includes(s))) anyPageHasServiceSchema = true
      if (lower === 'organization' || lower.includes('corporation') || lower.includes('localbusiness')) anyPageHasOrganizationSchema = true
      if (lower === 'person') anyPageHasPersonSchema = true
    }
  }

  // Pre-extract Flash sub-results with safe fallbacks
  const techAiCrawlers = safeFlashCheck(technicalResult, 'aiCrawlers')
  const techOgTags = safeFlashCheck(technicalResult, 'ogTags')
  const techSocial = safeFlashCheck(technicalResult, 'socialPresence')
  const techHreflang = safeFlashCheck(technicalResult, 'hreflang')
  const techLlmsTxt = safeFlashCheck(technicalResult, 'llmsTxt')
  const faqFaqSchema = safeFlashCheck(faqResult, 'faqSchema')
  const faqContentDepth = safeFlashCheck(faqResult, 'contentDepth')
  const faqServiceSchema = safeFlashCheck(faqResult, 'serviceSchema')
  const eatEatSignals = safeFlashCheck(eatResult, 'eatSignals')

  // ----- Build all 37 checks in registry order (id 1-37) -----

  const checks: CheckResult[] = []

  // #1 https (scraper)
  checks.push(makeCheck(
    'https',
    isHttps ? 'ok' : 'bad',
    'scraper',
    isHttps
      ? 'Webbplatsen anvander HTTPS -- sakerhetscertifikat finns.'
      : 'Webbplatsen anvander HTTP -- saknar SSL-certifikat.',
    isHttps ? null : 'Aktivera HTTPS via SSL-certifikat (t.ex. Let\'s Encrypt).',
  ))

  // #2 robotsTxt (scraper)
  {
    const hasRobots = !!enhancedData.robotsTxt && enhancedData.robotsTxt.trim().length > 0
    checks.push(makeCheck(
      'robotsTxt',
      hasRobots ? 'ok' : 'bad',
      'scraper',
      hasRobots ? 'Robots.txt finns och kan lasa av AI-crawlers.' : 'Robots.txt saknas.',
      hasRobots ? null : 'Skapa en robots.txt i rotmappen med Sitemap-referens.',
    ))
  }

  // #3 aiCrawlers (AI)
  checks.push(makeCheck(
    'aiCrawlers',
    techAiCrawlers.status,
    'ai',
    techAiCrawlers.finding,
    techAiCrawlers.fix,
    techAiCrawlers.data,
  ))

  // #4 sitemap (scraper)
  {
    const hasSitemap = (scraperData.sitemapUrlCount ?? 0) > 0
    checks.push(makeCheck(
      'sitemap',
      hasSitemap ? 'ok' : 'bad',
      'scraper',
      hasSitemap
        ? `Sitemap.xml hittades med ${scraperData.sitemapUrlCount} URL:er.`
        : 'Sitemap.xml saknas eller ar tom.',
      hasSitemap ? null : 'Skapa en sitemap.xml och lankar till den fran robots.txt.',
      hasSitemap ? { urlCount: scraperData.sitemapUrlCount } : null,
    ))
  }

  // #5 llmsTxt (AI -- Flash evaluates quality, but existence from scraper)
  checks.push(makeCheck(
    'llmsTxt',
    techLlmsTxt.status,
    'ai',
    techLlmsTxt.finding,
    techLlmsTxt.fix,
    techLlmsTxt.data,
  ))

  // #6 canonical (scraper)
  {
    const hasCanonical = !!page?.canonical
    checks.push(makeCheck(
      'canonical',
      hasCanonical ? 'ok' : 'warning',
      'scraper',
      hasCanonical
        ? `Canonical-tagg pekar pa: ${page!.canonical}`
        : 'Ingen canonical-tagg hittades.',
      hasCanonical ? null : 'Lagg till <link rel="canonical" href="..."> i <head>.',
      hasCanonical ? { canonical: page!.canonical } : null,
    ))
  }

  // #7 ogTags (AI)
  checks.push(makeCheck(
    'ogTags',
    techOgTags.status,
    'ai',
    techOgTags.finding,
    techOgTags.fix,
    techOgTags.data,
    techOgTags.codeExample,
  ))

  // #8 socialPresence (AI)
  checks.push(makeCheck(
    'socialPresence',
    techSocial.status,
    'ai',
    techSocial.finding,
    techSocial.fix,
    techSocial.data,
  ))

  // #9 hreflang (AI)
  checks.push(makeCheck(
    'hreflang',
    techHreflang.status,
    'ai',
    techHreflang.finding,
    techHreflang.fix,
    techHreflang.data,
  ))

  // #10 cwv (not implemented, weight=0)
  checks.push(makeCheck(
    'cwv',
    'notMeasured',
    'computed',
    'Sidhastighet/CWV ar inte implementerad i denna version.',
    null,
  ))

  // #11 phone (scraper)
  {
    const hasPhone = (page?.phones?.length ?? 0) > 0
    checks.push(makeCheck(
      'phone',
      hasPhone ? 'ok' : 'bad',
      'scraper',
      hasPhone
        ? `Telefonnummer hittades: ${page!.phones.join(', ')}`
        : 'Inget telefonnummer hittades på sidan, eller så är det skrivet i ett format som AI-sökmotorer inte kan läsa.',
      hasPhone
        ? null
        : 'Lägg till telefonnummer i JSON-LD structured data (schema.org "telephone"-fältet) och/eller synligt som text på startsidan i formatet +46 31 220 30 05 eller 031-220 30 05. Undvik att bara visa numret som bild eller inuti JavaScript-renderade element.',
      hasPhone ? { phones: page!.phones } : null,
    ))
  }

  // #12 cityMentioned (scraper)
  {
    const hasCities = (page?.cities?.length ?? 0) > 0
    checks.push(makeCheck(
      'cityMentioned',
      hasCities ? 'ok' : 'bad',
      'scraper',
      hasCities
        ? `Stad namns pa sidan: ${page!.cities.join(', ')}`
        : 'Ingen stad namns pa sidan.',
      hasCities ? null : 'Namn staden i rubriker, meta-beskrivning och brodtext.',
      hasCities ? { cities: page!.cities } : null,
    ))
  }

  // #13 googleMaps (scraper — checks ALL pages)
  {
    const hasMaps = anyPageHasGoogleMaps
    const mapsPage = allPages.find(p => p.hasGoogleMaps)
    checks.push(makeCheck(
      'googleMaps',
      hasMaps ? 'ok' : 'bad',
      'scraper',
      hasMaps
        ? `Google Maps-inbäddning hittades${mapsPage ? ` på ${new URL(mapsPage.url).pathname}` : ''}.`
        : 'Ingen Google Maps-inbäddning hittades.',
      hasMaps ? null : 'Lägg till en Google Maps-inbäddning på kontaktsidan.',
    ))
  }

  // #14 localBusiness (scraper)
  {
    const hasLB = !!page?.hasAnyLocalBusinessSchema
    checks.push(makeCheck(
      'localBusiness',
      hasLB ? 'ok' : 'bad',
      'scraper',
      hasLB
        ? `LocalBusiness-schema hittades. Typer: ${page!.schemaTypes.join(', ')}`
        : 'Inget LocalBusiness-schema hittades.',
      hasLB ? null : 'Lagg till JSON-LD med @type: "LocalBusiness" (eller relevant subtyp).',
      hasLB ? { schemaTypes: page!.schemaTypes } : null,
    ))
  }

  // #15 directories (API)
  {
    const dirStatus = directoryResult.status ?? 'bad'
    checks.push(makeCheck(
      'directories',
      dirStatus,
      'api',
      directoryResult.finding || `Hittades pa ${directoryResult.foundCount}/${directoryResult.totalChecked} kataloger.`,
      directoryResult.fix || null,
      {
        foundCount: directoryResult.foundCount,
        totalChecked: directoryResult.totalChecked,
        directories: directoryResult.directories,
      },
    ))
  }

  // #16 napConsistency (API)
  {
    const nap = directoryResult.napConsistency
    let napStatus: CheckStatus
    if (!nap || !nap.checked) {
      napStatus = 'notMeasured'
    } else if (nap.consistent === true) {
      napStatus = 'ok'
    } else if (nap.consistent === false) {
      napStatus = 'bad'
    } else {
      napStatus = 'notMeasured'
    }
    checks.push(makeCheck(
      'napConsistency',
      napStatus,
      'api',
      nap?.finding || 'NAP-konsistens kunde inte kontrolleras.',
      nap?.fix || null,
      nap ? { checked: nap.checked, consistent: nap.consistent } : null,
    ))
  }

  // #17 openingHours (API)
  {
    const weekdays = (placeData as Record<string, unknown> | null)
      ?.regularOpeningHours as Record<string, unknown> | undefined
    const descriptions = weekdays?.weekdayDescriptions as string[] | undefined
    const hasHours = Array.isArray(descriptions) && descriptions.length > 0
    checks.push(makeCheck(
      'openingHours',
      hasHours ? 'ok' : 'notMeasured',
      'api',
      hasHours
        ? `Oppettider fran Google Business Profile: ${descriptions!.slice(0, 2).join(', ')}...`
        : 'Inga oppettider tillgangliga (krav Google Business Profile).',
      hasHours ? null : 'Lagg till oppettider i din Google Business Profile.',
      hasHours ? { weekdayDescriptions: descriptions } : null,
    ))
  }

  // #18 schemaAny (scraper)
  {
    const hasSchema = (page?.schemaTypes?.length ?? 0) > 0
    checks.push(makeCheck(
      'schemaAny',
      hasSchema ? 'ok' : 'bad',
      'scraper',
      hasSchema
        ? `Schema markup hittades: ${page!.schemaTypes.join(', ')}`
        : 'Ingen schema markup hittades.',
      hasSchema ? null : 'Lagg till JSON-LD schema markup (minst Organization eller LocalBusiness).',
      hasSchema ? { schemaTypes: page!.schemaTypes } : null,
    ))
  }

  // #19 localSubtype (scraper)
  {
    const hasSubtype = !!page?.hasAnyLocalBusinessSchema
    checks.push(makeCheck(
      'localSubtype',
      hasSubtype ? 'ok' : 'bad',
      'scraper',
      hasSubtype
        ? 'LocalBusiness-subtyp hittades i schema markup.'
        : 'Ingen specifik LocalBusiness-subtyp hittades.',
      hasSubtype ? null : 'Anvand en specifik subtyp (t.ex. Restaurant, Dentist, Plumber) istallet for bara LocalBusiness.',
    ))
  }

  // #20 jsonLd (scraper)
  {
    const hasJsonLd = (page?.schemaScripts?.length ?? 0) > 0
    checks.push(makeCheck(
      'jsonLd',
      hasJsonLd ? 'ok' : 'bad',
      'scraper',
      hasJsonLd
        ? `${page!.schemaScripts.length} JSON-LD-block hittades pa sidan.`
        : 'Inga JSON-LD-block hittades.',
      hasJsonLd ? null : 'Lagg till JSON-LD (application/ld+json) istallet for microdata -- AI-modeller foredrar JSON-LD.',
      hasJsonLd ? { blockCount: page!.schemaScripts.length } : null,
    ))
  }

  // #21 metaTags (scraper)
  {
    const hasTitle = !!page?.title
    const hasDesc = !!page?.metaDescription
    let mtStatus: CheckStatus
    let mtFinding: string
    let mtFix: string | null
    if (hasTitle && hasDesc) {
      mtStatus = 'ok'
      mtFinding = 'Bade title-tagg och meta-beskrivning finns.'
      mtFix = null
    } else if (hasTitle || hasDesc) {
      mtStatus = 'warning'
      mtFinding = hasTitle
        ? 'Title-tagg finns men meta-beskrivning saknas.'
        : 'Meta-beskrivning finns men title-tagg saknas.'
      mtFix = hasTitle
        ? 'Lagg till en meta-beskrivning (150-160 tecken) med relevanta nyckelord.'
        : 'Lagg till en title-tagg (50-60 tecken) med foretagsnamn och tjanst.'
    } else {
      mtStatus = 'bad'
      mtFinding = 'Varken title-tagg eller meta-beskrivning hittades.'
      mtFix = 'Lagg till bade <title> och <meta name="description"> i <head>.'
    }
    checks.push(makeCheck(
      'metaTags',
      mtStatus,
      'scraper',
      mtFinding,
      mtFix,
      { hasTitle, hasDescription: hasDesc },
    ))
  }

  // #22 faqSchema (AI, overridden by scraper if FAQPage schema detected on any page)
  {
    let faqStatus = faqFaqSchema.status
    let faqFinding = faqFaqSchema.finding
    let faqFix = faqFaqSchema.fix
    if (anyPageHasFaqSchema && (faqStatus === 'bad' || faqStatus === 'warning')) {
      const faqPages = allPages.filter(p => (p.schemaTypes ?? []).some(t => t.toLowerCase().includes('faqpage')))
      const paths = faqPages.map(p => { try { return new URL(p.url).pathname } catch { return p.url } })
      faqStatus = 'ok'
      faqFinding = `FAQPage-schema hittades på: ${paths.join(', ')}`
      faqFix = null
    }
    checks.push(makeCheck(
      'faqSchema',
      faqStatus,
      anyPageHasFaqSchema ? 'scraper' : 'ai',
      faqFinding,
      faqFix,
      faqFaqSchema.data,
      faqFaqSchema.codeExample,
    ))
  }

  // #23 contentDepth (AI)
  checks.push(makeCheck(
    'contentDepth',
    faqContentDepth.status,
    'ai',
    faqContentDepth.finding,
    faqContentDepth.fix,
    faqContentDepth.data,
  ))

  // #24 serviceSchema (AI, overridden by scraper if Service/Product schema detected on any page)
  {
    let svcStatus = faqServiceSchema.status
    let svcFinding = faqServiceSchema.finding
    let svcFix = faqServiceSchema.fix
    if (anyPageHasServiceSchema && (svcStatus === 'bad' || svcStatus === 'warning')) {
      const svcTypes = Array.from(allSchemaTypes).filter(t => {
        const lower = t.toLowerCase()
        return SERVICE_SCHEMA_TYPES.some(s => lower.includes(s))
      })
      svcStatus = 'ok'
      svcFinding = `Service/Product-schema hittades: ${svcTypes.join(', ')}`
      svcFix = null
    }
    checks.push(makeCheck(
      'serviceSchema',
      svcStatus,
      anyPageHasServiceSchema ? 'scraper' : 'ai',
      svcFinding,
      svcFix,
      faqServiceSchema.data,
      faqServiceSchema.codeExample,
    ))
  }

  // #25 eatSignals (AI, corrected with scraper facts)
  // AI sometimes claims "Om oss saknas" when it exists on a subpage.
  // An AI search engine crawls all pages — correct with what scraper found.
  {
    let eatStatus = eatEatSignals.status
    let eatFinding = eatEatSignals.finding
    let eatFix = eatEatSignals.fix
    const eatData = (eatEatSignals.data ?? {}) as Record<string, unknown>
    const aiMissing = Array.isArray(eatData.missing) ? [...eatData.missing] as string[] : []
    const aiFound = Array.isArray(eatData.found) ? [...eatData.found] as string[] : []
    let corrected = false

    // Correct "Om oss-sida" if about page exists
    if (anyPageHasAbout && aiMissing.some(m => /om oss|about/i.test(m))) {
      const aboutPage = allPages.find(p => {
        try { return /om(-|_)?(oss|rubik|f.retag|bolaget|oss)|about/i.test(new URL(p.url).pathname) }
        catch { return false }
      })
      const idx = aiMissing.findIndex(m => /om oss|about/i.test(m))
      if (idx >= 0) aiMissing.splice(idx, 1)
      aiFound.push(`Om oss-sida (${aboutPage ? new URL(aboutPage.url).pathname : 'hittad'})`)
      corrected = true
    }

    // Correct "Organization" schema if detected
    if (anyPageHasOrganizationSchema && aiMissing.some(m => /organization/i.test(m))) {
      const idx = aiMissing.findIndex(m => /organization/i.test(m))
      if (idx >= 0) aiMissing.splice(idx, 1)
      aiFound.push('Organization-schema')
      corrected = true
    }

    // Correct "Person-schema" if detected
    if (anyPageHasPersonSchema && aiMissing.some(m => /person/i.test(m))) {
      const idx = aiMissing.findIndex(m => /person/i.test(m))
      if (idx >= 0) aiMissing.splice(idx, 1)
      aiFound.push('Person-schema')
      corrected = true
    }

    if (corrected) {
      // Re-evaluate status based on corrected signals
      if (aiMissing.length === 0) {
        eatStatus = 'ok'
        eatFinding = `Starka E-A-T-signaler: ${aiFound.join(', ')}.`
        eatFix = null
      } else if (aiMissing.length <= 2) {
        eatStatus = 'warning'
        eatFinding = `E-A-T-signaler: ${aiFound.join(', ')} hittades. Saknas: ${aiMissing.join(', ')}.`
        eatFix = eatEatSignals.fix
      } else {
        // Still many missing — keep AI's status but update found/missing lists
        eatFinding = `E-A-T-signaler: ${aiFound.join(', ')} hittades. Saknas: ${aiMissing.join(', ')}.`
      }
    }

    checks.push(makeCheck(
      'eatSignals',
      eatStatus,
      corrected ? 'scraper' : 'ai',
      eatFinding,
      eatFix,
      { ...eatData, found: aiFound, missing: aiMissing, correctedByScaper: corrected },
    ))
  }

  // #26 semanticHtml (scraper)
  {
    const sem = page?.semanticHTML
    if (!sem) {
      checks.push(makeCheck(
        'semanticHtml',
        'notMeasured',
        'scraper',
        'Semantisk HTML kunde inte analyseras.',
        null,
      ))
    } else {
      const hasMain = sem.hasMain
      const hasNav = sem.hasNav
      const hasArticle = sem.hasArticle
      const hasSection = sem.hasSection
      const hasAside = sem.hasAside
      const tagCount = [hasMain, hasNav, hasArticle, hasSection, hasAside].filter(Boolean).length

      let semStatus: CheckStatus
      let semFinding: string
      let semFix: string | null

      if (hasMain && hasNav) {
        semStatus = 'ok'
        semFinding = `Bra semantisk HTML: ${tagCount} semantiska element hittades (main, nav${hasArticle ? ', article' : ''}${hasSection ? ', section' : ''}${hasAside ? ', aside' : ''}).`
        semFix = null
      } else if (tagCount > 0) {
        semStatus = 'warning'
        const missing: string[] = []
        if (!hasMain) missing.push('<main>')
        if (!hasNav) missing.push('<nav>')
        semFinding = `Delvis semantisk HTML: ${tagCount} element hittades men ${missing.join(' och ')} saknas.`
        semFix = `Lagg till ${missing.join(' och ')} for battre AI-tolkning av sidstrukturen.`
      } else {
        semStatus = 'bad'
        semFinding = 'Inga semantiska HTML-element hittades (main, nav, article, section).'
        semFix = 'Anvand semantiska HTML5-element: <main> for huvudinnehall, <nav> for navigation, <article> for fristaaende innehall.'
      }
      checks.push(makeCheck(
        'semanticHtml',
        semStatus,
        'scraper',
        semFinding,
        semFix,
        {
          hasMain, hasNav, hasArticle, hasSection, hasAside,
          langAttribute: sem.langAttribute,
        },
      ))
    }
  }

  // #27 h1 (scraper)
  {
    const hasH1 = !!page?.h1
    checks.push(makeCheck(
      'h1',
      hasH1 ? 'ok' : 'bad',
      'scraper',
      hasH1 ? `H1-rubrik: "${page!.h1}"` : 'Ingen H1-rubrik hittades.',
      hasH1 ? null : 'Lagg till en H1-rubrik med foretagsnamn och tjanst/plats.',
      hasH1 ? { h1: page!.h1 } : null,
    ))
  }

  // #28 title (scraper)
  {
    const hasTitle = !!page?.title
    checks.push(makeCheck(
      'title',
      hasTitle ? 'ok' : 'bad',
      'scraper',
      hasTitle ? `Title-tagg: "${page!.title}"` : 'Ingen title-tagg hittades.',
      hasTitle ? null : 'Lagg till en <title>-tagg med foretagsnamn, tjanst och stad.',
      hasTitle ? { title: page!.title } : null,
    ))
  }

  // #29 metaDescription (scraper)
  {
    const hasDesc = !!page?.metaDescription
    checks.push(makeCheck(
      'metaDescription',
      hasDesc ? 'ok' : 'bad',
      'scraper',
      hasDesc
        ? `Metabeskrivning: "${page!.metaDescription.slice(0, 120)}${page!.metaDescription.length > 120 ? '...' : ''}"`
        : 'Ingen metabeskrivning hittades.',
      hasDesc ? null : 'Lagg till <meta name="description" content="..."> med 150-160 tecken.',
      hasDesc ? { metaDescription: page!.metaDescription } : null,
    ))
  }

  // #30 contactInfo (scraper)
  {
    const hasContact = !!page?.hasContactInfo
    checks.push(makeCheck(
      'contactInfo',
      hasContact ? 'ok' : 'bad',
      'scraper',
      hasContact
        ? 'Kontaktinformation hittades pa sidan.'
        : 'Ingen kontaktinformation hittades.',
      hasContact ? null : 'Lagg till telefonnummer, e-post och adress synligt pa sidan.',
    ))
  }

  // #31 altTexts (scraper)
  {
    const alt = page?.altTextCoverage
    if (!alt) {
      checks.push(makeCheck(
        'altTexts',
        'notMeasured',
        'scraper',
        'Alt-texter kunde inte analyseras.',
        null,
      ))
    } else {
      let altStatus: CheckStatus
      let altFinding: string
      let altFix: string | null
      if (alt.total === 0) {
        altStatus = 'ok'
        altFinding = 'Inga bilder hittades pa sidan (inget att bedoma).'
        altFix = null
      } else if (alt.percentage >= 80) {
        altStatus = 'ok'
        altFinding = `${alt.percentage}% av bilderna har alt-text (${alt.withAlt}/${alt.total}).`
        altFix = null
      } else if (alt.percentage >= 50) {
        altStatus = 'warning'
        altFinding = `${alt.percentage}% av bilderna har alt-text (${alt.withAlt}/${alt.total}) -- bor forbattras.`
        altFix = `Lagg till beskrivande alt-texter pa de ${alt.total - alt.withAlt} bilder som saknar det.`
      } else {
        altStatus = 'bad'
        altFinding = `Bara ${alt.percentage}% av bilderna har alt-text (${alt.withAlt}/${alt.total}).`
        altFix = `Lagg till beskrivande alt-texter pa alla bilder -- AI-modeller anvander alt-texter for att forsta sidinnehall.`
      }
      checks.push(makeCheck(
        'altTexts',
        altStatus,
        'scraper',
        altFinding,
        altFix,
        { total: alt.total, withAlt: alt.withAlt, percentage: alt.percentage },
      ))
    }
  }

  // #32 internalLinks (scraper)
  {
    const links = page?.internalLinks
    if (!links) {
      checks.push(makeCheck(
        'internalLinks',
        'notMeasured',
        'scraper',
        'Internlankning kunde inte analyseras.',
        null,
      ))
    } else {
      let linkStatus: CheckStatus
      let linkFinding: string
      let linkFix: string | null
      if (links.uniquePages >= 5) {
        linkStatus = 'ok'
        linkFinding = `Bra internlankning: ${links.uniquePages} unika sidor lankas fran startsidan (${links.total} lankar totalt).`
        linkFix = null
      } else if (links.uniquePages >= 2) {
        linkStatus = 'warning'
        linkFinding = `Begransad internlankning: ${links.uniquePages} unika sidor lankas (${links.total} lankar totalt).`
        linkFix = 'Lagg till fler interna lankar till viktiga undersidor (tjanster, om oss, kontakt).'
      } else {
        linkStatus = 'bad'
        linkFinding = `Mycket svag internlankning: bara ${links.uniquePages} unika sidor lankas.`
        linkFix = 'Skapa en tydlig navigationsstruktur med lankar till alla viktiga undersidor.'
      }
      checks.push(makeCheck(
        'internalLinks',
        linkStatus,
        'scraper',
        linkFinding,
        linkFix,
        {
          total: links.total,
          uniquePages: links.uniquePages,
          hasContactLink: links.hasContactLink,
          hasAboutLink: links.hasAboutLink,
          hasServicesLink: links.hasServicesLink,
        },
      ))
    }
  }

  // #33 aiMentions (API)
  {
    if (!aiMentionResult) {
      checks.push(makeCheck(
        'aiMentions',
        'notMeasured',
        'api',
        'AI-omnamnandetest kunde inte koras (ingen stad identifierad eller tjanst otillganglig).',
        null,
      ))
    } else {
      checks.push(makeCheck(
        'aiMentions',
        aiMentionResult.status,
        'api',
        aiMentionResult.finding,
        aiMentionResult.fix || null,
        {
          entityKnows: aiMentionResult.entityKnows,
          entitySentiment: aiMentionResult.entitySentiment,
          categoryMentioned: aiMentionResult.categoryMentioned,
          extractedNiche: aiMentionResult.extractedNiche,
        },
      ))
    }
  }

  // #34 reviewReplies (API)
  {
    checks.push(makeCheck(
      'reviewReplies',
      reviewReplyResult.status,
      'api',
      reviewReplyResult.finding,
      reviewReplyResult.fix || null,
      {
        total: reviewReplyResult.total,
        withReply: reviewReplyResult.withReply,
        responseRate: reviewReplyResult.responseRate,
        sampleNote: reviewReplyResult.sampleNote,
      },
    ))
  }

  // #35 gbpData (API)
  {
    if (!placeData) {
      checks.push(makeCheck(
        'gbpData',
        'notMeasured',
        'api',
        'Google Business Profile-data kunde inte hamtas.',
        'Skapa en Google Business Profile pa business.google.com.',
      ))
    } else {
      const rating = (placeData as Record<string, unknown>).rating as number | undefined
      const hasRating = typeof rating === 'number'
      const name = ((placeData as Record<string, unknown>).displayName as Record<string, unknown>)?.text as string | undefined
      const reviewCount = (placeData as Record<string, unknown>).userRatingCount as number | undefined
      checks.push(makeCheck(
        'gbpData',
        hasRating ? 'ok' : 'warning',
        'api',
        hasRating
          ? `Google Business Profile: ${name || 'Foretag'} -- betyg ${rating}/5 (${reviewCount ?? 0} recensioner).`
          : `Google Business Profile hittades (${name || 'okant namn'}) men saknar betyg.`,
        hasRating ? null : 'Se till att din Google Business Profile har recensioner och aktuell information.',
        {
          name: name || null,
          rating: rating ?? null,
          userRatingCount: reviewCount ?? null,
        },
      ))
    }
  }

  // #36 competitors (computed -- no real competitor data)
  checks.push(makeCheck(
    'competitors',
    'notMeasured',
    'computed',
    'Konkurrentanalys baseras pa AI-syntes -- ingen oberoende datakalla tillganglig.',
    null,
  ))

  // #37 synthesis (not scored, not applicable)
  checks.push(makeCheck(
    'synthesis',
    'notApplicable',
    'computed',
    'Syntesen ar en separat sektion och poangsatts inte.',
    null,
  ))

  // ----- Validation: ensure exactly 37 checks in registry order -----
  if (checks.length !== 37) {
    throw new Error(
      `checkBuilder produced ${checks.length} checks instead of 37. ` +
      `Keys: ${checks.map(c => c.key).join(', ')}`
    )
  }

  // Verify order matches CHECK_REGISTRY
  for (let i = 0; i < 37; i++) {
    if (checks[i].id !== CHECK_REGISTRY[i].id || checks[i].key !== CHECK_REGISTRY[i].key) {
      throw new Error(
        `Check at index ${i} has id=${checks[i].id} key=${checks[i].key}, ` +
        `expected id=${CHECK_REGISTRY[i].id} key=${CHECK_REGISTRY[i].key}`
      )
    }
  }

  return checks
}
