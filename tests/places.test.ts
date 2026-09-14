import { describe, it, expect, vi, afterEach } from 'vitest'
import { toNearbyCompetitor, getCompetitorDetails } from '@/app/lib/places'

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
