import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  planBatches,
  callLimitsFor,
  runWithConcurrency,
  enrichChecksWithReportWriter,
  applyRichData,
  type CallOpenRouterFn,
  type RichCheckData,
} from '@/app/lib/reportWriter'
import type { CheckResult, CheckKey } from '@/app/lib/scanResult'

const PRO = 'google/gemini-2.5-pro'
const FLASH = 'google/gemini-2.5-flash'

function check(key: CheckKey, status: CheckResult['status'] = 'bad'): CheckResult {
  return {
    id: 1, key, status, source: 'scraper', finding: `fynd för ${key}`, fix: null,
    data: null, codeExample: null, priority: 'important', tier: 'free',
  }
}

const meta = { companyName: 'Testbolaget', bransch: 'restaurang', city: 'Göteborg', url: 'https://test.se', domain: 'test.se' }

/** Nycklarna som ett anrops prompt ber om (plockas ur "exakt dessa nycklar: ..."-raden). */
function keysInPrompt(userPrompt: string): string[] {
  const line = userPrompt.split('\n').find(l => l.includes('exakt dessa nycklar:'))!
  return [...line.matchAll(/"([A-Za-z]+)"/g)].map(m => m[1])
}

function fullAnswer(keys: string[], model = 'x') {
  return Object.fromEntries(keys.map(k => [k, {
    richRelevance: `Testbolaget påverkas av ${k} (${model})`,
    richSteps: `1. Fixa ${k}`,
    richCodeExample: `<script type="application/ld+json">{"@type":"Restaurant","name":"Testbolaget ${k}"}</script>`,
  }]))
}

const fast = { retryBaseDelayMs: 0 }

describe('planBatches', () => {
  it('delar upp i batchar om högst 3, sorterat på kategori och registry-id', () => {
    const checks = [
      check('aiMentions'), check('h1'), check('sitemap'), check('localBusiness'),
      check('https'), check('faqSchema'), check('phone'),
    ]
    const batches = planBatches(checks, 3)
    expect(batches.map(b => b.length)).toEqual([3, 3, 1])
    expect(batches.flat().map(c => c.key)).toEqual([
      'https', 'sitemap', 'phone', 'localBusiness', 'faqSchema', 'h1', 'aiMentions',
    ])
  })
  it('kastar vid ogiltig batchSize', () => {
    expect(() => planBatches([check('https')], 0)).toThrow()
  })
})

describe('callLimitsFor', () => {
  it('skalar timeout och max_tokens med batchstorleken, Pro får mer än Flash', () => {
    const pro1 = callLimitsFor('pro', 1), pro3 = callLimitsFor('pro', 3)
    const flash3 = callLimitsFor('flash', 3)
    expect(pro3.timeoutMs).toBeGreaterThan(pro1.timeoutMs)
    expect(pro3.maxTokens).toBeGreaterThan(pro1.maxTokens)
    expect(pro3.timeoutMs).toBeGreaterThan(flash3.timeoutMs)
    expect(pro3.maxTokens).toBeGreaterThan(flash3.maxTokens)
  })
})

describe('runWithConcurrency', () => {
  it('överskrider aldrig gränsen och behåller ordningen', async () => {
    let inFlight = 0, maxInFlight = 0
    const out = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return n * 2
    })
    expect(maxInFlight).toBe(4)
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18])
  })
})

describe('enrichChecksWithReportWriter', () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('berikar bara bad/warning, ett Pro-anrop per batch om max 3, rätt gränser per anrop', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (_m, _s, user) => fullAnswer(keysInPrompt(user), 'pro'))
    const checks = [
      check('https'), check('sitemap'), check('llmsTxt', 'warning'), check('canonical'),
      check('phone', 'ok'), check('synthesis'), check('h1', 'notMeasured'),
    ]
    const rich = await enrichChecksWithReportWriter(checks, meta, call, fast)

    expect(Object.keys(rich).sort()).toEqual(['canonical', 'https', 'llmsTxt', 'sitemap'])
    expect(Object.values(rich).every(r => r.richStatus === 'pro')).toBe(true)
    expect(call).toHaveBeenCalledTimes(2)
    const sizes = call.mock.calls.map(c => keysInPrompt(c[2]).length).sort()
    expect(sizes).toEqual([1, 3])
    for (const [model, , user, timeoutMs, expectMarkdown, maxTokens] of call.mock.calls) {
      const n = keysInPrompt(user).length
      expect(model).toBe(PRO)
      expect(expectMarkdown).toBe(false)
      expect(maxTokens).toBe(callLimitsFor('pro', n).maxTokens)
      expect(timeoutMs).toBeLessThanOrEqual(callLimitsFor('pro', n).timeoutMs)
    }
  })

  it('retryar Pro via withRetry och lyckas på andra försöket', async () => {
    let proCalls = 0
    const call = vi.fn<CallOpenRouterFn>(async (model, _s, user) => {
      if (model === PRO && ++proCalls === 1) throw new Error('Kunde inte tolka AI-svaret som JSON')
      return fullAnswer(keysInPrompt(user), model)
    })
    const rich = await enrichChecksWithReportWriter([check('https')], meta, call, fast)
    expect(rich.https.richStatus).toBe('pro')
    expect(call.mock.calls.map(c => c[0])).toEqual([PRO, PRO])
  })

  it('faller tillbaka på Flash när Pro misslyckas efter alla försök', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (model, _s, user) => {
      if (model === PRO) throw new Error('This operation was aborted')
      return fullAnswer(keysInPrompt(user), 'flash')
    })
    const rich = await enrichChecksWithReportWriter([check('https'), check('sitemap')], meta, call, { ...fast, proAttempts: 2 })
    expect(rich.https.richStatus).toBe('flash')
    expect(rich.sitemap.richStatus).toBe('flash')
    expect(rich.https.richRelevance).toContain('flash')
    const models = call.mock.calls.map(c => c[0])
    expect(models).toEqual([PRO, PRO, FLASH])
    // Flash-anropet får Flash-gränser
    expect(call.mock.calls[2][5]).toBe(callLimitsFor('flash', 2).maxTokens)
  })

  it('retryar inte permanenta fel (4xx) mot Pro — går direkt till Flash', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (model, _s, user) => {
      if (model === PRO) throw Object.assign(new Error('OpenRouter 400'), { permanent: true })
      return fullAnswer(keysInPrompt(user), 'flash')
    })
    const rich = await enrichChecksWithReportWriter([check('https')], meta, call, fast)
    expect(call.mock.calls.map(c => c[0])).toEqual([PRO, FLASH])
    expect(rich.https.richStatus).toBe('flash')
  })

  it('skickar bara ofullständiga checks till Flash när Pro svarar delvis', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (model, _s, user) => {
      const keys = keysInPrompt(user)
      if (model === PRO) {
        const ans = fullAnswer(keys, 'pro')
        delete ans.sitemap                         // nyckel saknas helt
        ans.llmsTxt = { ...ans.llmsTxt, richSteps: '' } as any // tomma steg = ofullständigt
        return ans
      }
      return fullAnswer(keys, 'flash')
    })
    const rich = await enrichChecksWithReportWriter(
      [check('https'), check('sitemap'), check('llmsTxt')], meta, call, fast,
    )
    expect(rich.https.richStatus).toBe('pro')
    expect(rich.sitemap.richStatus).toBe('flash')
    expect(rich.llmsTxt.richStatus).toBe('flash')
    const flashCall = call.mock.calls.find(c => c[0] === FLASH)!
    expect(keysInPrompt(flashCall[2]).sort()).toEqual(['llmsTxt', 'sitemap'])
  })

  it('markerar richStatus missing och loggar orsaken när både Pro och Flash misslyckas', async () => {
    const call = vi.fn<CallOpenRouterFn>(async () => { throw new Error('OpenRouter 503') })
    const rich = await enrichChecksWithReportWriter([check('https')], meta, call, fast)
    expect(rich.https).toEqual({ richRelevance: null, richSteps: null, richCodeExample: null, richStatus: 'missing' })
    expect(call).toHaveBeenCalledTimes(4) // 2 Pro + 2 Flash
    const logged = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(logged).toContain('SAKNAS för https')
    expect(logged).toContain('OpenRouter 503')
  })

  it('startar inga anrop när tidsbudgeten är slut — markerar missing i stället för att hänga', async () => {
    let t = 0
    const call = vi.fn<CallOpenRouterFn>(async (_m, _s, user) => fullAnswer(keysInPrompt(user)))
    const rich = await enrichChecksWithReportWriter([check('https')], meta, call, { ...fast, budgetMs: 10_000, now: () => t })
    expect(call).not.toHaveBeenCalled()
    expect(rich.https.richStatus).toBe('missing')
    t = 0
  })

  it('Pro lämnar tid åt Flash-reserven: Pro-timeouten kapas av budgeten', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (_m, _s, user) => fullAnswer(keysInPrompt(user)))
    const budgetMs = 60_000
    await enrichChecksWithReportWriter([check('https')], meta, call, { ...fast, budgetMs, now: () => 0 })
    const proTimeout = call.mock.calls[0][3]
    expect(proTimeout).toBe(budgetMs - callLimitsFor('flash', 1).timeoutMs)
  })
})

describe('huvudschema i Report Writer (Audit #7)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  const withFix = (key: CheckKey, status: CheckResult['status'] = 'bad'): CheckResult => ({ ...check(key, status), fix: 'Åtgärda' })
  const richMeta = { ...meta, phone: '031-12 34 56', placeId: 'ChIJtest', primaryType: 'restaurant' }

  it('ett kodblock i ägarkortet, övriga schema-checks får codeRef och följer med in på checkarna', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (_m, _s, user) => fullAnswer(keysInPrompt(user)))
    const checks = [withFix('https'), withFix('socialPresence', 'warning'), withFix('localBusiness'), withFix('jsonLd')]
    const rich = await enrichChecksWithReportWriter(checks, richMeta, call, fast)

    expect(rich.localBusiness.richCodeExample).toContain('"@id": "https://test.se/#localbusiness"')
    expect(rich.localBusiness.richCodeExample).toContain('+46 31 12 34 56')
    expect(rich.localBusiness.codeRef).toBeUndefined()
    expect(rich.jsonLd.codeRef).toBe('localBusiness')
    expect(rich.jsonLd.richCodeExample).toBeNull()
    expect(rich.socialPresence.codeRef).toBe('localBusiness')
    expect(rich.https.codeRef).toBeUndefined()

    // Prompten visar huvudschemat och förbjuder upprepning
    const prompts = call.mock.calls.map(c => c[2])
    const ownerPrompt = prompts.find(p => keysInPrompt(p).includes('localBusiness'))!
    const refPrompt = prompts.find(p => keysInPrompt(p).includes('jsonLd'))!
    expect(ownerPrompt).toContain('HUVUDSCHEMA')
    expect(ownerPrompt).toContain('"localBusiness": sätt richCodeExample till null')
    expect(refPrompt).toContain('"jsonLd": upprepa ALDRIG huvudschemat')

    applyRichData(checks, rich)
    expect(checks.find(c => c.key === 'jsonLd')!.codeRef).toBe('localBusiness')
    expect(checks.find(c => c.key === 'localBusiness')!.codeRef).toBeUndefined()
  })

  it('utan schema-check som behöver fixas byggs inget huvudschema', async () => {
    const call = vi.fn<CallOpenRouterFn>(async (_m, _s, user) => fullAnswer(keysInPrompt(user)))
    const checks = [withFix('localBusiness', 'ok'), withFix('socialPresence', 'warning')]
    const rich = await enrichChecksWithReportWriter(checks, richMeta, call, fast)
    expect(call.mock.calls[0][2]).not.toContain('HUVUDSCHEMA')
    expect(rich.socialPresence.codeRef).toBeUndefined()
    expect(rich.socialPresence.richCodeExample).toContain('Testbolaget socialPresence')
  })
})

describe('applyRichData', () => {
  it('skriver in rika fält + richStatus och markerar checks utan resultat som missing', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const checks = [check('https'), check('sitemap'), check('phone', 'ok'), check('h1', 'warning')]
    const rich: Record<string, RichCheckData> = {
      https: { richRelevance: 'r', richSteps: '1. s', richCodeExample: null, richStatus: 'flash' },
      h1: { richRelevance: 'r', richSteps: null, richCodeExample: null, richStatus: 'missing' },
    }
    const missing = applyRichData(checks, rich)
    expect(missing.sort()).toEqual(['h1', 'sitemap'])
    expect(checks[0].richStatus).toBe('flash')
    expect(checks[0].richSteps).toBe('1. s')
    expect(checks[1].richStatus).toBe('missing')
    expect(checks[2].richStatus).toBeUndefined() // ok-checks berörs inte
    expect(errSpy.mock.calls.map(c => String(c[0])).join('\n')).toContain('SAKNAS för sitemap')
    errSpy.mockRestore()
  })
})
