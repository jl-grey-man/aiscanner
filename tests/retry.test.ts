import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/app/lib/retry'

describe('withRetry', () => {
  it('returnerar direkt vid succé', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseDelayMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('försöker igen vid fel och lyckas', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseDelayMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('kastar sista felet när alla försök misslyckas', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(3)
  })
  it('respekterar isRetryable=false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, isRetryable: () => false })).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
