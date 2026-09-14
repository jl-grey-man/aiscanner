import { describe, it, expect } from 'vitest'
import {
  computeWeightedPriorities,
  buildOpeningHoursCheck,
  MAX_CRITICAL_CHECKS,
} from '@/app/lib/checkBuilder'
import type { CheckKey, CheckResult } from '@/app/lib/scanResult'

type Status = CheckResult['status']

describe('computeWeightedPriorities (Audit #12)', () => {
  it('sätter aldrig kritiskt/viktigt/bra-att-ha på ok/notMeasured/notApplicable', () => {
    const entries: { key: CheckKey; status: Status }[] = [
      { key: 'https', status: 'ok' },
      { key: 'robotsTxt', status: 'notMeasured' },
      { key: 'synthesis', status: 'notApplicable' },
    ]
    const result = computeWeightedPriorities(entries)
    expect(result.size).toBe(0)
  })

  it('MAX_CRITICAL_CHECKS är 3', () => {
    expect(MAX_CRITICAL_CHECKS).toBe(3)
  })

  it('kritiska checkar begränsas till MAX_CRITICAL_CHECKS även när alla är bad (Sprej-scenariot: 13 bad-checks)', () => {
    // 13 bad checks med blandad CHECK_REGISTRY-vikt — som Sprejs riktiga paid-scan,
    // där ALLA 13 tidigare blev "Kritiskt" bara för att status var 'bad'.
    const badKeys = [
      'aiMentions', 'localBusiness', 'reviewReplies', 'gbpData', 'aiCrawlers',
      'faqSchema', 'contentDepth', 'eatSignals', 'directories', 'napConsistency',
      'https', 'robotsTxt', 'sitemap',
    ] as const
    const entries = badKeys.map((key) => ({ key, status: 'bad' as Status }))
    const result = computeWeightedPriorities(entries)

    const critical = badKeys.filter((k) => result.get(k) === 'critical')
    expect(critical.length).toBe(MAX_CRITICAL_CHECKS)

    // Högst vikt (full): aiMentions=5, sedan localBusiness/reviewReplies/gbpData=4 (id-tiebreak).
    expect(critical).toEqual(['aiMentions', 'localBusiness', 'reviewReplies'])

    // Resten av bad-checkarna som inte fick plats blir 'important', aldrig kritiska.
    expect(result.get('gbpData')).toBe('important')
    expect(result.get('sitemap')).toBe('important')
    for (const k of badKeys) {
      expect(result.get(k)).not.toBe(undefined)
      if (!critical.includes(k)) expect(result.get(k)).toBe('important')
    }
  })

  it('väger status OCH vikt tillsammans -- en varning med hög vikt kan ta en kritisk-plats från en bad-check med låg vikt', () => {
    const entries: { key: CheckKey; status: Status }[] = [
      { key: 'localBusiness', status: 'bad' },   // vikt 4 x 1.0 = 4.0
      { key: 'faqSchema', status: 'bad' },        // vikt 3 x 1.0 = 3.0
      { key: 'aiMentions', status: 'warning' },   // vikt 5 x 0.5 = 2.5
      { key: 'llmsTxt', status: 'bad' },          // vikt 2 x 1.0 = 2.0
    ]
    const result = computeWeightedPriorities(entries)

    expect(result.get('localBusiness')).toBe('critical')
    expect(result.get('faqSchema')).toBe('critical')
    // aiMentions är bara 'warning', men vikten (5) gör att den ändå slår ut
    // llmsTxt (vikt 2, status 'bad') om den tredje kritiska platsen.
    expect(result.get('aiMentions')).toBe('critical')
    expect(result.get('llmsTxt')).toBe('important')
  })

  it('är deterministisk -- lika input ger alltid samma output, med tie-break på stigande CHECK_REGISTRY-id', () => {
    // https(1), robotsTxt(2), sitemap(4), canonical(6) -- alla vikt.full=2, alla 'bad' -> exakt samma impact-poäng.
    const entries: { key: CheckKey; status: Status }[] = [
      { key: 'canonical', status: 'bad' },
      { key: 'sitemap', status: 'bad' },
      { key: 'https', status: 'bad' },
      { key: 'robotsTxt', status: 'bad' },
    ]
    const run1 = computeWeightedPriorities(entries)
    const run2 = computeWeightedPriorities([...entries])
    expect([...run1.entries()]).toEqual([...run2.entries()])

    // Tie-break: lägst id vinner -> https(1), robotsTxt(2), sitemap(4) blir kritiska, canonical(6) blir 'important'.
    expect(run1.get('https')).toBe('critical')
    expect(run1.get('robotsTxt')).toBe('critical')
    expect(run1.get('sitemap')).toBe('critical')
    expect(run1.get('canonical')).toBe('important')
  })

  it('varningar som inte får kritisk-plats blir "nice", inte "important"', () => {
    const entries: { key: CheckKey; status: Status }[] = [
      { key: 'localBusiness', status: 'bad' },
      { key: 'faqSchema', status: 'bad' },
      { key: 'eatSignals', status: 'bad' },
      { key: 'openingHours', status: 'warning' }, // vikt 2 x 0.5 = 1.0, hamnar sist
    ]
    const result = computeWeightedPriorities(entries)
    expect(result.get('openingHours')).toBe('nice')
  })
})

describe('buildOpeningHoursCheck (Task 18 Steg 2)', () => {
  it('använder Google Business Profile-tider när de finns', () => {
    const res = buildOpeningHoursCheck(['måndag 10–18', 'tisdag 10–18'], null)
    expect(res.status).toBe('ok')
    expect(res.source).toBe('api')
    expect(res.finding).toContain('Google Business Profile')
    expect(res.data).toEqual({ weekdayDescriptions: ['måndag 10–18', 'tisdag 10–18'] })
  })

  it('faller tillbaka på schema-markup när GBP saknar öppettider', () => {
    const schemaHours = [{ dayOfWeek: 'Monday', opens: '10:00', closes: '18:00' }]
    const res = buildOpeningHoursCheck(undefined, schemaHours)
    expect(res.status).toBe('ok')
    expect(res.source).toBe('scraper')
    expect(res.finding).toBe('Öppettider hittades i webbplatsens schema-markup.')
    expect(res.fix).toBeNull()
    expect(res.data).toEqual({ openingHoursFromSchema: schemaHours })
  })

  it('blir notMeasured när varken GBP eller schema har öppettider', () => {
    const res = buildOpeningHoursCheck(undefined, null)
    expect(res.status).toBe('notMeasured')
    expect(res.fix).toContain('Google Business Profile')
    expect(res.data).toBeNull()
  })

  it('behandlar en tom schema-array som saknade öppettider', () => {
    const res = buildOpeningHoursCheck([], [])
    expect(res.status).toBe('notMeasured')
  })

  it('GBP-tider vinner över schema när båda finns', () => {
    const schemaHours = [{ dayOfWeek: 'Monday', opens: '10:00', closes: '18:00' }]
    const res = buildOpeningHoursCheck(['måndag 10–18'], schemaHours)
    expect(res.source).toBe('api')
    expect(res.finding).toContain('Google Business Profile')
  })
})
