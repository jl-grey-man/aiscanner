import { describe, it, expect } from 'vitest'
import { buildCheckResults } from '@/app/lib/checkBuilder'
import type { BuildCheckResultsParams } from '@/app/lib/checkBuilder'
import type { PageSummary, ScrapedData } from '@/app/lib/scraper'
import type { EnhancedData } from '@/app/lib/enhancedScraper'
import type { DirectoryResult } from '@/app/lib/directoryChecker'

/**
 * QA juni 2026 (docs/qa-run-2026-06/RESULTS.md, "Flash-bedömning för hård"): eatSignals fick
 * "bad" av Flash för tvakanten/roranalys/bjurfors trots att VERIFICATION-PROTOCOL.md's egen
 * trekravsräkning (Om oss-sida + organisationsnummer + minst en certifiering/namngiven person;
 * "warning" vid 1-2 av tre saknade, "bad" bara om alla tre saknas) ger "warning" för alla tre.
 *
 * Att bara skärpa prompttexten (buildEATPrompt i route.ts) räckte inte ensamt: Flash visade sig
 * nondeterministiskt i en verifieringskörning efter promptfixet — två identiska anrop mot
 * tvakanten.se på samma kod gav samma korrekt hopslagna found/missing-lista (cert+person som EN
 * post: "Certifieringsnyckelord eller namngivna personer/schema") men olika status: en gång
 * "warning", en gång "bad". checkBuilder.ts beräknar därför nu status ALLTID deterministiskt
 * från de tre scraper-fakta-signalerna, oavsett vad Flash själv råkar svara i `status`-fältet.
 */

function makePage(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    url: 'https://example.se/',
    title: 'Exempel AB',
    metaDescription: '',
    h1: 'Exempel',
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

/** Bygger checkResults med bara eatResult/enhancedData/page varierade — resten är neutrala defaults. */
function runEatSignals(opts: {
  page?: Partial<PageSummary>
  enhancedData?: Partial<EnhancedData>
  eatAiStatus: 'ok' | 'warning' | 'bad'
  eatAiFound?: string[]
  eatAiMissing?: string[]
}) {
  const params: BuildCheckResultsParams = {
    scraperData: {
      url: 'https://example.se',
      robotsTxt: null,
      sitemapXml: null,
      llmsTxt: null,
      sitemapUrlCount: null,
      pages: [makePage(opts.page)],
    } as ScrapedData,
    enhancedData: makeEnhancedData(opts.enhancedData),
    technicalResult: {},
    faqResult: {},
    eatResult: {
      eatSignals: {
        status: opts.eatAiStatus,
        found: opts.eatAiFound ?? [],
        missing: opts.eatAiMissing ?? [],
        finding: 'AI-genererad sammanfattning.',
        fix: 'AI-genererad åtgärd.',
      },
    },
    directoryResult: makeDirectoryResult(),
    aiMentionResult: null,
    reviewReplyResult: { total: 0, status: 'notMeasured', finding: '', fix: '', sampleNote: '' },
    placeData: null,
    url: 'https://example.se',
    isHttps: true,
    cwvMetrics: null,
    competitorList: null,
  }

  const checks = buildCheckResults(params)
  const eat = checks.find(c => c.key === 'eatSignals')
  if (!eat) throw new Error('eatSignals check missing from buildCheckResults output')
  return eat
}

describe('eatSignals status is decided deterministically from scraper facts, not from Flash\'s own status/count', () => {
  it('all three protocol signals present -> ok, even if Flash says otherwise', () => {
    const eat = runEatSignals({
      enhancedData: { hasAboutPage: true, orgNumberFound: '556677-8899', certificationKeywords: ['ISO'] },
      eatAiStatus: 'bad', // Flash disagrees — must be overridden
      eatAiFound: ['Om oss-sida'],
      eatAiMissing: [],
    })
    expect(eat.status).toBe('ok')
  })

  it('exactly 1 of 3 signals missing (org number) -> warning (roranalys.se truth case)', () => {
    const eat = runEatSignals({
      enhancedData: { hasAboutPage: true, orgNumberFound: null, certificationKeywords: ['ISO 14001'] },
      eatAiStatus: 'bad', // Flash originally said bad — must be corrected to warning
      eatAiFound: ['Om oss-sida', 'Certifieringar'],
      eatAiMissing: ['Organisationsnummer'],
    })
    expect(eat.status).toBe('warning')
  })

  it('2 of 3 signals missing (org number + cert/person) -> warning, REGARDLESS of what Flash\'s own status field says (tvakanten.se nondeterminism case)', () => {
    const baseEnhanced: Partial<EnhancedData> = { hasAboutPage: true, orgNumberFound: null, certificationKeywords: [], hasPersonSchema: false }
    const foundMissing = { eatAiFound: ['Om oss-sida'], eatAiMissing: ['Organisationsnummer', 'Certifieringsnyckelord eller namngivna personer/schema'] }

    // Verified live: two identical scans of the same site sometimes returned "warning", sometimes "bad"
    // from Flash for this exact found/missing data. Both must be forced to "warning" by checkBuilder.
    const runWarning = runEatSignals({ enhancedData: baseEnhanced, eatAiStatus: 'warning', ...foundMissing })
    const runBad = runEatSignals({ enhancedData: baseEnhanced, eatAiStatus: 'bad', ...foundMissing })

    expect(runWarning.status).toBe('warning')
    expect(runBad.status).toBe('warning')
  })

  it('bjurfors.se case: org number missing AND no certification/person schema (named owners are plain HTML, not schema) -> warning', () => {
    const eat = runEatSignals({
      page: {}, // no Person/Organization schema on any page
      enhancedData: { hasAboutPage: true, orgNumberFound: null, certificationKeywords: [], hasPersonSchema: false },
      eatAiStatus: 'bad',
      eatAiFound: ['Om Oss-sida'],
      eatAiMissing: ['Organisationsnummer', 'Certifieringar', 'Person-schema', 'Namngivna personer'],
    })
    expect(eat.status).toBe('warning')
  })

  it('all three signals missing -> bad (sprej.nu control case — must stay bad, not softened)', () => {
    const eat = runEatSignals({
      enhancedData: { hasAboutPage: false, orgNumberFound: null, certificationKeywords: [], hasPersonSchema: false },
      eatAiStatus: 'bad',
      eatAiFound: [],
      eatAiMissing: ['Om oss-sida', 'Organisationsnummer', 'Certifieringar', 'Person-schema', 'Namngivna personer'],
    })
    expect(eat.status).toBe('bad')
  })

  it('a Person schema (without certification keywords) satisfies the combined third signal', () => {
    const eat = runEatSignals({
      page: { schemaTypes: ['Person'] },
      enhancedData: { hasAboutPage: true, orgNumberFound: '556677-8899', certificationKeywords: [], hasPersonSchema: true },
      eatAiStatus: 'warning',
      eatAiFound: ['Om oss-sida', 'Organisationsnummer', 'Person-schema'],
      eatAiMissing: [],
    })
    expect(eat.status).toBe('ok')
  })
})
