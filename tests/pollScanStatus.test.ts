import { describe, it, expect, vi } from 'vitest'
import { pollScanStatus, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '@/app/lib/pollScanStatus'

type Step = { status?: number; body?: unknown; throws?: boolean }

/** Fejkad fetch som spelar upp en lista svar, och en klocka som går fram vid sleep. */
function setup(steps: Step[]) {
  let t = 0
  const calls: string[] = []
  const fetchFn = vi.fn(async (input: string) => {
    calls.push(input)
    const step = steps.shift() ?? { status: 200, body: { status: 'running' } }
    if (step.throws) throw new Error('network')
    return new Response(typeof step.body === 'string' ? step.body : JSON.stringify(step.body ?? {}), { status: step.status ?? 200 })
  })
  const sleep = vi.fn(async (ms: number) => { t += ms })
  return { fetchFn, sleep, now: () => t, calls }
}

describe('pollScanStatus', () => {
  it('pollar var 5:e sekund tills done och returnerar resultatet', async () => {
    const scanResult = { checks: [] }
    const s = setup([
      { body: { status: 'running' } },
      { body: { status: 'running' } },
      { body: { status: 'done', scanResult } },
    ])
    const out = await pollScanStatus({ sessionId: 'cs_1 x', fetchFn: s.fetchFn, sleep: s.sleep, now: s.now })
    expect(out).toEqual({ status: 'done', scanResult })
    expect(s.fetchFn).toHaveBeenCalledTimes(3)
    expect(s.sleep).toHaveBeenCalledWith(POLL_INTERVAL_MS)
    expect(POLL_INTERVAL_MS).toBe(5000)
    expect(s.calls[0]).toBe('/api/checkout/status?session_id=cs_1%20x')
  })

  it('failed avbryter direkt', async () => {
    const s = setup([{ body: { status: 'running' } }, { body: { status: 'failed' } }])
    expect(await pollScanStatus({ sessionId: 'a', fetchFn: s.fetchFn, sleep: s.sleep, now: s.now })).toEqual({ status: 'failed' })
  })

  it('404 ger notFound', async () => {
    const s = setup([{ status: 404, body: { error: 'Okänd session' } }])
    expect(await pollScanStatus({ sessionId: 'a', fetchFn: s.fetchFn, sleep: s.sleep, now: s.now })).toEqual({ status: 'notFound' })
  })

  it('tillfälliga fel (nätverk, 5xx, 429, trasig JSON, pending) fortsätter pollningen', async () => {
    const scanResult = { checks: [1] }
    const s = setup([
      { throws: true },
      { status: 502, body: '<html>Bad gateway</html>' },
      { status: 429, body: { error: 'För många' } },
      { status: 200, body: 'inte json' },
      { body: { status: 'pending' } },
      { body: { status: 'done' } }, // done utan resultat räknas inte
      { body: { status: 'done', scanResult } },
    ])
    expect(await pollScanStatus({ sessionId: 'a', fetchFn: s.fetchFn, sleep: s.sleep, now: s.now })).toEqual({ status: 'done', scanResult })
    expect(s.fetchFn).toHaveBeenCalledTimes(7)
  })

  it('ger upp efter max 10 minuter', async () => {
    const s = setup([])
    expect(await pollScanStatus({ sessionId: 'a', fetchFn: s.fetchFn, sleep: s.sleep, now: s.now })).toEqual({ status: 'timeout' })
    expect(POLL_TIMEOUT_MS).toBe(10 * 60 * 1000)
    expect(s.fetchFn).toHaveBeenCalledTimes(POLL_TIMEOUT_MS / POLL_INTERVAL_MS)
  })
})
