import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkLimit, getClientIp } from '@/app/lib/rateLimit'

describe('checkLimit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tillåter upp till gränsen, blockerar därefter', () => {
    const key = `basic-${Math.random()}`
    expect(checkLimit(key, 3, 60_000).ok).toBe(true)
    expect(checkLimit(key, 3, 60_000).ok).toBe(true)
    expect(checkLimit(key, 3, 60_000).ok).toBe(true)
    const blocked = checkLimit(key, 3, 60_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('räknar olika nycklar oberoende av varandra', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    expect(checkLimit(a, 1, 60_000).ok).toBe(true)
    expect(checkLimit(b, 1, 60_000).ok).toBe(true)
    expect(checkLimit(a, 1, 60_000).ok).toBe(false)
    expect(checkLimit(b, 1, 60_000).ok).toBe(false)
  })

  it('släpper igenom igen när fönstret har glidit förbi', () => {
    vi.useFakeTimers()
    const key = `window-${Math.random()}`
    expect(checkLimit(key, 1, 1000).ok).toBe(true)
    expect(checkLimit(key, 1, 1000).ok).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(checkLimit(key, 1, 1000).ok).toBe(true)
  })

  it('retryAfterSec är avrundat uppåt och minst 1', () => {
    vi.useFakeTimers()
    const key = `retry-${Math.random()}`
    checkLimit(key, 1, 10_000)
    vi.advanceTimersByTime(3000)
    const blocked = checkLimit(key, 1, 10_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBe(7)
  })

  it('sliding window: äldre träffar faller ur men fönstret blockerar tills dess', () => {
    vi.useFakeTimers()
    const key = `sliding-${Math.random()}`
    expect(checkLimit(key, 2, 10_000).ok).toBe(true) // t=0
    vi.advanceTimersByTime(6000)
    expect(checkLimit(key, 2, 10_000).ok).toBe(true) // t=6000, 2 hits within window
    expect(checkLimit(key, 2, 10_000).ok).toBe(false) // t=6000, 3rd hit blocked
    vi.advanceTimersByTime(4001) // t=10001 — first hit (t=0) now outside 10s window
    expect(checkLimit(key, 2, 10_000).ok).toBe(true)
  })
})

describe('getClientIp', () => {
  const originalTrustCf = process.env.TRUST_CF_HEADER

  afterEach(() => {
    if (originalTrustCf === undefined) delete process.env.TRUST_CF_HEADER
    else process.env.TRUST_CF_HEADER = originalTrustCf
  })

  it('använder cf-connecting-ip när TRUST_CF_HEADER=1', () => {
    process.env.TRUST_CF_HEADER = '1'
    const req = new Request('http://x.test', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('ignorerar cf-connecting-ip när TRUST_CF_HEADER inte är satt', () => {
    delete process.env.TRUST_CF_HEADER
    const req = new Request('http://x.test', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('tar första IP i x-forwarded-for-listan', () => {
    delete process.env.TRUST_CF_HEADER
    const req = new Request('http://x.test', { headers: { 'x-forwarded-for': '5.5.5.5, 6.6.6.6' } })
    expect(getClientIp(req)).toBe('5.5.5.5')
  })

  it('faller tillbaka på x-real-ip om x-forwarded-for saknas', () => {
    delete process.env.TRUST_CF_HEADER
    const req = new Request('http://x.test', { headers: { 'x-real-ip': '7.7.7.7' } })
    expect(getClientIp(req)).toBe('7.7.7.7')
  })

  it('faller tillbaka på "unknown" utan några headers', () => {
    delete process.env.TRUST_CF_HEADER
    const req = new Request('http://x.test')
    expect(getClientIp(req)).toBe('unknown')
  })
})
