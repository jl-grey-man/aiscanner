import { describe, it, expect } from 'vitest'
import {
  COMPARISON_KEYS,
  selectCompetitorsToScan,
  evaluateComparisonStatuses,
  deterministicTechnicalResult,
  deterministicFaqResult,
  diffStatuses,
  countOk,
  buildCompetitorComparison,
  scanCompetitorSites,
  formatComparisonForPrompt,
} from '@/app/lib/competitorComparison'
import type { CompetitorWithWebsite, CompetitorSiteData, CompetitorScanOutcome } from '@/app/lib/competitorComparison'
import { CompetitorComparisonSchema } from '@/app/lib/scanResult'
import type { CheckResult } from '@/app/lib/scanResult'
import type { NearbyCompetitor } from '@/app/lib/places'
import type { PageSummary, ScrapedData } from '@/app/lib/scraper'
import type { EnhancedData } from '@/app/lib/enhancedScraper'

type Status = CheckResult['status']

function page(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    url: 'https://www.exempel.se/',
    title: '',
    metaDescription: '',
    h1: '',
    h2s: [],
    bodyText: '',
    schemaScripts: [],
    schemaTypes: [],
    hasLocalBusinessSchema: false,
    hasAnyLocalBusinessSchema: false,
    hasRestaurantSchema: false,
    canonical: null,
    hasGoogleMaps: false,
    phones: [],
    cities: [],
    menuSummary: '',
    hasContactInfo: false,
    altTextCoverage: { total: 0, withAlt: 0, percentage: 100 },
    internalLinks: { total: 0, uniquePages: 0, hasContactLink: false, hasAboutLink: false, hasServicesLink: false, paths: [] },
    semanticHTML: { hasMain: false, hasArticle: false, hasSection: false, hasNav: false, hasAside: false, langAttribute: null },
    ...overrides,
  }
}

function scraped(overrides: Partial<ScrapedData> = {}, pages: PageSummary[] = [page()]): ScrapedData {
  return { url: 'https://www.exempel.se/', robotsTxt: null, sitemapXml: null, llmsTxt: null, sitemapUrlCount: null, pages, ...overrides }
}

function enhanced(overrides: Partial<EnhancedData> = {}): EnhancedData {
  return {
    robotsTxt: '', aiCrawlersBlocked: [], aiCrawlerBlocks: [],
    ogTitle: null, ogDescription: null, ogImage: null, hasOgTags: false,
    socialLinks: [], sameAsLinks: [], hreflangTags: [],
    hasFAQSchema: false, faqQuestions: [], hasFAQContent: false,
    hasServiceSchema: false, hasMenuSchema: false, hasProductSchema: false, serviceSchemaTypes: [],
    sitemapPageCount: 0, hasBlogOrGuide: false, blogPaths: [],
    hasAboutPage: false, orgNumberFound: null, certificationKeywords: [], hasPersonSchema: false, namedPersons: [],
    openingHoursFromSchema: null,
    ...overrides,
  }
}

/** En sajt som klarar alla jämförelsekontroller. */
function fullSite(): CompetitorSiteData {
  return {
    scraperData: scraped(
      { llmsTxt: '# Kometen\n> Restaurang i Göteborg', sitemapUrlCount: 12 },
      [page({
        title: 'Kometen', metaDescription: 'Klassisk restaurang', h1: 'Kometen',
        canonical: 'https://www.kometen.se/', hasGoogleMaps: true, phones: ['031-13 77 88'],
        schemaTypes: ['Restaurant'], hasAnyLocalBusinessSchema: true, schemaScripts: ['{}'],
        semanticHTML: { hasMain: true, hasArticle: false, hasSection: true, hasNav: true, hasAside: false, langAttribute: 'sv' },
        url: 'https://www.kometen.se/',
      })],
    ),
    enhancedData: enhanced({
      robotsTxt: 'User-agent: *\nAllow: /',
      ogTitle: 'Kometen', ogDescription: 'Restaurang', ogImage: 'https://www.kometen.se/og.jpg',
      hasFAQSchema: true,
    }),
  }
}

function competitor(name: string, websiteUri: string | null, extra: Partial<NearbyCompetitor> = {}): NearbyCompetitor {
  return { placeId: `id-${name}`, name, rating: 4.3, userRatingCount: 100, distanceMeters: 200, primaryType: 'restaurant', websiteUri, ...extra }
}

function allStatuses(status: Status): Record<string, Status> {
  return Object.fromEntries(COMPARISON_KEYS.map(k => [k, status]))
}

describe('selectCompetitorsToScan', () => {
  it('väljer topp 3 med egen webbplats i avståndsordning och hoppar över plattformar, egen domän, dubbletter och ogiltiga URL:er', () => {
    const list = [
      competitor('Utan sajt', null),
      competitor('Facebooksida', 'https://www.facebook.com/nagot'),
      competitor('Samma som vi (kedja)', 'https://tvakanten.se/'),
      competitor('Kometen', 'https://www.kometen.se/'),
      competitor('Kometen igen', 'https://kometen.se/meny'),
      competitor('Trasig', 'inte en url'),
      competitor('Bokadirekt', 'https://www.bokadirekt.se/places/x'),
      competitor('Familjen', 'http://www.restaurangfamiljen.se'),
      competitor('Hos Pelle', 'https://hospelle.se/?utm_source=gbp&utm_medium=organic&lang=sv#top'),
      competitor('Fjärde', 'https://fjarde.se/'),
    ]
    const selected = selectCompetitorsToScan(list, 'https://www.tvakanten.se/')
    expect(selected.map(c => c.name)).toEqual(['Kometen', 'Familjen', 'Hos Pelle'])
    // Spårningsparametrar och fragment tas bort, övriga parametrar behålls
    expect(selected.map(c => c.websiteUri)).toEqual([
      'https://www.kometen.se/',
      'http://www.restaurangfamiljen.se/',
      'https://hospelle.se/?lang=sv',
    ])
  })

  it('tål null/tom lista', () => {
    expect(selectCompetitorsToScan(null, 'https://x.se')).toEqual([])
    expect(selectCompetitorsToScan([], 'https://x.se')).toEqual([])
  })
})

describe('deterministiska ersättare för Flash-bedömningarna', () => {
  it('ogTags: ok = alla tre, warning = någon, bad = inga', () => {
    const st = (e: Partial<EnhancedData>) => (deterministicTechnicalResult(enhanced(e), null).ogTags as { status: string }).status
    expect(st({ ogTitle: 'a', ogDescription: 'b', ogImage: 'c' })).toBe('ok')
    expect(st({ ogTitle: 'a' })).toBe('warning')
    expect(st({})).toBe('bad')
  })

  it('llmsTxt: en HTML-sida (soft 404) räknas som saknad', () => {
    const st = (txt: string | null) => (deterministicTechnicalResult(enhanced(), txt).llmsTxt as { status: string }).status
    expect(st('# Företag\nInfo')).toBe('ok')
    expect(st('<!DOCTYPE html><html>404</html>')).toBe('bad')
    expect(st('   ')).toBe('bad')
    expect(st(null)).toBe('bad')
  })

  it('faqSchema: ok = FAQPage-schema, warning = bara FAQ-innehåll, bad = inget', () => {
    const st = (e: Partial<EnhancedData>) => (deterministicFaqResult(enhanced(e)).faqSchema as { status: string }).status
    expect(st({ hasFAQSchema: true })).toBe('ok')
    expect(st({ hasFAQContent: true })).toBe('warning')
    expect(st({})).toBe('bad')
  })
})

describe('evaluateComparisonStatuses (samma checkBuilder-logik för alla)', () => {
  it('en fullt utrustad sajt klarar alla jämförelsekontroller', () => {
    const statuses = evaluateComparisonStatuses({ url: 'https://www.kometen.se/', ...fullSite() })
    expect(Object.keys(statuses)).toEqual(COMPARISON_KEYS)
    for (const k of COMPARISON_KEYS) expect([k, statuses[k]]).toEqual([k, 'ok'])
    expect(countOk(statuses)).toBe(COMPARISON_KEYS.length)
  })

  it('en tom sajt får bad/warning enligt checkBuilder (canonical saknas = warning)', () => {
    const statuses = evaluateComparisonStatuses({ url: 'https://www.tom.se/', scraperData: scraped(), enhancedData: enhanced() })
    expect(statuses.localBusiness).toBe('bad')
    expect(statuses.faqSchema).toBe('bad')
    expect(statuses.llmsTxt).toBe('bad')
    expect(statuses.robotsTxt).toBe('bad')
    expect(statuses.sitemap).toBe('bad')
    expect(statuses.canonical).toBe('warning')
    expect(statuses.https).toBe('ok')
    expect(countOk(statuses)).toBe(1)
  })

  it('robots.txt som egentligen är en HTML-sida räknas som saknad, utan att mutera indata', () => {
    const enh = enhanced({ robotsTxt: '<html><body>Sidan finns inte</body></html>' })
    const statuses = evaluateComparisonStatuses({ url: 'https://x.se/', scraperData: scraped(), enhancedData: enh })
    expect(statuses.robotsTxt).toBe('bad')
    expect(enh.robotsTxt).toBe('<html><body>Sidan finns inte</body></html>')
  })

  it('FAQPage-schema på en undersida räknas via checkBuilders scraper-override', () => {
    const statuses = evaluateComparisonStatuses({
      url: 'https://x.se/',
      scraperData: scraped({}, [page({ url: 'https://x.se/' }), page({ url: 'https://x.se/fragor', schemaTypes: ['FAQPage'] })]),
      enhancedData: enhanced(),
    })
    expect(statuses.faqSchema).toBe('ok')
  })

  it('https bedöms på slutlig URL efter redirect (http → https)', () => {
    const statuses = evaluateComparisonStatuses({
      url: 'http://x.se',
      scraperData: scraped({}, [page({ url: 'https://x.se/' })]),
      enhancedData: enhanced(),
    })
    expect(statuses.https).toBe('ok')
  })
})

describe('diffStatuses', () => {
  it('ok mot bad/warning är en skillnad; notMeasured/notApplicable ignoreras', () => {
    const you = { ...allStatuses('ok'), faqSchema: 'bad', canonical: 'warning', phone: 'notMeasured', h1: 'ok' } as Record<string, Status>
    const them = { ...allStatuses('ok'), llmsTxt: 'bad', phone: 'ok', h1: 'notApplicable' } as Record<string, Status>
    const { theyAhead, youAhead } = diffStatuses(you, them)
    expect(theyAhead).toEqual(['canonical', 'faqSchema'])
    expect(youAhead).toEqual(['llmsTxt'])
  })
})

function outcome(name: string, statuses: Record<string, Status> | null): CompetitorScanOutcome {
  const c = competitor(name, `https://www.${name.toLowerCase().replace(/\s+/g, '')}.se/`) as CompetitorWithWebsite
  return { competitor: c, statuses, error: statuses ? null : 'timeout efter 25000 ms', ms: 10 }
}

describe('buildCompetitorComparison', () => {
  it('null när ingen konkurrent med webbplats fanns', () => {
    expect(buildCompetitorComparison(allStatuses('ok'), [])).toBeNull()
  })

  it('räknar okCount, markerar oscannade konkurrenter och följer Zod-schemat', () => {
    const you = { ...allStatuses('bad'), https: 'ok', title: 'ok' } as Record<string, Status>
    const result = buildCompetitorComparison(you, [
      outcome('Kometen', { ...allStatuses('ok'), llmsTxt: 'bad' }),
      outcome('Seg Sajt', null),
    ])!
    expect(result.keys).toEqual(COMPARISON_KEYS)
    expect(result.you.okCount).toBe(2)
    expect(result.competitors[0]).toMatchObject({ name: 'Kometen', website: 'https://www.kometen.se/', rating: 4.3, reviewCount: 100, scanned: true, okCount: COMPARISON_KEYS.length - 1 })
    expect(result.competitors[1]).toMatchObject({ name: 'Seg Sajt', scanned: false, statuses: {}, okCount: null })
    expect(CompetitorComparisonSchema.safeParse(result).success).toBe(true)
  })
})

describe('scanCompetitorSites', () => {
  it('scannar parallellt med tidsgräns per sajt och kastar aldrig', async () => {
    const selected = selectCompetitorsToScan([
      competitor('Kometen', 'https://www.kometen.se/'),
      competitor('Nere', 'https://nere.se/'),
      competitor('Seg', 'https://seg.se/'),
    ], 'https://www.tvakanten.se/')

    const requested: string[] = []
    const scraper = (url: string): Promise<CompetitorSiteData> => {
      requested.push(url)
      if (url.includes('kometen')) return Promise.resolve(fullSite())
      if (url.includes('nere')) return Promise.reject(new Error('Kunde inte hitta servern'))
      return new Promise(() => { /* svarar aldrig */ })
    }

    const started = Date.now()
    const outcomes = await scanCompetitorSites(selected, { scraper, timeoutMs: 60 })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(requested).toEqual(['https://www.kometen.se/', 'https://nere.se/', 'https://seg.se/'])
    expect(outcomes[0].statuses).not.toBeNull()
    expect(countOk(outcomes[0].statuses!)).toBe(COMPARISON_KEYS.length)
    expect(outcomes[1]).toMatchObject({ statuses: null, error: 'Kunde inte hitta servern' })
    expect(outcomes[2].statuses).toBeNull()
    expect(outcomes[2].error).toMatch(/timeout/)
  })
})

describe('formatComparisonForPrompt', () => {
  it('utan jämförelse förbjuds påståenden om konkurrenternas sajter', () => {
    expect(formatComparisonForPrompt(null)).toMatch(/påstå INGENTING/)
  })

  it('listar verifierade skillnader i båda riktningar, poäng och oscannade sajter', () => {
    const you = { ...allStatuses('ok'), faqSchema: 'bad' } as Record<string, Status>
    const comparison = buildCompetitorComparison(you, [
      outcome('Restaurang Kometen', { ...allStatuses('ok'), llmsTxt: 'bad' }),
      outcome('Tvilling', { ...allStatuses('ok'), faqSchema: 'bad' }),
      outcome('Seg Sajt', null),
    ])
    const text = formatComparisonForPrompt(comparison)
    expect(text).toContain(`Ni: ${COMPARISON_KEYS.length - 1}/${COMPARISON_KEYS.length} godkända.`)
    expect(text).toContain('Restaurang Kometen har FAQ-schema, ni inte.')
    expect(text).toContain('Ni har en llms.txt-fil, Restaurang Kometen inte.')
    expect(text).toContain('restaurangkometen.se, 4.3/5, 100 recensioner')
    expect(text).toContain('Tvilling (tvilling.se, 4.3/5, 100 recensioner): 13/14 godkända. Samma resultat som ni på alla kontroller.')
    expect(text).toContain('Seg Sajt (segsajt.se, 4.3/5, 100 recensioner): sajten kunde inte scannas')
    // Ingen kontroll skiljer ut er mot ALLA scannade konkurrenter → inga generaliseringar
    expect(text).toContain('Bara ni (ingen av de 2 scannade konkurrenterna): —.')
    expect(text).toContain('Alla 2 scannade konkurrenter har, men inte ni: —.')
    // Per kontroll: exakta har/saknar-listor (oscannade utelämnas), bara där det skiljer sig
    expect(text).toContain('- en llms.txt-fil — har: ni, Tvilling; saknar: Restaurang Kometen.')
    expect(text).toContain('- FAQ-schema — har: Restaurang Kometen; saknar: ni, Tvilling.')
    expect(text).not.toContain('- HTTPS —')
    expect(text).not.toMatch(/saknar:[^\n]*Seg Sajt/)
  })

  it('aggregaten "Bara ni" / "Alla konkurrenter" räknas bara över scannade konkurrenter', () => {
    const you = { ...allStatuses('ok'), faqSchema: 'bad' } as Record<string, Status>
    const comparison = buildCompetitorComparison(you, [
      outcome('Alfa', { ...allStatuses('ok'), llmsTxt: 'bad' }),
      outcome('Beta', { ...allStatuses('ok'), llmsTxt: 'warning', phone: 'notMeasured' }),
      outcome('Seg Sajt', null), // oscannad — får inte blockera eller bidra till aggregaten
    ])
    const text = formatComparisonForPrompt(comparison)
    expect(text).toContain('Bara ni (ingen av de 2 scannade konkurrenterna): en llms.txt-fil.')
    expect(text).toContain('Alla 2 scannade konkurrenter har, men inte ni: FAQ-schema.')
    // Beta är inte uppmätt på telefon → telefon hamnar inte i något aggregat
    expect(text).not.toMatch(/Bara ni[^\n]*telefon/)
  })
})
