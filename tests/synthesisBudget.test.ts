import { describe, it, expect, vi } from 'vitest'
import { callWithDeadline, MIN_SYNTHESIS_CALL_MS } from '@/app/lib/synthesisBudget'

/**
 * Simulerad klocka: startar på 0, och rycks framåt av mockade anrop som "tar tid"
 * (call-mocken anropar advance() innan den löser/kastar). withRetry:s egna
 * backoff-setTimeout körs med riktiga timers men baseDelayMs=1 i alla tester
 * nedan, så det bidrar försumbart till testets faktiska väggklocka.
 */
function fakeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => { t += ms },
  }
}

describe('callWithDeadline', () => {
  it('lyckas på första försöket — skickar begärd timeoutMs oförändrad när budgeten räcker gott och väl', async () => {
    const clock = fakeClock()
    const call = vi.fn().mockResolvedValue({ ok: true })

    const result = await callWithDeadline(
      call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, clock.now() + 150000, false, 12000, undefined,
      { now: clock.now, baseDelayMs: 1 },
    )

    expect(result).toEqual({ ok: true })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('google/gemini-2.5-pro', 'sys', 'user', 120000, false, 12000, undefined)
  })

  it('krymper timeoutMs till kvarvarande budget i stället för den begärda timeouten', async () => {
    const clock = fakeClock()
    const deadline = clock.now() + 30000 // bara 30s kvar, mindre än de begärda 120s
    const call = vi.fn().mockResolvedValue({ ok: true })

    await callWithDeadline(call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })

    const passedTimeout = call.mock.calls[0][3]
    expect(passedTimeout).toBe(30000)
    expect(passedTimeout).toBeLessThan(120000)
  })

  it('krymper timeouten igen på ett andra försök efter att tid gått åt', async () => {
    const clock = fakeClock()
    const deadline = clock.now() + 150000
    const call = vi.fn()
      .mockImplementationOnce(async () => { clock.advance(120000); throw new Error('OpenRouter 503') }) // 1:a försöket äter 120s, misslyckas transient
      .mockResolvedValueOnce({ ok: true })

    const result = await callWithDeadline(call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })

    expect(result).toEqual({ ok: true })
    expect(call).toHaveBeenCalledTimes(2)
    const secondTimeout = call.mock.calls[1][3]
    // ~30s kvar av budgeten (150000 - 120000), inte de begärda 120000
    expect(secondTimeout).toBeLessThanOrEqual(30000)
    expect(secondTimeout).toBeGreaterThan(0)
  })

  it('ger upp UTAN att ringa igen när kvarvarande tid understiger MIN_SYNTHESIS_CALL_MS — budgetExhausted:true', async () => {
    const clock = fakeClock()
    const deadline = clock.now() + 120000
    const call = vi.fn().mockImplementationOnce(async () => {
      clock.advance(110000) // bara 10s kvar efter detta — under MIN_SYNTHESIS_CALL_MS (15s)
      throw new Error('OpenRouter 503')
    })

    await expect(
      callWithDeadline(call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })
    ).rejects.toMatchObject({ budgetExhausted: true })

    expect(call).toHaveBeenCalledTimes(1) // inget nytt anrop görs — det skulle ändå inte hinna svara
    expect(MIN_SYNTHESIS_CALL_MS).toBe(15000)
  })

  it('permanenta fel (4xx) retryas aldrig, oavsett kvarvarande budget', async () => {
    const clock = fakeClock()
    const deadline = clock.now() + 150000 // gott om tid kvar
    const call = vi.fn().mockRejectedValue(Object.assign(new Error('OpenRouter 400'), { permanent: true }))

    await expect(
      callWithDeadline(call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })
    ).rejects.toThrow('OpenRouter 400')

    expect(call).toHaveBeenCalledTimes(1)
  })

  it('den totala simulerade tiden som går åt innan giltigt fel (budgetExhausted) överstiger aldrig deadline nämnvärt', async () => {
    const clock = fakeClock()
    const budgetMs = 150000
    const deadline = clock.now() + budgetMs
    // Varje försök "tar" hela sin tilldelade timeout och misslyckas transient.
    const call = vi.fn().mockImplementation(async (_m, _s, _u, timeoutMs: number) => {
      clock.advance(timeoutMs)
      throw new Error('OpenRouter 503')
    })

    await expect(
      callWithDeadline(call, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })
    ).rejects.toMatchObject({ budgetExhausted: true })

    // Innan denna fix kunde 3 riktiga försök × 120s bli 360s+. Nu: klockan får
    // aldrig gå längre än budgeten (varje anrops timeoutMs krymptes till det som
    // fanns kvar, så summan av alla call()-anrop kan max bli budgetMs).
    expect(clock.now()).toBeLessThanOrEqual(budgetMs)
  })

  it('kontraktet route.ts förlitar sig på: Flash-reserven vinner när Pro misslyckas, båda bundna av SAMMA deadline', async () => {
    const clock = fakeClock()
    const deadline = clock.now() + 150000

    const proCall = vi.fn().mockImplementation(async (_m, _s, _u, timeoutMs: number) => {
      clock.advance(timeoutMs) // Pro äter hela sin tilldelade tid varje försök
      throw new Error('OpenRouter 503')
    })
    const flashCall = vi.fn().mockResolvedValue({ actionPlan: '### Kritiskt\nFlash-resultat', competitorNote: '', reviewAnalysis: null, summary: 'ok' })

    const proPromise = callWithDeadline(proCall, 'google/gemini-2.5-pro', 'sys', 'user', 120000, deadline, false, 12000, undefined, { now: clock.now, baseDelayMs: 1 })
    const flashPromise = callWithDeadline(flashCall, 'google/gemini-2.5-flash', 'sys', 'user', 45000, deadline, false, 8000, undefined, { now: clock.now, baseDelayMs: 1 }).catch(() => null)

    // Samma fallback-mönster som route.ts: Pro misslyckas -> använd Flash.
    const synthesis = await proPromise.catch(async () => {
      const flashResult = await flashPromise
      return flashResult ?? { actionPlan: '### Syntesfel', competitorNote: '', reviewAnalysis: null, summary: 'fel' }
    })

    expect(synthesis.actionPlan).toContain('Flash-resultat')
    expect(flashCall).toHaveBeenCalled()
  })
})
