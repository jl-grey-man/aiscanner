import { describe, it, expect } from 'vitest'
import { mapPlacesType, deriveBransch } from '@/app/lib/bransch'

describe('mapPlacesType', () => {
  it('mappar kända Places-typer till svensk bransch', () => {
    expect(mapPlacesType('restaurant')).toBe('restaurang')
    expect(mapPlacesType('hair_salon')).toBe('frisör')
    expect(mapPlacesType('hair_care')).toBe('frisör')
    expect(mapPlacesType('beauty_salon')).toBe('skönhetssalong')
    expect(mapPlacesType('bar')).toBe('bar')
  })

  it('är skiftlägesokänslig', () => {
    expect(mapPlacesType('Hair_Salon')).toBe('frisör')
    expect(mapPlacesType('RESTAURANT')).toBe('restaurang')
  })

  it('mappar _restaurant-suffix (Places undertyper som scandinavian_restaurant) till restaurang', () => {
    expect(mapPlacesType('scandinavian_restaurant')).toBe('restaurang')
    expect(mapPlacesType('japanese_restaurant')).toBe('restaurang')
    expect(mapPlacesType('fine_dining_restaurant')).toBe('restaurang')
  })

  it('mappar _store-suffix till butik', () => {
    expect(mapPlacesType('sporting_goods_store')).toBe('butik')
  })

  it('returnerar null för okänd typ, null eller undefined', () => {
    expect(mapPlacesType('point_of_interest')).toBeNull()
    expect(mapPlacesType('establishment')).toBeNull()
    expect(mapPlacesType(null)).toBeNull()
    expect(mapPlacesType(undefined)).toBeNull()
  })
})

describe('deriveBransch', () => {
  it('Audit #10 — primaryType vinner över typer tidigare i types-listan (regression för Tvåkanten-bugg)', () => {
    // Verklig bugg (2026-09-14): Tvåkanten (restaurang) fick bransch "bar" eftersom
    // koden itererade place.types och "bar" råkade stå före restaurang-typerna, och
    // "scandinavian_restaurant"/"diner" saknades helt i mappningstabellen.
    const bransch = deriveBransch({
      primaryType: 'scandinavian_restaurant',
      types: ['bar', 'scandinavian_restaurant', 'diner', 'restaurant', 'food', 'point_of_interest', 'establishment'],
      title: 'Tvåkanten | Restaurang & bar i Göteborg',
      companyName: 'Tvåkanten',
    })
    expect(bransch).toBe('restaurang')
    expect(bransch).not.toBe('bar')
  })

  it('faller tillbaka till första träffande typ i types när primaryType saknar mappning', () => {
    const bransch = deriveBransch({
      primaryType: 'point_of_interest', // ingen mappning
      types: ['establishment', 'hair_salon', 'point_of_interest'],
      title: 'Sprej Hårstudio',
      companyName: 'Sprej Hårstudio',
    })
    expect(bransch).toBe('frisör')
  })

  it('faller tillbaka till sista titel-segmentet när ingen Places-typ matchar', () => {
    const bransch = deriveBransch({
      primaryType: null,
      types: ['point_of_interest', 'establishment'],
      title: 'Startsida | Glasmästeriet i Malmö',
      companyName: 'Glasmästeriet',
    })
    expect(bransch).toBe('Glasmästeriet i Malmö')
  })

  it('bransch blir ALDRIG identisk med companyName — faller till "företag" i stället', () => {
    // Ingen separator i titeln → sista segmentet blir hela titeln, samma som companyName
    // (som också härleds från titelns FÖRSTA segment när Places saknar displayName).
    const bransch = deriveBransch({
      primaryType: null,
      types: [],
      title: 'Glasmästeriet',
      companyName: 'Glasmästeriet',
    })
    expect(bransch).toBe('företag')
    expect(bransch).not.toBe('Glasmästeriet')
  })

  it('returnerar "företag" när varken Places-typ eller titel finns', () => {
    const bransch = deriveBransch({
      primaryType: null,
      types: [],
      title: null,
      companyName: '',
    })
    expect(bransch).toBe('företag')
  })
})
