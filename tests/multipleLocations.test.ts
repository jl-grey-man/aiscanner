import { describe, it, expect } from 'vitest'
import { buildCheckResults, buildCompetitorsNotMeasuredFinding } from '@/app/lib/checkBuilder'
import type { BuildCheckResultsParams } from '@/app/lib/checkBuilder'
import type { PageSummary, ScrapedData } from '@/app/lib/scraper'
import type { EnhancedData } from '@/app/lib/enhancedScraper'
import type { DirectoryResult } from '@/app/lib/directoryChecker'
import { ScanResultSchema } from '@/app/lib/scanResult'
import { buildPaidReport } from './fixtures/placesFixture'

/**
 * bjurfors.se-buggen (Checklist.md juni 2026, docs/qa-run-2026-06/RESULTS.md): en nationell
 * kedja scannad UTAN stad fick sina Google Business Profile-beroende kontroller (öppettider,
 * betyg, konkurrenter) attribuerade till ett SLUMPMÄSSIGT kontor (Kungälv/Spanien i stället
 * för HQ Göteborg) eftersom findBusinessByUrl bara tittade på Googles första träff.
 *
 * Fix: findBusinessByUrl (places.ts) upptäcker när domänen matchar FLERA distinkta kontor
 * och ingen stad angavs -- då attribueras INGEN specifik profil (placeData=null till
 * checkBuilder), och `multipleLocations` skickas med så de GBP-beroende checkarna får en
 * finding som ber om stad i stället för den generiska "ingen profil hittades"-texten.
 */

function makePage(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    url: 'https://www.bjurfors.se/',
    title: 'Bjurfors',
    metaDescription: '',
    h1: 'Bjurfors',
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
    altTextCoverage: { total: 0, withAlt: 0, percentage: 0 },
    internalLinks: { total: 0, uniquePages: 0, hasContactLink: false, hasAboutLink: false, hasServicesLink: false, paths: [] },
    semanticHTML: { hasMain: true, hasArticle: false, hasSection: false, hasNav: true, hasAside: false, langAttribute: 'sv' },
    ...overrides,
  }
}

function makeEnhancedData(overrides: Partial<EnhancedData> = {}): EnhancedData {
  return {
    robotsTxt: '',
    aiCrawlersBlocked: [],
    aiCrawlerBlocks: [],
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    hasOgTags: false,
    socialLinks: [],
    sameAsLinks: [],
    hreflangTags: [],
    hasLanguageSwitcher: false,
    hasFAQSchema: false,
    faqQuestions: [],
    hasFAQContent: false,
    hasServiceSchema: false,
    hasMenuSchema: false,
    hasProductSchema: false,
    serviceSchemaTypes: [],
    sitemapPageCount: 0,
    hasBlogOrGuide: false,
    blogPaths: [],
    hasAboutPage: false,
    orgNumberFound: null,
    certificationKeywords: [],
    hasPersonSchema: false,
    namedPersons: [],
    openingHoursFromSchema: null,
    ...overrides,
  }
}

function makeDirectoryResult(): DirectoryResult {
  return {
    foundInSameAs: [],
    directories: [],
    foundCount: 0,
    totalChecked: 0,
    napConsistency: { consistent: true, values: {} } as unknown as DirectoryResult['napConsistency'],
    status: 'warning',
    finding: '',
    fix: '',
  }
}

/** Bygger checkResults med placeData/multipleLocations varierade -- resten neutrala defaults. */
function runChecks(opts: { placeData: Record<string, unknown> | null; multipleLocations?: { count: number } | null }) {
  const params: BuildCheckResultsParams = {
    scraperData: {
      url: 'https://www.bjurfors.se',
      robotsTxt: null,
      sitemapXml: null,
      llmsTxt: null,
      sitemapUrlCount: null,
      pages: [makePage()],
    } as ScrapedData,
    enhancedData: makeEnhancedData(),
    technicalResult: {},
    faqResult: {},
    eatResult: {},
    directoryResult: makeDirectoryResult(),
    aiMentionResult: null,
    reviewReplyResult: { total: 0, status: 'notMeasured', finding: '', fix: '', sampleNote: '' },
    placeData: opts.placeData,
    url: 'https://www.bjurfors.se',
    isHttps: true,
    cwvMetrics: null,
    competitorList: null,
    multipleLocations: opts.multipleLocations,
  }
  return buildCheckResults(params)
}

describe('GBP-beroende checks vid flera kontor och ingen stad (bjurfors.se-buggen)', () => {
  it('gbpData: generisk "ingen profil"-text när platsdata saknas UTAN ambiguitet', () => {
    const checks = runChecks({ placeData: null, multipleLocations: null })
    const gbp = checks.find(c => c.key === 'gbpData')!
    expect(gbp.status).toBe('notMeasured')
    expect(gbp.finding).toBe('Google Business Profile-data kunde inte hämtas.')
    expect(gbp.finding).not.toContain('Ange stad')
  })

  it('gbpData: ber om stad när flera kontor hittades och ingen attribuerades', () => {
    const checks = runChecks({ placeData: null, multipleLocations: { count: 15 } })
    const gbp = checks.find(c => c.key === 'gbpData')!
    expect(gbp.status).toBe('notMeasured')
    expect(gbp.finding).toContain('15 st')
    expect(gbp.finding).toContain('ange stad')
    expect(gbp.fix).toBe('Ange stad i sökrutan och skanna igen.')
  })

  it('gbpData: attribuerar normalt när en specifik plats hittades, oavsett multipleLocations', () => {
    const checks = runChecks({ placeData: { rating: 4.5, userRatingCount: 20, displayName: { text: 'Bjurfors Göteborg' } }, multipleLocations: null })
    const gbp = checks.find(c => c.key === 'gbpData')!
    expect(gbp.status).toBe('ok')
    expect(gbp.finding).toContain('Bjurfors Göteborg')
  })

  it('competitors: ber om stad i stället för "GBP/positionsdata saknas" när flera kontor hittades', () => {
    const checks = runChecks({ placeData: null, multipleLocations: { count: 15 } })
    const competitors = checks.find(c => c.key === 'competitors')!
    expect(competitors.status).toBe('notMeasured')
    expect(competitors.finding).toContain('15 kontor')
    expect(competitors.finding).toContain('Ange stad')
    expect(competitors.fix).toBe('Ange stad i sökrutan och skanna igen.')
  })

  it('openingHours: ber om stad i stället för generisk "kräver Google Business Profile"-text', () => {
    const checks = runChecks({ placeData: null, multipleLocations: { count: 15 } })
    const oh = checks.find(c => c.key === 'openingHours')!
    expect(oh.status).toBe('notMeasured')
    expect(oh.finding).toContain('15 st')
    expect(oh.finding).toContain('ange stad')
  })

  it('openingHours: schema-fallback fungerar oförändrat även med multipleLocations satt (schema vinner före ambiguitetstexten)', () => {
    const checks = runChecks({
      placeData: null,
      multipleLocations: { count: 15 },
    })
    // Utan schema-öppettider (default) ska ambiguitetstexten visas -- redan verifierat ovan.
    // Med schema-öppettider ska den vanliga schema-baserade texten vinna i stället.
    const params: BuildCheckResultsParams = {
      scraperData: { url: 'https://www.bjurfors.se', robotsTxt: null, sitemapXml: null, llmsTxt: null, sitemapUrlCount: null, pages: [makePage()] } as ScrapedData,
      enhancedData: makeEnhancedData({ openingHoursFromSchema: ['mon 09-17'] as unknown as EnhancedData['openingHoursFromSchema'] }),
      technicalResult: {},
      faqResult: {},
      eatResult: {},
      directoryResult: makeDirectoryResult(),
      aiMentionResult: null,
      reviewReplyResult: { total: 0, status: 'notMeasured', finding: '', fix: '', sampleNote: '' },
      placeData: null,
      url: 'https://www.bjurfors.se',
      isHttps: true,
      cwvMetrics: null,
      competitorList: null,
      multipleLocations: { count: 15 },
    }
    const oh2 = buildCheckResults(params).find(c => c.key === 'openingHours')!
    expect(oh2.status).toBe('ok')
    expect(oh2.finding).toBe('Öppettider hittades i webbplatsens schema-markup.')
  })
})

describe('buildCompetitorsNotMeasuredFinding med multipleLocations', () => {
  it('nämner antalet kontor och ber om stad', () => {
    const finding = buildCompetitorsNotMeasuredFinding(null, { count: 15 })
    expect(finding).toContain('15 kontor')
    expect(finding).toContain('Ange stad')
  })

  it('utan multipleLocations: oförändrad generisk text', () => {
    expect(buildCompetitorsNotMeasuredFinding(null)).toBe('Närliggande konkurrenter kunde inte hämtas — Google Business Profile eller positionsdata saknas.')
    expect(buildCompetitorsNotMeasuredFinding(null, null)).toBe('Närliggande konkurrenter kunde inte hämtas — Google Business Profile eller positionsdata saknas.')
  })

  it('location+primaryType vinner alltid, oavsett multipleLocations (roranalys-fallet har företräde)', () => {
    const finding = buildCompetitorsNotMeasuredFinding(
      { location: { latitude: 1, longitude: 2 }, primaryType: 'general_contractor' },
      { count: 15 },
    )
    expect(finding).toContain('hittade inga företag av samma typ i närheten')
  })
})

describe('ScanResultSchema.meta.multipleLocations', () => {
  it('accepterar null (normalfallet)', () => {
    const report = buildPaidReport()
    report.meta.multipleLocations = null
    expect(ScanResultSchema.safeParse(report).success).toBe(true)
  })

  it('accepterar { count, cities } (bjurfors.se-fallet)', () => {
    const report = buildPaidReport()
    report.meta.multipleLocations = { count: 15, cities: ['Göteborg', 'Kungälv'] }
    expect(ScanResultSchema.safeParse(report).success).toBe(true)
  })

  it('äldre payload utan fältet alls validerar fortfarande (optional)', () => {
    const report = buildPaidReport()
    delete (report.meta as { multipleLocations?: unknown }).multipleLocations
    expect(ScanResultSchema.safeParse(report).success).toBe(true)
  })
})
