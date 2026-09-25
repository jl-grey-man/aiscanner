import { describe, it, expect, vi, afterEach } from 'vitest'
import { toNearbyCompetitor, getCompetitorDetails, findNearbyCompetitors, findBusinessByUrl, extractCityFromAddress } from '@/app/lib/places'

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
    // (electrician). Fjärran ligger ~40 km bort, utanför radien på 1500 m -> bortfiltrerad
    // (locationBias är bara en viktning, ingen gräns, så radien måste kontrolleras själv).
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a'])
  })

  it('Text Search-fallbacken sorterar på avstånd inom radien', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    // ~1 km bort, står först i Googles svar -- ska hamna efter Alfa (~0 m).
    const enKmBort = { ...konkurrentA, id: 'ChIJ-1km', displayName: { text: 'Kilometer Bygg' }, location: { latitude: 57.709, longitude: 11.97 } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unsupported types: general_contractor.', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [enKmBort, konkurrentA] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await findNearbyCompetitors(57.71, 11.97, 'general_contractor', 'exclude-me', 1500, 6, 'Generalentreprenör')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-a', 'ChIJ-1km'])
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

    // Stor radie (100 km) så att testet bara prövar capningen, inte radiefiltret.
    const result = await findNearbyCompetitors(57.7, 11.97, 'general_contractor', 'exclude-me', 100000, 2, 'Generalentreprenör')
    expect(result.map((c) => c.placeId)).toEqual(['ChIJ-near', 'ChIJ-mid'])
  })
})

describe('extractCityFromAddress', () => {
  it('extraherar ortnamnet efter ett svenskt postnummer (mellanslag mitt i, "NNN NN")', () => {
    expect(extractCityFromAddress('Sankt Larsgatan 24, 582 24 Linköping, Sverige')).toBe('Linköping')
    expect(extractCityFromAddress('Klostergatan 9, 553 17 Jönköping, Sverige')).toBe('Jönköping')
    expect(extractCityFromAddress('731 32 Köping, Sverige')).toBe('Köping')
  })

  it('null utan igenkännbart postnummer+ort eller utan adress', () => {
    expect(extractCityFromAddress(null)).toBeNull()
    expect(extractCityFromAddress(undefined)).toBeNull()
    expect(extractCityFromAddress('Ingen adress här')).toBeNull()
  })
})

// bjurfors.se-buggen (Checklist.md juni 2026, QA-run 2026-06-15): en nationell kedja har
// EN webbplats men MÅNGA lokalkontor, var och en med en egen Google Business Profile som
// pekar mot samma domän. Utan stad från användaren valde findBusinessByUrl tidigare
// godtyckligt det första Google råkade returnera (t.ex. Kungälv/Spanien i stället för
// HQ Göteborg). Verifierat live 2026-09-25 mot riktiga Places-data (se slutrapporten):
// sökning på "bjurfors" ensamt matchar 15 distinkta kontor på bjurfors.se.
describe('findBusinessByUrl', () => {
  const linkoping = {
    id: 'ChIJ-linkoping', displayName: { text: 'Bjurfors' },
    formattedAddress: 'Sankt Larsgatan 24, 582 24 Linköping, Sverige',
    websiteUri: 'https://www.bjurfors.se/sv/om-oss/vara-kontor/bjurfors-linkoping/',
    rating: 4.5, userRatingCount: 20, primaryType: 'real_estate_agency', location: { latitude: 1, longitude: 1 },
  }
  const goteborg = {
    id: 'ChIJ-goteborg', displayName: { text: 'Bjurfors Göteborg' },
    formattedAddress: 'Avenyn 1, 411 36 Göteborg, Sverige',
    websiteUri: 'https://www.bjurfors.se/sv/om-oss/vara-kontor/goteborg/',
    rating: 4.7, userRatingCount: 40, primaryType: 'real_estate_agency', location: { latitude: 2, longitude: 2 },
  }
  const konkurrent = {
    id: 'ChIJ-annat', displayName: { text: 'Svensk Fastighetsförmedling' },
    formattedAddress: 'Drottninggatan 8, 582 25 Linköping, Sverige',
    websiteUri: 'https://www.svenskfast.se/',
    rating: 4.2, userRatingCount: 15,
  }

  function stubSearch(places: unknown[], status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places }), { status }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('ingen stad + flera distinkta kontor för domänen -> ingen plats attribueras, flaggar ambiguitet', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    stubSearch([linkoping, konkurrent, goteborg])

    const result = await findBusinessByUrl('https://www.bjurfors.se')
    expect(result).toEqual({
      _multipleLocations: {
        count: 2,
        cities: ['Linköping', 'Göteborg'],
      },
    })
  })

  it('ingen stad + bara ETT distinkt kontor för domänen (flera dubblettträffar i samma ort) -> attribuerar normalt', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const duplicate = { ...linkoping, id: 'ChIJ-linkoping-2' }
    stubSearch([linkoping, duplicate, konkurrent])

    const result = await findBusinessByUrl('https://www.bjurfors.se')
    expect(result?._multipleLocations).toBeUndefined()
    expect(result?._domainMatch).toBe(true)
    expect(result?.id).toBe('ChIJ-linkoping')
  })

  it('ingen stad + enkontors-sajt (t.ex. tvakanten.se) -> oförändrat beteende, ingen ambiguitetsflagga', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const tvakanten = {
      id: 'ChIJ-tvakanten', displayName: { text: 'Tvåkanten' },
      formattedAddress: 'Kungsportsavenyen 1, 411 36 Göteborg, Sverige',
      websiteUri: 'https://www.tvakanten.se/', rating: 4.6, userRatingCount: 900,
    }
    stubSearch([tvakanten])

    const result = await findBusinessByUrl('https://www.tvakanten.se')
    expect(result?._multipleLocations).toBeUndefined()
    expect(result?.id).toBe('ChIJ-tvakanten')
    expect(result?._domainMatch).toBe(true)
  })

  it('stad angiven -> ingen ambiguitetskontroll, tar första domänträffen på domän+stad-sökningen (Göteborg-fallet)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    // Sökningen "bjurfors Göteborg" ger bara Göteborgskontoret -- precis som riktig Places-
    // viktning mot ortsnamnet i frågesträngen gör.
    stubSearch([goteborg])

    const result = await findBusinessByUrl('https://www.bjurfors.se', 'Göteborg')
    expect(result?.id).toBe('ChIJ-goteborg')
    expect(result?._domainMatch).toBe(true)
    expect(result?._multipleLocations).toBeUndefined()
  })

  it('ingen domänträff alls -> Strategi 2-fallback flaggad som overifierad (oförändrat)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [konkurrent] }), { status: 200 })) // domän-sökningen: ingen matchning
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [konkurrent] }), { status: 200 })) // Strategi 2-fallbacken
    vi.stubGlobal('fetch', fetchMock)

    const result = await findBusinessByUrl('https://www.bjurfors.se')
    expect(result?._domainMatch).toBe(false)
    expect(result?._warning).toContain('Kunde inte verifiera')
    expect(result?._multipleLocations).toBeUndefined()
  })
})
