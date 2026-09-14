import { describe, it, expect } from 'vitest'
import {
  scanCacheKey,
  cacheSkipReason,
  serializeFreeScan,
  parseCachedFreeScan,
  toCachedContext,
  restoreScanContext,
  diffCachedStatuses,
  SCAN_CACHE_VERSION,
} from '@/app/lib/scanCache'
import type { ScanContext } from '@/app/lib/scanCache'
import { CHECK_REGISTRY, calculateScores } from '@/app/lib/scanResult'
import type { ScanResult, CheckResult } from '@/app/lib/scanResult'
import type { AIMentionResult } from '@/app/lib/aiMentionChecker'
import type { EnhancedData } from '@/app/lib/enhancedScraper'
import type { PageSummary } from '@/app/lib/scraper'

function makeChecks(): CheckResult[] {
  return CHECK_REGISTRY.map((e): CheckResult => ({
    id: e.id,
    key: e.key,
    status: e.id % 3 === 0 ? 'bad' : e.id % 4 === 0 ? 'warning' : 'ok',
    source: 'scraper',
    finding: `Fynd för ${e.key}`,
    fix: e.id % 3 === 0 ? 'Åtgärda detta.' : null,
    data: null,
    codeExample: null,
    priority: e.id % 3 === 0 ? 'important' : null,
    tier: e.tier,
    genericSteps: e.id % 3 === 0 ? '1. Gör så här' : null,
  }))
}

function makeScanResult(): ScanResult {
  const checks = makeChecks()
  const scores = calculateScores(checks)
  return {
    meta: {
      url: 'https://www.tvakanten.se',
      domain: 'tvakanten.se',
      city: 'Göteborg',
      bransch: 'restaurang',
      companyName: 'Tvåkanten',
      scanDate: '2026-09-14T10:00:00.000Z',
      scanId: 'scan-test',
    },
    scores: { free: scores.free, full: scores.full, google: 4.4, googleCount: 1200 },
    checks,
    synthesis: { actionPlan: '### Kritiskt', competitorNote: 'x', reviewAnalysis: null, summary: 'y' },
    gbp: null,
    directories: {
      foundInSameAs: [],
      directories: [],
      foundCount: 0,
      totalChecked: 0,
      napConsistency: {
        checked: false,
        consistent: null,
        phone: { values: [], consistent: null },
        address: { values: [], consistent: null },
        finding: '',
        fix: '',
      },
      status: 'warning',
      finding: '',
      fix: '',
    },
    aiMentions: null,
    reviewReplies: { total: 0, status: 'notMeasured', finding: '', fix: '', sampleNote: '' },
    reviewInsights: null,
    competitorComparison: null,
  }
}

function makeAiMention(overrides: Partial<AIMentionResult> = {}): AIMentionResult {
  return {
    entityQuery: 'Vad vet du om Tvåkanten i Göteborg?',
    entityResponse: 'Tvåkanten är en restaurang.',
    entityKnows: true,
    entityClassification: 'knows',
    entitySentiment: 'neutral',
    factChecks: [],
    extractedNiche: 'restaurang',
    categoryQuery: '',
    categoryResponse: '',
    categoryMentioned: false,
    status: 'warning',
    finding: 'AI känner till er.',
    fix: '',
    errored: false,
    ...overrides,
  }
}

// Places-värden i kontexten — får ALDRIG hamna i den serialiserade cacheraden.
const PLACES_VALUES = ['Testgatan 12', '031-700 12 34', 'Mycket god mat och trevlig personal.', 'Konkurrent Alfa', 'tisdag: 11:00–22:00']

function makeContext(): ScanContext {
  return {
    url: 'https://www.krogentest.se',
    city: 'Göteborg',
    companyName: 'Krogen Test',
    bransch: 'restaurang',
    isHttps: true,
    enhancedData: { robotsTxt: '', faqQuestions: ['Tar ni bokningar?'], openingHoursFromSchema: null } as unknown as EnhancedData,
    scrapedData: {
      url: 'https://www.krogentest.se',
      robotsTxt: null,
      sitemapXml: '<urlset><url><loc>https://www.krogentest.se/meny</loc></url></urlset>',
      llmsTxt: null,
      sitemapUrlCount: 1,
      pages: [{ title: 'Restaurang Krogen Test' } as PageSummary],
    },
    placeForAnalysis: {
      id: 'ChIJtest-krogen',
      displayName: { text: 'Krogen Test' },
      rating: 4.4,
      formattedAddress: 'Testgatan 12, 411 36 Göteborg, Sverige',
      nationalPhoneNumber: '031-700 12 34',
      regularOpeningHours: { weekdayDescriptions: ['tisdag: 11:00–22:00'] },
    },
    reviews: [{ text: { text: 'Mycket god mat och trevlig personal.' }, rating: 5 }],
    reviewReplyResult: { total: 1, status: 'notMeasured', finding: 'f', fix: 'x', sampleNote: '' },
    technicalResult: { https: { status: 'ok' } },
    faqResult: { faqSchema: { status: 'bad' } },
    eatResult: { eatSignals: { status: 'warning' } },
    directoryResult: { status: 'warning', directories: [] },
    aiMentionResult: makeAiMention(),
    cwvMetrics: null,
    competitorList: [{ placeId: 'ChIJtest-alfa', name: 'Konkurrent Alfa', rating: 4.3, userRatingCount: 10, distanceMeters: 100, primaryType: 'bar', websiteUri: null }],
    placeId: 'ChIJtest-krogen',
    domainMatch: true,
    placeWarning: null,
  }
}

describe('scanCacheKey', () => {
  it('normaliserar värdens skiftläge, avslutande snedstreck och stadens skiftläge/blanksteg', () => {
    expect(scanCacheKey('https://www.Tvakanten.SE/', ' Göteborg ')).toBe('https://www.tvakanten.se|göteborg')
    expect(scanCacheKey('https://www.tvakanten.se', 'göteborg')).toBe('https://www.tvakanten.se|göteborg')
  })

  it('behandlar saknad stad (null, undefined, tom sträng) som samma nyckel', () => {
    const a = scanCacheKey('https://sprej.nu', null)
    expect(a).toBe('https://sprej.nu|')
    expect(scanCacheKey('https://sprej.nu', undefined)).toBe(a)
    expect(scanCacheKey('https://sprej.nu/', '  ')).toBe(a)
  })

  it('gemener även för å/ä/ö och slår ihop inre blanksteg', () => {
    expect(scanCacheKey('https://a.se', 'ÄNGELHOLM')).toBe('https://a.se|ängelholm')
    expect(scanCacheKey('https://a.se', 'Upplands   Väsby')).toBe('https://a.se|upplands väsby')
  })

  it('tar bort fragment och standardport men behåller sökväg och query', () => {
    expect(scanCacheKey('https://a.se:443/meny/#lunch', '')).toBe('https://a.se/meny|')
    expect(scanCacheKey('https://a.se/?lang=sv', '')).toBe('https://a.se?lang=sv|')
  })

  it('skiljer på http/https, www/utan www och olika städer', () => {
    const base = scanCacheKey('https://www.a.se', 'Umeå')
    expect(scanCacheKey('http://www.a.se', 'Umeå')).not.toBe(base)
    expect(scanCacheKey('https://a.se', 'Umeå')).not.toBe(base)
    expect(scanCacheKey('https://www.a.se', 'Luleå')).not.toBe(base)
  })

  it('returnerar null för URL:er som inte går att tolka eller inte är http(s)', () => {
    expect(scanCacheKey('inte en url', 'Umeå')).toBeNull()
    expect(scanCacheKey('ftp://a.se', 'Umeå')).toBeNull()
  })
})

describe('cacheSkipReason', () => {
  it('tillåter cachning av en giltig scan utan misslyckade bedömningar', () => {
    expect(cacheSkipReason({ failedAssessments: [], aiMentionResult: makeAiMention(), scanResultValid: true })).toBeNull()
  })

  it('cachar inte när en Flash-bedömning föll tillbaka', () => {
    const reason = cacheSkipReason({ failedAssessments: ['technical', 'eat'], aiMentionResult: makeAiMention(), scanResultValid: true })
    expect(reason).toContain('technical')
    expect(reason).toContain('eat')
  })

  it('cachar inte när AI-testet misslyckades eller saknas', () => {
    expect(cacheSkipReason({ failedAssessments: [], aiMentionResult: makeAiMention({ errored: true }), scanResultValid: true })).not.toBeNull()
    expect(cacheSkipReason({ failedAssessments: [], aiMentionResult: null, scanResultValid: true })).not.toBeNull()
  })

  it('cachar inte ett ScanResult som inte klarade Zod-valideringen', () => {
    expect(cacheSkipReason({ failedAssessments: [], aiMentionResult: makeAiMention(), scanResultValid: false })).not.toBeNull()
  })
})

describe('serializeFreeScan / parseCachedFreeScan (v2 — inget Places-innehåll)', () => {
  it('serialiserad cacherad innehåller place_id men inga Places-värden', () => {
    const json = serializeFreeScan(makeScanResult(), makeContext())
    for (const value of PLACES_VALUES) expect(json).not.toContain(value)
    expect(json).toContain('ChIJtest-krogen')
    const raw = JSON.parse(json)
    for (const key of ['placeForAnalysis', 'reviews', 'reviewReplyResult', 'competitorList', 'companyName', 'bransch']) {
      expect(raw.context).not.toHaveProperty(key)
    }
    expect(raw).not.toHaveProperty('scanResult')
  })

  it('toCachedContext är en vitlista — okända fält följer inte med', () => {
    const ctx = { ...makeContext(), extraPlacesField: 'Testgatan 12' } as ScanContext
    expect(JSON.stringify(toCachedContext(ctx))).not.toContain('Testgatan 12')
  })

  it('rundtur ger samma kontext (utan Places-delar), scanDate, poäng och statusar', () => {
    const scanResult = makeScanResult()
    const context = makeContext()
    const parsed = parseCachedFreeScan(serializeFreeScan(scanResult, context))

    expect(parsed).not.toBeNull()
    expect(parsed!.v).toBe(SCAN_CACHE_VERSION)
    expect(parsed!.context).toEqual(toCachedContext(context))
    expect(parsed!.scanDate).toBe(scanResult.meta.scanDate)
    expect(parsed!.scores).toEqual({ free: scanResult.scores.free, full: scanResult.scores.full })
    expect(parsed!.statuses.https).toBe(scanResult.checks[0].status)
    expect(Object.keys(parsed!.statuses)).toHaveLength(37)
  })

  it('trasig JSON ger null', () => {
    expect(parseCachedFreeScan('{inte json')).toBeNull()
  })

  it('fel version (t.ex. v1 med rå Places-data) ger null', () => {
    const entry = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    entry.v = 1
    expect(parseCachedFreeScan(JSON.stringify(entry))).toBeNull()
  })

  it('ofullständig rad ger null', () => {
    const entry = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete entry.context.scrapedData.pages
    expect(parseCachedFreeScan(JSON.stringify(entry))).toBeNull()

    const noContext = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete noContext.context
    expect(parseCachedFreeScan(JSON.stringify(noContext))).toBeNull()

    const noFlash = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete noFlash.context.technicalResult
    expect(parseCachedFreeScan(JSON.stringify(noFlash))).toBeNull()

    const noScores = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete noScores.scores
    expect(parseCachedFreeScan(JSON.stringify(noScores))).toBeNull()
  })
})

describe('restoreScanContext', () => {
  const freshPlace = {
    id: 'ChIJtest-krogen',
    displayName: { text: 'Krogen Test' },
    primaryType: 'bar',
    types: ['bar'],
    userRatingCount: 321,
    reviews: [{ text: { text: 'A' } }, { text: { text: 'B' } }],
    _domainMatch: true,
  }

  it('bygger Places-delarna av färsk data med samma härledning som insamlingsfasen', () => {
    const cached = parseCachedFreeScan(serializeFreeScan(makeScanResult(), makeContext()))!.context
    const competitorList = makeContext().competitorList
    const ctx = restoreScanContext(cached, { place: freshPlace, competitorList })
    expect(ctx.companyName).toBe('Krogen Test')
    expect(ctx.bransch).toBe('bar')
    expect(ctx.placeForAnalysis).toBe(freshPlace)
    expect(ctx.reviews).toHaveLength(2)
    expect(ctx.reviewReplyResult.total).toBe(2)
    expect(ctx.reviewReplyResult.sampleNote).toContain('totalt 321')
    expect(ctx.competitorList).toBe(competitorList)
    expect(ctx.url).toBe(cached.url)
    expect(ctx.technicalResult).toEqual(cached.technicalResult)
  })

  it('utan färsk plats: företagsnamn från sajtens title, inga recensioner', () => {
    const cached = toCachedContext(makeContext())
    const ctx = restoreScanContext(cached, { place: null, competitorList: [] })
    expect(ctx.companyName).toBe('Restaurang Krogen Test')
    expect(ctx.placeForAnalysis).toBeNull()
    expect(ctx.reviews).toEqual([])
    expect(ctx.reviewReplyResult.total).toBe(0)
  })
})

describe('diffCachedStatuses', () => {
  it('listar bara checks vars status ändrats', () => {
    const checks = [
      { key: 'openingHours', status: 'notMeasured' },
      { key: 'https', status: 'ok' },
    ] as Pick<CheckResult, 'key' | 'status'>[]
    expect(diffCachedStatuses({ openingHours: 'ok', https: 'ok' }, checks)).toEqual(['openingHours: ok → notMeasured'])
    expect(diffCachedStatuses({ openingHours: 'notMeasured', https: 'ok' }, checks)).toEqual([])
  })
})
