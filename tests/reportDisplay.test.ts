import { describe, it, expect } from 'vitest'
import {
  buildNapRows,
  napConsistencyLabel,
  napConsistencyColor,
  entityKnowsLabel,
  categoryMentionedLabel,
} from '@/app/lib/reportDisplay'
import type { DirectoryData } from '@/app/lib/scanResult'

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
  it('reports recognized when true', () => {
    expect(entityKnowsLabel(true)).toBe('AI känner till företaget')
  })
  it('reports not recognized when false', () => {
    expect(entityKnowsLabel(false)).toBe('AI känner inte till företaget')
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
