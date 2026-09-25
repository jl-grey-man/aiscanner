import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PLACES_CONTENT_FIELDS,
  analyzeReviewReplies,
  buildGbpData,
  competitorsForPlace,
  deriveCompanyName,
  derivePlacesParts,
  EMPTY_FRESH_PLACES,
  fetchPlacesForCachedScan,
  fetchPlacesForStoredReport,
  isStoredReport,
  needsPlacesFetch,
  placeFacts,
  rehydratePlacesContent,
  rehydrateStoredReport,
  stripPlacesContent,
} from '@/app/lib/placesContent'
import type { PlacesFetchers } from '@/app/lib/placesContent'
import { buildGbpDataCheck, formatCompetitorsFinding } from '@/app/lib/checkBuilder'
import { ScanResultSchema } from '@/app/lib/scanResult'
import { buildPaidReport, freshPlacesFor, loadPlacesFixture, FIXTURE_PLACES_VALUES } from './fixtures/placesFixture'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function fakeFetchers(overrides: Partial<PlacesFetchers> = {}): PlacesFetchers {
  const fixture = loadPlacesFixture()
  return {
    getPlaceDetails: vi.fn(async (id: string) => (id === fixture.freshPlace.id ? fixture.freshPlace : null)),
    getCompetitorDetails: vi.fn(async (id: string) => fixture.freshCompetitors.find(c => c.placeId === id) ?? null),
    findBusinessByUrl: vi.fn(async () => ({ id: fixture.freshPlace.id, _domainMatch: true })),
    findNearbyCompetitors: vi.fn(async () => fixture.freshCompetitors),
    ...overrides,
  }
}

describe('stripPlacesContent — den riktiga paid-rapportens form', () => {
  it('fixturen är ett giltigt ScanResult', () => {
    expect(ScanResultSchema.safeParse(buildPaidReport()).success).toBe(true)
  })

  it('inga Places-värden finns kvar någonstans i den serialiserade JSON:en — men place_id gör det', () => {
    const report = buildPaidReport()
    const before = JSON.stringify(report)
    // Kontroll av fixturen: värdena finns verkligen i rapporten före strip.
    for (const value of FIXTURE_PLACES_VALUES) expect(before, value).toContain(value)

    const json = JSON.stringify(stripPlacesContent(report))
    for (const value of FIXTURE_PLACES_VALUES) expect(json, value).not.toContain(value)
    for (const id of ['ChIJtest-krogen', 'ChIJtest-alfa', 'ChIJtest-beta', 'ChIJtest-gamma', 'ChIJtest-delta', 'ChIJtest-epsilon']) {
      expect(json).toContain(id)
    }
  })

  it('varje fält i PLACES_CONTENT_FIELDS är tomt i den lagrade rapporten', () => {
    expect(PLACES_CONTENT_FIELDS.length).toBeGreaterThanOrEqual(20)
    const stored = stripPlacesContent(buildPaidReport())
    expect(stored.meta.companyName).toBe('')
    expect(stored.meta.bransch).toBe('')
    expect(stored.scores.google).toBeNull()
    expect(stored.scores.googleCount).toBeNull()
    expect(stored.gbp).toBeNull()
    expect(stored.reviewReplies.total).toBe(0)
    expect(stored.reviewReplies.sampleNote).toBe('')
    expect(stored.reviewInsights!.themes.every(t => t.quote === '')).toBe(true)
    expect(stored.reviewInsights!.themes.every(t => t.authorName === null && t.authorUri === null)).toBe(true)
    for (const c of stored.competitorComparison!.competitors) {
      expect([c.name, c.website, c.rating, c.reviewCount]).toEqual(['', '', null, null])
    }
    const check = (key: string) => stored.checks.find(c => c.key === key)!
    for (const key of ['openingHours', 'gbpData', 'competitors']) {
      expect([key, check(key).finding, check(key).data]).toEqual([key, '', null])
    }
    expect(check('reviewReplies').data).toBeNull()
    expect(check('localBusiness').richCodeExample).toBeNull()
    expect(stored.placesStripped).toMatchObject({
      checks: ['openingHours', 'reviewReplies', 'gbpData', 'competitors'],
      masterSchemaOwner: 'localBusiness',
      lookupByUrl: false,
      competitorPlaceIds: ['ChIJtest-alfa', 'ChIJtest-beta', 'ChIJtest-gamma', 'ChIJtest-delta', 'ChIJtest-epsilon'],
    })
    expect(stored.placesStripped.reviewQuotes).toHaveLength(3)
  })

  it('rör inte status, prioritet, poäng, AI-text, sajtens egna uppgifter eller jämförelsens statusar', () => {
    const report = buildPaidReport()
    const stored = stripPlacesContent(report)
    expect(stored.scores.free).toBe(report.scores.free)
    expect(stored.scores.full).toBe(report.scores.full)
    expect(stored.checks.map(c => [c.key, c.status, c.priority, c.richSteps, c.richRelevance, c.codeRef]))
      .toEqual(report.checks.map(c => [c.key, c.status, c.priority, c.richSteps, c.richRelevance, c.codeRef]))
    expect(stored.synthesis).toEqual(report.synthesis)
    expect(stored.reviewInsights!.praise).toEqual(report.reviewInsights!.praise)
    expect(stored.checks.find(c => c.key === 'phone')!.data).toEqual({ phones: ['031-555 66 77'] })
    expect(stored.placesRef).toEqual(report.placesRef)
    expect(stored.competitorComparison!.competitors.map(c => c.statuses))
      .toEqual(report.competitorComparison!.competitors.map(c => c.statuses))
    // Kodmallarna är tillbaka som rena mallar (platshållare i stället för Places-värden).
    expect(stored.checks.find(c => c.key === 'localBusiness')!.genericCodeTemplate).toContain('<TELEFONNUMMER>')
  })

  it('är idempotent och muterar inte indata', () => {
    const report = buildPaidReport()
    const copy = JSON.parse(JSON.stringify(report))
    const once = stripPlacesContent(report)
    expect(report).toEqual(copy)
    expect(stripPlacesContent(once)).toEqual(once)
    expect(isStoredReport(once)).toBe(true)
    expect(isStoredReport(report)).toBe(false)
  })

  it('tål ofullständiga objekt (rör bara fält som finns)', () => {
    const partial = { checks: [], scores: { free: 50, full: 40 } } as unknown as Parameters<typeof stripPlacesContent>[0]
    const stored = stripPlacesContent(partial)
    const { placesStripped, ...rest } = stored
    expect(rest).toEqual(partial)
    expect(placesStripped.v).toBe(1)
  })

  it('AI-skriven kod i ägarkortet (inte huvudschemat) lämnas orörd', () => {
    const report = buildPaidReport()
    report.checks.find(c => c.key === 'localBusiness')!.richCodeExample = '<p>AI-kod</p>'
    const stored = stripPlacesContent(report)
    expect(stored.checks.find(c => c.key === 'localBusiness')!.richCodeExample).toBe('<p>AI-kod</p>')
    expect(stored.placesStripped.masterSchemaOwner).toBeNull()
  })

  it('äldre rapport utan placesRef: slås upp via URL, jämförelsens place_id tas från check #36 via namnet', () => {
    const report = buildPaidReport()
    delete report.placesRef
    for (const c of report.competitorComparison!.competitors) delete c.placeId
    const stored = stripPlacesContent(report)
    expect(stored.placesStripped.lookupByUrl).toBe(true)
    expect(stored.competitorComparison!.competitors.map(c => c.placeId)).toEqual(['ChIJtest-alfa', 'ChIJtest-beta', 'ChIJtest-gamma'])
    expect(JSON.stringify(stored)).not.toContain('Konkurrent Alfa')
  })

  // bjurfors.se-buggen (Checklist.md juni 2026): meta.multipleLocations.cities är andra
  // kontors ortnamn (Places-innehåll) och får inte hamna i checkouts-DB:n — bara antalet.
  it('meta.multipleLocations.cities strippas, count behålls', () => {
    const report = buildPaidReport()
    report.meta.multipleLocations = { count: 15, cities: ['Kungälv', 'Madrid'] }
    const stored = stripPlacesContent(report)
    expect(stored.meta.multipleLocations).toEqual({ count: 15, cities: [] })
    expect(JSON.stringify(stored)).not.toContain('Kungälv')
    expect(JSON.stringify(stored)).not.toContain('Madrid')
  })

  it('meta.multipleLocations null (normalfallet) lämnas orört', () => {
    const report = buildPaidReport()
    report.meta.multipleLocations = null
    const stored = stripPlacesContent(report)
    expect(stored.meta.multipleLocations).toBeNull()
  })
})

describe('rehydratePlacesContent', () => {
  it('rundtur: strip + färsk Places-data (oförändrad hos Google) ger exakt samma rapport', () => {
    const report = buildPaidReport()
    const rehydrated = rehydratePlacesContent(stripPlacesContent(report), freshPlacesFor())
    expect(rehydrated).toEqual(report)
    expect(ScanResultSchema.safeParse(rehydrated).success).toBe(true)
  })

  it('ändrad data hos Google syns i rapporten men status och poäng är de uppmätta', () => {
    const report = buildPaidReport()
    const fresh = freshPlacesFor()
    fresh.place = { ...fresh.place, rating: 4.8, userRatingCount: 400, nationalPhoneNumber: '031-800 00 00' }
    const rehydrated = rehydratePlacesContent(stripPlacesContent(report), fresh)
    expect(rehydrated.scores.google).toBe(4.8)
    expect(rehydrated.gbp!.phone).toBe('031-800 00 00')
    const gbpCheck = rehydrated.checks.find(c => c.key === 'gbpData')!
    expect(gbpCheck.finding).toBe('Google Business Profile: Krogen Test -- betyg 4.8/5 (400 recensioner).')
    expect(gbpCheck.status).toBe('ok')
    expect(rehydrated.scores.free).toBe(report.scores.free)
    expect(rehydrated.checks.find(c => c.key === 'localBusiness')!.richCodeExample).toContain('+46 31 800 00 00')
  })

  it('utan färsk data (API-fel): ärliga texter, inga Places-värden, inget kastas', () => {
    const report = buildPaidReport()
    const rehydrated = rehydratePlacesContent(stripPlacesContent(report), EMPTY_FRESH_PLACES)
    expect(rehydrated.gbp).toBeNull()
    expect(rehydrated.scores.google).toBeNull()
    expect(rehydrated.meta.companyName).toBe('Restaurang Krogen Test')
    expect(rehydrated.checks.find(c => c.key === 'openingHours')!.finding).toContain('kunde inte hämtas')
    expect(rehydrated.checks.find(c => c.key === 'competitors')!.finding).toContain('kunde inte hämtas')
    expect(rehydrated.checks.find(c => c.key === 'gbpData')!.data).toBeNull()
    expect(rehydrated.reviewInsights!.themes).toEqual([])
    expect(rehydrated.competitorComparison!.competitors.every(c => c.name === 'Okänd konkurrent')).toBe(true)
    expect(rehydrated.checks.map(c => c.status)).toEqual(report.checks.map(c => c.status))
    // Huvudschemat byggs ändå — av sajtens egna uppgifter.
    expect(rehydrated.checks.find(c => c.key === 'localBusiness')!.richCodeExample).toContain('031-555 66 77'.replace(/^0/, '+46 ').replace(/-/g, ' '))
  })

  it('kreditera författaren igen vid läsning (Places policy) — rätt namn/länk per citat', () => {
    const report = buildPaidReport()
    const rehydrated = rehydratePlacesContent(stripPlacesContent(report), freshPlacesFor())
    expect(rehydrated.reviewInsights!.themes.map(t => [t.theme, t.authorName, t.authorUri])).toEqual([
      ['Uteservering', 'Lisa Larsson', 'https://www.google.com/maps/contrib/1000000001'],
      ['Mat och service', 'Johan Öberg', 'https://www.google.com/maps/contrib/1000000002'],
      ['Prisvärdhet', 'Sara Nilsson', 'https://www.google.com/maps/contrib/1000000003'],
    ])
  })

  it('ett recensionstema vars citat inte längre finns hos Google utelämnas', () => {
    const report = buildPaidReport()
    const fresh = freshPlacesFor()
    fresh.place = { ...fresh.place, reviews: fresh.place.reviews.filter((r: { text: { text: string } }) => !r.text.text.includes('högt pris')) }
    const rehydrated = rehydratePlacesContent(stripPlacesContent(report), fresh)
    expect(rehydrated.reviewInsights!.themes.map(t => t.theme)).toEqual(['Uteservering', 'Mat och service'])
  })

  it('en rapport utan placesStripped returneras oförändrad', () => {
    const report = buildPaidReport()
    expect(rehydratePlacesContent(report as never, EMPTY_FRESH_PLACES)).toEqual(report)
  })
})

describe('fetchPlacesForStoredReport / rehydrateStoredReport', () => {
  it('hämtar Place Details för place_id och konkurrenterna per place_id (unika), med position som ursprung', async () => {
    const fetchers = fakeFetchers()
    const fresh = await fetchPlacesForStoredReport(stripPlacesContent(buildPaidReport()), fetchers)
    expect(fetchers.getPlaceDetails).toHaveBeenCalledWith('ChIJtest-krogen')
    expect(fetchers.getCompetitorDetails).toHaveBeenCalledTimes(5)
    expect(fetchers.getCompetitorDetails).toHaveBeenCalledWith('ChIJtest-alfa', { latitude: 57.7001, longitude: 11.9701 })
    expect(fetchers.findBusinessByUrl).not.toHaveBeenCalled()
    expect(fresh.place!._domainMatch).toBe(true)
    expect(fresh.competitors.size).toBe(5)
  })

  it('rehydrateStoredReport med färsk data ger den ursprungliga rapporten', async () => {
    const report = buildPaidReport()
    expect(await rehydrateStoredReport(stripPlacesContent(report), fakeFetchers())).toEqual(report)
  })

  it('äldre rapport utan place_id slås upp via Text Search', async () => {
    const report = buildPaidReport()
    delete report.placesRef
    const fetchers = fakeFetchers()
    const fresh = await fetchPlacesForStoredReport(stripPlacesContent(report), fetchers)
    expect(fetchers.findBusinessByUrl).toHaveBeenCalledWith('https://www.krogentest.se', 'Göteborg')
    expect(fresh.place!.id).toBe('ChIJtest-krogen')
  })

  it('fel i hämtningen ger en rapport utan Places-data i stället för ett kast', async () => {
    const fetchers = fakeFetchers({
      getPlaceDetails: vi.fn(async () => { throw new Error('nät nere') }),
      getCompetitorDetails: vi.fn(async () => { throw new Error('nät nere') }),
    })
    const rehydrated = await rehydrateStoredReport(stripPlacesContent(buildPaidReport()), fetchers)
    expect(rehydrated.gbp).toBeNull()
    expect(rehydrated.competitorComparison!.competitors[0].name).toBe('Okänd konkurrent')
  })

  it('rapport utan Places-referenser gör inga anrop', async () => {
    const fetchers = fakeFetchers()
    const stored = stripPlacesContent({ meta: { url: 'https://a.se' }, checks: [] } as never)
    expect(needsPlacesFetch(stored)).toBe(false)
    await rehydrateStoredReport(stored, fetchers)
    expect(fetchers.getPlaceDetails).not.toHaveBeenCalled()
    expect(fetchers.getCompetitorDetails).not.toHaveBeenCalled()
  })

  it('utan GOOGLE_PLACES_API_KEY görs inga nätverksanrop med standardhämtarna', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const rehydrated = await rehydrateStoredReport(stripPlacesContent(buildPaidReport()))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rehydrated.gbp).toBeNull()
  })
})

describe('fetchPlacesForCachedScan / competitorsForPlace', () => {
  it('ingen place_id → inga anrop', async () => {
    const fetchers = fakeFetchers()
    expect(await fetchPlacesForCachedScan({ placeId: null, domainMatch: null, placeWarning: null }, fetchers))
      .toEqual({ place: null, competitorList: [] })
    expect(fetchers.getPlaceDetails).not.toHaveBeenCalled()
  })

  it('färsk Place Details + Nearby Search med platsens position, typ och id', async () => {
    const fetchers = fakeFetchers()
    const fresh = await fetchPlacesForCachedScan({ placeId: 'ChIJtest-krogen', domainMatch: false, placeWarning: 'Kunde inte verifiera' }, fetchers)
    expect(fresh.place!._domainMatch).toBe(false)
    expect(fresh.place!._warning).toBe('Kunde inte verifiera')
    expect(fetchers.findNearbyCompetitors).toHaveBeenCalledWith(57.7001, 11.9701, 'bar', 'ChIJtest-krogen', undefined, undefined, null)
    expect(fresh.competitorList).toHaveLength(5)
  })

  it('trådar primaryTypeDisplayName.text vidare till findNearbyCompetitors (Text Search-fallbacken i places.ts)', async () => {
    const fetchers = fakeFetchers()
    await competitorsForPlace({ id: 'x', primaryType: 'general_contractor', location: { latitude: 1, longitude: 2 }, primaryTypeDisplayName: { text: 'Generalentreprenör', languageCode: 'sv' } }, fetchers)
    expect(fetchers.findNearbyCompetitors).toHaveBeenCalledWith(1, 2, 'general_contractor', 'x', undefined, undefined, 'Generalentreprenör')
  })

  it('misslyckad Place Details → ingen plats och ingen Nearby Search', async () => {
    const fetchers = fakeFetchers({ getPlaceDetails: vi.fn(async () => null) })
    expect(await fetchPlacesForCachedScan({ placeId: 'ChIJtest-krogen', domainMatch: true, placeWarning: null }, fetchers))
      .toEqual({ place: null, competitorList: [] })
    expect(fetchers.findNearbyCompetitors).not.toHaveBeenCalled()
  })

  it('competitorsForPlace kräver position, primaryType och id och kastar aldrig', async () => {
    const fetchers = fakeFetchers({ findNearbyCompetitors: vi.fn(async () => { throw new Error('boom') }) })
    expect(await competitorsForPlace({ id: 'x', primaryType: 'bar' }, fetchers)).toEqual([])
    expect(fetchers.findNearbyCompetitors).not.toHaveBeenCalled()
    expect(await competitorsForPlace({ id: 'x', primaryType: 'bar', location: { latitude: 1, longitude: 2 } }, fetchers)).toEqual([])
  })
})

describe('härledning ur Places-data', () => {
  it('analyzeReviewReplies: alltid notMeasured, stickprovsnotering bara när totalen är större', () => {
    expect(analyzeReviewReplies([], 10)).toMatchObject({ total: 0, status: 'notMeasured', sampleNote: '' })
    expect(analyzeReviewReplies([{}, {}], 10)).toMatchObject({ total: 2, sampleNote: 'Baserat på ett stickprov av 2 recensioner av totalt 10 (Google Places API-gränsen).' })
    expect(analyzeReviewReplies([{}, {}], 1).sampleNote).toBe('')
    expect(analyzeReviewReplies([{}], undefined).finding).toContain('ägarsvar')
  })

  it('deriveCompanyName: Places-namn först, annars första title-segmentet', () => {
    expect(deriveCompanyName({ displayName: { text: 'Krogen Test' } }, 'X | Y')).toBe('Krogen Test')
    expect(deriveCompanyName(null, 'Sprej – Frisör i Umeå')).toBe('Sprej')
    expect(deriveCompanyName(null, null)).toBe('')
  })

  it('derivePlacesParts: recensioner bara från Place Details', () => {
    const place = { displayName: { text: 'A' }, primaryType: 'hair_salon', reviews: [{}] }
    expect(derivePlacesParts({ place, details: null, title: null })).toMatchObject({ companyName: 'A', bransch: 'frisör', reviews: [] })
    expect(derivePlacesParts({ place, details: place, title: null }).reviews).toHaveLength(1)
  })

  it('placeFacts: gatuadress och postnummer ur formattedAddress', () => {
    const facts = placeFacts(loadPlacesFixture().freshPlace)
    expect(facts).toMatchObject({ streetAddress: 'Testgatan 12', postalCode: '411 36', phone: '031-700 12 34', latitude: 57.7001, placeId: 'ChIJtest-krogen', googleRating: 4.6, reviewCount: 321 })
    expect(placeFacts(null)).toMatchObject({ phone: undefined, streetAddress: null, placeId: null })
  })

  it('buildGbpData: null utan plats', () => {
    expect(buildGbpData(null)).toBeNull()
    expect(buildGbpData({ ...loadPlacesFixture().freshPlace, _domainMatch: true })).toEqual(loadPlacesFixture().report.gbp)
  })

  it('checkBuilder-hjälparna ger samma texter som i en riktig rapport', () => {
    const fixture = loadPlacesFixture()
    const gbpCheck = fixture.report.checks.find(c => c.key === 'gbpData')!
    expect(buildGbpDataCheck(fixture.freshPlace)).toMatchObject({ status: 'ok', finding: gbpCheck.finding, data: gbpCheck.data, fix: null })
    expect(buildGbpDataCheck({ displayName: { text: 'A' } })).toMatchObject({ status: 'warning', data: { name: 'A', rating: null, userRatingCount: null } })
    expect(formatCompetitorsFinding(fixture.freshCompetitors)).toBe(fixture.report.checks.find(c => c.key === 'competitors')!.finding)
  })
})
