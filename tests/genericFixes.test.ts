import { describe, it, expect } from 'vitest'
import { getGenericFix } from '@/app/lib/genericFixes'

// Fix sep 2026: serviceSchema (premium, #24) saknade tidigare en generisk mall helt —
// en betalande kund utan Report Writer-genererad Service-kod (t.ex. inga verifierade
// tjänster hittade på sajten) såg då inget kodblock alls. En ärlig <PLACEHOLDERS>-mall,
// som aldrig hittar på tjänster/priser, ger samma "Mall"-fallback som övriga checks har.
describe('getGenericFix — serviceSchema', () => {
  it('bad: steg + mall med <PLACEHOLDERS>, inga hårdkodade tjänstenamn eller priser', () => {
    const fix = getGenericFix('serviceSchema', 'bad')
    expect(fix).not.toBeNull()
    expect(fix!.codeTemplate).toContain('"@type": "Service"')
    expect(fix!.codeTemplate).toContain('<TJÄNST>')
    expect(fix!.codeTemplate).toContain('<FÖRETAGSNAMN>')
    expect(fix!.steps).toContain('hitta ALDRIG på tjänster')
    // Inga påhittade konkreta priser/valutor i mallen
    expect(fix!.codeTemplate).not.toMatch(/"price"\s*:\s*"?\d/)
  })

  it('warning: steg + delta-mall för att komplettera befintliga poster', () => {
    const fix = getGenericFix('serviceSchema', 'warning')
    expect(fix).not.toBeNull()
    expect(fix!.codeTemplate).toContain('<TJÄNST>')
    expect(fix!.steps).toContain('hitta ALDRIG på tjänster')
  })

  it('ok kräver ingen fix', () => {
    expect(getGenericFix('serviceSchema', 'ok')).toBeNull()
  })
})
