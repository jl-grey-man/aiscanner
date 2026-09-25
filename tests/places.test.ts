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
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.includedPrimaryTypes).toEqual(['general_contractor'])
  })

  it('HTTP 400 "Unsupported types" -> pratar om igen utan typfilter och post-filtrerar på returnerad primaryType/types (roranalys-fallet)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [konkurrentA, konkurrentB] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const retryBody = JSON.parse(retryInit.body as string)
    expect(retryBody.includedPrimaryTypes).toBeUndefined()

    // Post-filtrerad på primaryType === 'general_contractor' -> bara Alfa, inte Beta.
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a'])
  })

  it('HTTP 400 "Unsupported types" + post-filter ger inga träffar -> fallback till hela ofiltrerade listan', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [konkurrentB] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    // Ingen träff matchar general_contractor exakt -> fallback till ofiltrerad lista (Beta).
    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-b'])
  })

  it('HTTP 400 utan "Unsupported types" -> ingen retry, returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response('Invalid request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('övrig HTTP-status (t.ex. 403) -> ingen retry, returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retry (ofiltrerad) misslyckas också -> returnerar []', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exkluderar det egna företaget även efter fallback till ofiltrerad lista', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [{ ...konkurrentB, id: 'exclude-me' }, konkurrentB] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-b'])
  })
})
