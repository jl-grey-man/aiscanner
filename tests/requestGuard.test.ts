import { describe, it, expect } from 'vitest'
import { RequestGuard } from '@/app/lib/requestGuard'

describe('RequestGuard', () => {
  it('is current right after start()', () => {
    const g = new RequestGuard()
    const t = g.start()
    expect(g.isCurrent(t)).toBe(true)
  })

  it('becomes stale once a newer call starts (supersession)', () => {
    const g = new RequestGuard()
    const t1 = g.start()
    const t2 = g.start()
    expect(g.isCurrent(t1)).toBe(false)
    expect(g.isCurrent(t2)).toBe(true)
  })

  it('tracks multiple supersessions correctly — only the latest token is current', () => {
    const g = new RequestGuard()
    const t1 = g.start()
    const t2 = g.start()
    const t3 = g.start()
    expect(g.isCurrent(t1)).toBe(false)
    expect(g.isCurrent(t2)).toBe(false)
    expect(g.isCurrent(t3)).toBe(true)
  })

  it('a fresh guard instance starts at a token that is current', () => {
    const g = new RequestGuard()
    expect(g.isCurrent(g.start())).toBe(true)
  })
})
