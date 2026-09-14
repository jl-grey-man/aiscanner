import { describe, it, expect } from 'vitest'
import {
  scanCacheKey,
  cacheSkipReason,
  serializeFreeScan,
  parseCachedFreeScan,
  SCAN_CACHE_VERSION,
} from '@/app/lib/scanCache'
import type { ScanContext } from '@/app/lib/scanCache'
import { CHECK_REGISTRY, calculateScores } from '@/app/lib/scanResult'
import type { ScanResult, CheckResult } from '@/app/lib/scanResult'
import type { AIMentionResult } from '@/app/lib/aiMentionChecker'
import type { EnhancedData } from '@/app/lib/enhancedScraper'

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

function makeContext(): ScanContext {
  return {
    url: 'https://www.tvakanten.se',
    city: 'Göteborg',
    companyName: 'Tvåkanten',
    bransch: 'restaurang',
    isHttps: true,
    enhancedData: { robotsTxt: '', faqQuestions: ['Tar ni bokningar?'], openingHoursFromSchema: null } as unknown as EnhancedData,
    scrapedData: {
      url: 'https://www.tvakanten.se',
      robotsTxt: null,
      sitemapXml: '<urlset><url><loc>https://www.tvakanten.se/meny</loc></url></urlset>',
      llmsTxt: null,
      sitemapUrlCount: 1,
      pages: [],
    },
    placeForAnalysis: { id: 'place-1', displayName: { text: 'Tvåkanten' }, rating: 4.4 },
    reviews: [{ text: { text: 'Mycket god mat och trevlig personal.' }, rating: 5 }],
    reviewReplyResult: { total: 1, status: 'notMeasured', finding: 'f', fix: 'x', sampleNote: '' },
    technicalResult: { https: { status: 'ok' } },
    faqResult: { faqSchema: { status: 'bad' } },
    eatResult: { eatSignals: { status: 'warning' } },
    directoryResult: { status: 'warning', directories: [] },
    aiMentionResult: makeAiMention(),
    cwvMetrics: null,
    competitorList: [],
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

describe('serializeFreeScan / parseCachedFreeScan', () => {
  it('rundtur ger samma checks, samma poäng och samma kontext', () => {
    const scanResult = makeScanResult()
    const context = makeContext()
    const parsed = parseCachedFreeScan(serializeFreeScan(scanResult, context))

    expect(parsed).not.toBeNull()
    expect(parsed!.v).toBe(SCAN_CACHE_VERSION)
    expect(parsed!.scanResult).toEqual(scanResult)
    expect(parsed!.context).toEqual(context)
    // Poängkonsistensen som Task 12 handlar om: checks ur cachen ger exakt samma scores.
    expect(calculateScores(parsed!.scanResult.checks)).toEqual({ free: scanResult.scores.free, full: scanResult.scores.full })
  })

  it('behåller valfria fält på checks (strippas inte av valideringen)', () => {
    const parsed = parseCachedFreeScan(serializeFreeScan(makeScanResult(), makeContext()))
    const withSteps = parsed!.scanResult.checks.find(c => c.id === 3)
    expect(withSteps?.genericSteps).toBe('1. Gör så här')
  })

  it('trasig JSON ger null', () => {
    expect(parseCachedFreeScan('{inte json')).toBeNull()
  })

  it('fel version ger null', () => {
    const entry = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    entry.v = SCAN_CACHE_VERSION + 1
    expect(parseCachedFreeScan(JSON.stringify(entry))).toBeNull()
  })

  it('ogiltigt ScanResult (fel antal checks) ger null', () => {
    const scanResult = makeScanResult()
    scanResult.checks = scanResult.checks.slice(0, 36)
    expect(parseCachedFreeScan(serializeFreeScan(scanResult, makeContext()))).toBeNull()
  })

  it('ofullständig kontext ger null', () => {
    const entry = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete entry.context.scrapedData.pages
    expect(parseCachedFreeScan(JSON.stringify(entry))).toBeNull()

    const noContext = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete noContext.context
    expect(parseCachedFreeScan(JSON.stringify(noContext))).toBeNull()

    const noFlash = JSON.parse(serializeFreeScan(makeScanResult(), makeContext()))
    delete noFlash.context.technicalResult
    expect(parseCachedFreeScan(JSON.stringify(noFlash))).toBeNull()
  })
})
