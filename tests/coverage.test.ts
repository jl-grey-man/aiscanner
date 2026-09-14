import { describe, it, expect } from 'vitest'
import { calculateScores, CHECK_REGISTRY } from '@/app/lib/scanResult'
import type { CheckResult } from '@/app/lib/scanResult'

/**
 * Bygger en syntetisk, fullständig check-lista (alla 37 nycklar från
 * CHECK_REGISTRY, giltiga enligt schemat) där alla checks är 'ok' utom de
 * nycklar som anges i notMeasuredKeys, som blir 'notMeasured'.
 */
function buildChecks(notMeasuredKeys: string[]): CheckResult[] {
  return CHECK_REGISTRY.map((reg) => ({
    id: reg.id,
    key: reg.key,
    status: notMeasuredKeys.includes(reg.key) ? 'notMeasured' : 'ok',
    source: 'computed',
    finding: 'test',
    fix: null,
    data: null,
    codeExample: null,
    priority: null,
    tier: reg.tier,
  }))
}

describe('calculateScores — measured/total (mät-täckning)', () => {
  it('measured === total - 2 när 2 poängsatta checks är notMeasured', () => {
    const checks = buildChecks(['cwv', 'napConsistency'])
    const { measured, total } = calculateScores(checks)
    expect(measured).toBe(total - 2)
  })

  it('total exkluderar synthesis (vikt {free:0, full:0}) — 36 av 37 checks räknas', () => {
    const checks = buildChecks([])
    const { measured, total } = calculateScores(checks)
    expect(total).toBe(36)
    expect(measured).toBe(36)
  })

  it('notApplicable räknas som ej uppmätt, precis som notMeasured', () => {
    const checks = buildChecks([]).map((c) =>
      c.key === 'hreflang' ? { ...c, status: 'notApplicable' as const } : c
    )
    const { measured, total } = calculateScores(checks)
    expect(total).toBe(36)
    expect(measured).toBe(35)
  })

  it('measured === total när alla poängsatta checks har ett mätt utfall', () => {
    const checks = buildChecks([]).map((c) =>
      c.key === 'localBusiness' ? { ...c, status: 'bad' as const } : c
    )
    const { measured, total } = calculateScores(checks)
    expect(measured).toBe(total)
  })
})
