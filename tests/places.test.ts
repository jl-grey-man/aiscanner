import { describe, it, expect, vi, afterEach } from 'vitest'
import { toNearbyCompetitor, getCompetitorDetails, findNearbyCompetitors } from '@/app/lib/places'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const raw = {
  id: 'ChIJtest-alfa',
  displayName: { text: 'Konkurrent Alfa' },
  rating: 4.3,
  userRatingCount: 1210,
  primaryType: 'bar',
  location: { latitude: 57.7019, longitude: 11.9701 },
  websiteUri: 'https://www.alfakrog.se/',
}

describe('toNearbyCompetitor', () => {
  it('mappar fälten och räknar avstånd från ursprunget', () => {
    expect(toNearbyCompetitor(raw, { latitude: 57.7001, longitude: 11.9701 })).toEqual({
      placeId: 'ChIJtest-alfa',
      name: 'Konkurrent Alfa',
      rating: 4.3,
      userRatingCount: 1210,
      distanceMeters: 200,
      primaryType: 'bar',
      websiteUri: 'https://www.alfakrog.se/',
    })
  })

  it('saknad position, betyg eller webbplats → 0 m och null', () => {
    expect(toNearbyCompetitor({ id: 'x' }, null)).toEqual({
      placeId: 'x', name: 'Okänt företag', rating: null, userRatingCount: null, distanceMeters: 0, primaryType: null, websiteUri: null,
    })
  })
})

describe('getCompetitorDetails', () => {
  it('hämtar Place Details med konkurrentfältmasken', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getCompetitorDetails('ChIJtest-alfa', { latitude: 57.7001, longitude: 11.9701 })
    expect(result?.name).toBe('Konkurrent Alfa')
    expect(result?.distanceMeters).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJtest-alfa?languageCode=sv')
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,displayName,rating,userRatingCount,primaryType,location,websiteUri')
  })

  it('null utan API-nyckel (inget anrop), vid HTTP-fel och vid nätverksfel', async () => {
    const fetchMock = vi.fn(async () => new Response('nej', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    expect(await getCompetitorDetails('x', null)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    expect(await getCompetitorDetails('x', null)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('nät nere') }))
    expect(await getCompetitorDetails('x', null)).toBeNull()
  })
})

// roranalys.se-buggen (verifierad live sep 2026): Places avvisar
// includedPrimaryTypes: ["general_contractor"] med HTTP 400 "Unsupported types:
// general_contractor.", vilket tidigare gjorde att !res.ok-grenen returnerade []
// tyst och competitors-checken blev notMeasured trots att grannföretag fanns.
describe('findNearbyCompetitors', () => {
  const konkurrentA = {
    id: 'ChIJ-a', displayName: { text: 'Alfa Bygg' }, rating: 4.5, userRatingCount: 10,
    primaryType: 'general_contractor', types: ['general_contractor', 'point_of_interest'],
    location: { latitude: 57.71, longitude: 11.97 }, websiteUri: 'https://alfabygg.se',
  }
  const konkurrentB = {
    id: 'ChIJ-b', displayName: { text: 'Beta Elektriker' }, rating: 4.0, userRatingCount: 5,
    primaryType: 'electrician', types: ['electrician', 'point_of_interest'],
    location: { latitude: 57.70, longitude: 11.96 }, websiteUri: 'https://betael.se',
  }

  it('normalfall: 200 med typfilter -> mappar alla träffar', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places: [konkurrentA] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby')
    const body = JSON.parse(init.body as string)
    expect(body.includedPrimaryTypes).toEqual(['general_contractor'])
  })

  it('HTTP 400 "Unsupported types" -> Text Search på primaryTypeDisplayName, post-filtrerar på types, sorterar på avstånd (roranalys-fallet)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    // Längre bort men står först i Googles svar -- ska hamna sist efter avståndssortering.
    const langreBort = { ...konkurrentA, id: 'ChIJ-far', displayName: { text: 'Fjärran Bygg' }, location: { latitude: 58.0, longitude: 12.5 } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [langreBort, konkurrentA, konkurrentB] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [textUrl, textInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(textUrl).toBe('https://places.googleapis.com/v1/places:searchText')
    const textBody = JSON.parse(textInit.body as string)
    expect(textBody.textQuery).toBe('Generalentreprenör')
    expect(textBody.includedType).toBeUndefined()
    expect(textBody.includedPrimaryTypes).toBeUndefined()
    expect(textBody.locationBias.circle.center).toEqual({ latitude: 57.7, longitude: 11.97 })

    // Post-filtrerad på types.includes('general_contractor') -> bara Alfa/Fjärran, inte Beta
    // (electrician), och sorterad på avstånd -> Alfa (nära) före Fjärran (långt bort).
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a', 'ChIJ-far'])
  })

  it('HTTP 400 "Unsupported types" utan primaryTypeDisplayName -> ingen Text Search, returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response('Unsupported types: general_contractor.', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('HTTP 400 "Unsupported types" + Text Search post-filter ger inga träffar -> returnerar [] (INGEN fallback till ofiltrerad lista)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [konkurrentB] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    // Ingen träff matchar general_contractor exakt -> [] (irrelevanta träffar är värre
    // än notMeasured -- ingen fallback till en ofiltrerad lista längre).
    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result).toEqual([])
  })

  it('HTTP 400 utan "Unsupported types" -> ingen Text Search, returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response('Invalid request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('övrig HTTP-status (t.ex. 403) -> ingen Text Search, returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Text Search-fallbacken misslyckas också -> returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exkluderar det egna företaget ur Text Search-resultatet', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [{ ...konkurrentA, id: 'exclude-me' }, konkurrentA] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a'])
  })

  it('capar Text Search-fallbacken vid maxResultCount efter avståndssortering', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const near = { ...konkurrentA, id: 'ChIJ-near', displayName: { text: 'Nära Bygg' }, location: { latitude: 57.701, longitude: 11.971 } }
    const mid = { ...konkurrentA, id: 'ChIJ-mid', displayName: { text: 'Mellan Bygg' }, location: { latitude: 57.72, longitude: 12.0 } }
    const far = { ...konkurrentA, id: 'ChIJ-far2', displayName: { text: 'Fjärran Bygg' }, location: { latitude: 58.0, longitude: 12.5 } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [far, near, mid] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 1500, 2, 'Generalentreprenör')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-near', 'ChIJ-mid'])
  })
})
