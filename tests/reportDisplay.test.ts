import { describe, it, expect } from 'vitest'
import {
  buildNapRows,
  napConsistencyLabel,
  napConsistencyColor,
  entityKnowsLabel,
  categoryMentionedLabel,
  pickSolutionCode,
  buildComparisonRows,
  competitorCountFromChecks,
} from '@/app/lib/reportDisplay'
import type { CheckResult, CompetitorComparisonData, DirectoryData } from '@/app/lib/scanResult'

describe('buildNapRows', () => {
  it('maps found directories with nap data to rows', () => {
    const dirs: DirectoryData['directories'] = [
      {
        name: 'Eniro',
        found: true,
        source: 'tavily',
        profileUrl: 'https://www.eniro.se/x',
        nap: { address: 'Malös gata 40, Göteborg', phone: '031-123456' },
      },
    ]
    const rows = buildNapRows(dirs)
    expect(rows).toEqual([
      {
        name: 'Eniro',
        found: true,
        address: 'Malös gata 40, Göteborg',
        phone: '031-123456',
        profileUrl: 'https://www.eniro.se/x',
      },
    ])
  })

  it('fills missing nap fields with null instead of undefined', () => {
    const dirs: DirectoryData['directories'] = [
      { name: 'Hitta', found: false, source: 'not_found' },
    ]
    const rows = buildNapRows(dirs)
    expect(rows).toEqual([
      { name: 'Hitta', found: false, address: null, phone: null, profileUrl: null },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(buildNapRows([])).toEqual([])
  })
})

describe('napConsistencyLabel', () => {
  it.each([
    [true, 'Konsekvent'],
    [false, 'Inkonsekvent'],
    [null, 'Otillräckligt underlag'],
  ] as const)('consistent=%s -> %s', (input, expected) => {
    expect(napConsistencyLabel(input)).toBe(expected)
  })
})

describe('napConsistencyColor', () => {
  it('returns emerald classes for consistent', () => {
    expect(napConsistencyColor(true)).toContain('emerald')
  })
  it('returns red classes for inconsistent', () => {
    expect(napConsistencyColor(false)).toContain('red')
  })
  it('returns gray classes for unknown (null)', () => {
    expect(napConsistencyColor(null)).toContain('gray')
  })
})

describe('entityKnowsLabel', () => {
  it('reports recognized for classification knows', () => {
    expect(entityKnowsLabel({ entityKnows: true, entityClassification: 'knows' })).toBe('AI känner till företaget')
  })
  it('reports not recognized for classification doesNotKnow', () => {
    expect(entityKnowsLabel({ entityKnows: false, entityClassification: 'doesNotKnow' })).toBe('AI känner inte till företaget')
  })
  it('reports wrong facts — not "känner inte till" — for classification wrongFacts', () => {
    expect(entityKnowsLabel({ entityKnows: false, entityClassification: 'wrongFacts' })).toBe('AI har felaktiga uppgifter om företaget')
  })
  it('falls back to entityKnows for scans stored without a classification', () => {
    expect(entityKnowsLabel({ entityKnows: true })).toBe('AI känner till företaget')
    expect(entityKnowsLabel({ entityKnows: false })).toBe('AI känner inte till företaget')
  })
})

describe('pickSolutionCode', () => {
  const TEMPLATE = '{"name": "Sprej Hårstudio", "description": "<BESKRIVNING>"}'

  it('prefers richCodeExample over template and Flash code', () => {
    const r = pickSolutionCode(
      { richCodeExample: 'RICH', genericCodeTemplate: TEMPLATE, codeExample: 'FLASH' },
      true,
    )
    expect(r).toEqual({ code: 'RICH', isTemplate: false, showCode: true, codeRef: null })
  })

  it('codeRef with delta shows the delta and the reference', () => {
    const r = pickSolutionCode(
      { richCodeExample: 'DELTA', genericCodeTemplate: TEMPLATE, codeRef: 'localBusiness' },
      true,
    )
    expect(r).toEqual({ code: 'DELTA', isTemplate: false, showCode: true, codeRef: 'localBusiness' })
  })

  it('codeRef without delta never falls back to template or Flash code, even unlocked', () => {
    const r = pickSolutionCode(
      { richCodeExample: null, genericCodeTemplate: TEMPLATE, codeExample: 'FLASH', codeRef: 'localBusiness' },
      true,
    )
    expect(r).toEqual({ code: null, isTemplate: false, showCode: false, codeRef: 'localBusiness' })
  })

  it('unlocked (premium) shows the filled template flagged as template', () => {
    const r = pickSolutionCode({ richCodeExample: '  ', genericCodeTemplate: TEMPLATE }, true)
    expect(r).toEqual({ code: TEMPLATE, isTemplate: true, showCode: true, codeRef: null })
  })

  it('free (locked) hides template code — unchanged free behavior', () => {
    const r = pickSolutionCode({ genericCodeTemplate: TEMPLATE, codeExample: 'FLASH' }, false)
    expect(r.isTemplate).toBe(true)
    expect(r.showCode).toBe(false)
  })

  it('free still shows rich or Flash code that is not a template', () => {
    expect(pickSolutionCode({ codeExample: 'FLASH' }, false)).toEqual({
      code: 'FLASH', isTemplate: false, showCode: true, codeRef: null,
    })
  })

  it('no code anywhere → nothing shown', () => {
    expect(pickSolutionCode({}, true)).toEqual({ code: null, isTemplate: false, showCode: false, codeRef: null })
  })
})

describe('categoryMentionedLabel', () => {
  it('reports spontaneous mention when true', () => {
    expect(categoryMentionedLabel(true)).toBe('Nämns spontant i branschsökning')
  })
  it('reports no spontaneous mention when false', () => {
    expect(categoryMentionedLabel(false)).toBe('Nämns inte spontant i branschsökning')
  })
})

describe('buildComparisonRows', () => {
  const comparison: CompetitorComparisonData = {
    keys: ['https', 'faqSchema'],
    you: { statuses: { https: 'ok', faqSchema: 'bad' }, okCount: 1 },
    competitors: [
      { placeId: 'a', name: 'Alfa', website: 'https://alfa.se', rating: 4.2, reviewCount: 10, scanned: true, statuses: { https: 'ok', faqSchema: 'ok' }, okCount: 2 },
      { placeId: 'b', name: 'Beta', website: 'https://beta.se', rating: null, reviewCount: null, scanned: false, statuses: {}, okCount: null },
    ],
  }

  it('en rad per kontroll, med etikett ur CHECK_REGISTRY', () => {
    const rows = buildComparisonRows(comparison)
    expect(rows).toEqual([
      { key: 'https', label: 'HTTPS', you: 'ok', competitors: ['ok', null] },
      { key: 'faqSchema', label: 'FAQ-schema', you: 'bad', competitors: ['ok', null] },
    ])
  })

  it('oscannad konkurrent (scanned: false) blir null i varje rad, inte notMeasured', () => {
    const rows = buildComparisonRows(comparison)
    for (const row of rows) expect(row.competitors[1]).toBeNull()
  })

  it('saknad status för en scannad konkurrent faller tillbaka på notMeasured', () => {
    const partial: CompetitorComparisonData = {
      keys: ['https'],
      you: { statuses: {}, okCount: 0 },
      competitors: [{ placeId: 'c', name: 'Gamma', website: 'https://gamma.se', rating: null, reviewCount: null, scanned: true, statuses: {}, okCount: 0 }],
    }
    const rows = buildComparisonRows(partial)
    expect(rows[0]).toEqual({ key: 'https', label: 'HTTPS', you: 'notMeasured', competitors: ['notMeasured'] })
  })
})

describe('competitorCountFromChecks', () => {
  function checksWith(data: Record<string, unknown> | null): CheckResult[] {
    return [{
      id: 36, key: 'competitors', status: 'ok', source: 'api', finding: '', fix: null,
      data, codeExample: null, priority: null, tier: 'premium',
    }]
  }

  it('räknar konkurrenterna i check #36 data', () => {
    expect(competitorCountFromChecks(checksWith({ competitors: [{}, {}, {}] }))).toBe(3)
  })

  it('null när checken saknar data (notMeasured — ingen GBP-matchning)', () => {
    expect(competitorCountFromChecks(checksWith(null))).toBeNull()
  })

  it('null när check #36 saknas helt', () => {
    expect(competitorCountFromChecks([])).toBeNull()
  })
})
