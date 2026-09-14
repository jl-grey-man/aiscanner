import { describe, it, expect } from 'vitest'
import { CHECK_REGISTRY, calculateScores, maxAchievableScore } from '@/app/lib/scanResult'
import type { CheckKey, CheckResult } from '@/app/lib/scanResult'

function mkCheck(key: CheckKey, status: CheckResult['status']): CheckResult {
  const reg = CHECK_REGISTRY.find((e) => e.key === key)
  if (!reg) throw new Error(`unknown check key: ${key}`)
  return {
    id: reg.id,
    key: reg.key,
    status,
    source: 'scraper',
    finding: 'test',
    fix: null,
    data: null,
    codeExample: null,
    priority: null,
    tier: reg.tier,
  }
}

describe('maxAchievableScore', () => {
  it('höjer fullpoängen till exakt vad calculateScores ger när bad/warning blir ok', () => {
    const checks: CheckResult[] = [
      mkCheck('https', 'ok'),
      mkCheck('robotsTxt', 'bad'),
      mkCheck('sitemap', 'warning'),
      mkCheck('canonical', 'ok'),
    ]

    const before = calculateScores(checks).full
    const achievable = maxAchievableScore(checks)

    const allFixed = checks.map((c) => ({ ...c, status: 'ok' as const }))
    const expected = calculateScores(allFixed).full

    expect(achievable).toBe(expected)
    expect(achievable).toBeGreaterThan(before)
  })

  it('lämnar poängen oförändrad när inga bad/warning-checks finns', () => {
    const checks: CheckResult[] = [
      mkCheck('https', 'ok'),
      mkCheck('robotsTxt', 'ok'),
      mkCheck('sitemap', 'notMeasured'),
    ]

    const current = calculateScores(checks).full
    expect(maxAchievableScore(checks)).toBe(current)
  })

  it('exkluderar notMeasured/notApplicable från prognosen precis som calculateScores', () => {
    const checks: CheckResult[] = [
      mkCheck('https', 'bad'),
      mkCheck('robotsTxt', 'notMeasured'),
      mkCheck('sitemap', 'notApplicable'),
    ]

    // Om https (den enda mätta checken) fixas ska prognosen bli 100 —
    // notMeasured/notApplicable ska varken sänka eller höja den.
    expect(maxAchievableScore(checks)).toBe(100)
  })

  it('når aldrig över 100', () => {
    const checks: CheckResult[] = CHECK_REGISTRY.filter((e) => e.key !== 'synthesis').map((e) =>
      mkCheck(e.key, 'bad')
    )
    expect(maxAchievableScore(checks)).toBeLessThanOrEqual(100)
  })
})
