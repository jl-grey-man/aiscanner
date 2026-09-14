import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// checkoutDb läser CHECKOUT_DB_PATH vid import → sätt en temporär databas först.
let dir: string
let db: typeof import('@/app/lib/checkoutDb')

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'scan-cache-test-'))
  process.env.CHECKOUT_DB_PATH = path.join(dir, 'checkouts.db')
  db = await import('@/app/lib/checkoutDb')
})

afterAll(() => {
  delete process.env.CHECKOUT_DB_PATH
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scan_cache (saveFreeScan / getFreeScan)', () => {
  it('returnerar sparad JSON för samma nyckel', () => {
    db.saveFreeScan('https://a.se|umeå', '{"v":1}')
    expect(db.getFreeScan('https://a.se|umeå', db.SCAN_CACHE_TTL_MS)).toBe('{"v":1}')
  })

  it('returnerar null för okänd nyckel', () => {
    expect(db.getFreeScan('https://finns-inte.se|', db.SCAN_CACHE_TTL_MS)).toBeNull()
  })

  it('ny free-scan för samma nyckel ersätter den gamla', () => {
    db.saveFreeScan('https://b.se|', '{"n":1}')
    db.saveFreeScan('https://b.se|', '{"n":2}')
    expect(db.getFreeScan('https://b.se|', db.SCAN_CACHE_TTL_MS)).toBe('{"n":2}')
  })

  it('olika nycklar (t.ex. olika städer) är oberoende', () => {
    db.saveFreeScan('https://c.se|umeå', '{"stad":"umeå"}')
    db.saveFreeScan('https://c.se|luleå', '{"stad":"luleå"}')
    expect(db.getFreeScan('https://c.se|umeå', db.SCAN_CACHE_TTL_MS)).toBe('{"stad":"umeå"}')
    expect(db.getFreeScan('https://c.se|luleå', db.SCAN_CACHE_TTL_MS)).toBe('{"stad":"luleå"}')
  })

  it('returnerar null när raden är äldre än maxAgeMs', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = new Date('2026-09-14T12:00:00Z').getTime()
    vi.setSystemTime(t0)
    db.saveFreeScan('https://d.se|', '{"d":1}')
    vi.setSystemTime(t0 + 1000)
    expect(db.getFreeScan('https://d.se|', 500)).toBeNull()
    expect(db.getFreeScan('https://d.se|', 2000)).toBe('{"d":1}')
  })

  it('rensar rader äldre än TTL när en ny free-scan sparas', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = new Date('2026-09-10T12:00:00Z').getTime()
    vi.setSystemTime(t0)
    db.saveFreeScan('https://gammal.se|', '{"old":true}')
    vi.setSystemTime(t0 + db.SCAN_CACHE_TTL_MS + 1)
    db.saveFreeScan('https://ny.se|', '{"new":true}')
    // Oändlig maxAge: raden hade funnits kvar om den inte rensats
    expect(db.getFreeScan('https://gammal.se|', Number.POSITIVE_INFINITY)).toBeNull()
    expect(db.getFreeScan('https://ny.se|', db.SCAN_CACHE_TTL_MS)).toBe('{"new":true}')
  })
})
