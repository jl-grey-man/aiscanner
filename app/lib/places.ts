/** Fältmasken för Text Search-anropen i findBusinessByUrl (Strategi 1). */
const FIND_BUSINESS_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types,places.primaryType,places.location'

export interface MultipleLocationsInfo {
  count: number
  cities: string[]
}

/**
 * Extraherar ortnamnet ur en Places `formattedAddress` (t.ex. "Sankt Larsgatan 24,
 * 582 24 Linköping, Sverige" -> "Linköping"). Svenskt postnummerformat "NNN NN"
 * (mellanslag mitt i) — samma format som placeFacts() i placesContent.ts, men den
 * funktionen fångar bara adress + postnummer, inte ortnamnet efteråt. Returnerar
 * null om adressen saknar ett igenkännbart postnummer+ort-mönster.
 */
export function extractCityFromAddress(formattedAddress: string | null | undefined): string | null {
  if (!formattedAddress) return null
  const m = formattedAddress.match(/\d{3}\s?\d{2}\s+([A-ZÅÄÖ][^,]*)/)
  return m ? m[1].trim() : null
}

async function searchTextPlaces(query: string, apiKey: string, fieldMask: string): Promise<any[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'sv',
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.places) ? data.places : []
}

function matchesDomain(place: any, ourDomain: string): boolean {
  if (!place?.websiteUri) return false
  try {
    return new URL(place.websiteUri).hostname.replace(/^www\./, '') === ourDomain
  } catch {
    return false
  }
}

/** Grupperar domänträffar per ort (första träffen per ort behålls, i Googles ordning). */
function groupByCity(matches: any[]): Map<string, any> {
  const byCity = new Map<string, any>()
  for (const place of matches) {
    const city = extractCityFromAddress(place.formattedAddress) || place.formattedAddress || 'Okänd ort'
    if (!byCity.has(city)) byCity.set(city, place)
  }
  return byCity
}

function multipleLocationsResult(byCity: Map<string, any>) {
  return {
    _multipleLocations: {
      count: byCity.size,
      cities: [...byCity.keys()],
    } satisfies MultipleLocationsInfo,
  }
}

export async function findBusinessByUrl(url: string, cityHint?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!
  const domain = new URL(url).hostname.replace(/^www\./, '').replace(/\.(se|com|nu|net|org)$/, '')
  const ourDomain = new URL(url).hostname.replace(/^www\./, '')

  if (!cityHint) {
    // Strategi 1 utan stad: sök bara på domännamnet och undersök ALLA träffar (inte
    // bara den första). En nationell kedja (t.ex. bjurfors.se) har EN webbplats men
    // MÅNGA lokalkontor, var och en med en egen Google Business Profile som pekar mot
    // samma webbplats — utan en stad från användaren kan vi inte veta vilket kontor
    // som är rätt. bjurfors.se-buggen (QA juni 2026, Checklist.md): valde godtyckligt
    // det kontor Google råkade returnera först (Kungälv/Spanien i stället för HQ
    // Göteborg). Fix: räkna DISTINKTA orter bland domänträffarna — fler än en =
    // tvetydigt, ingen attribuering (se collectScanData i route.ts).
    const places = await searchTextPlaces(domain, apiKey, FIND_BUSINESS_FIELD_MASK)
    const matches = places.filter((p) => matchesDomain(p, ourDomain))

    if (matches.length > 0) {
      const byCity = groupByCity(matches)
      if (byCity.size > 1) return multipleLocationsResult(byCity)

      const [[, place]] = byCity
      return { ...place, _domainMatch: true, _searchQuery: domain }
    }
  } else {
    // Strategi 1 med stad: domän + ort först (Google Text Search viktar mot ortsnamnet),
    // sedan bara domän. Samla ALLA domänträffar från båda sökningarna och välj kontoret
    // i den angivna staden — inte bara Googles första träff. Annars kunde en kedja utan
    // kontor i den angivna staden (t.ex. "bjurfors" + Umeå) ge ett godtyckligt kontor
    // från den andra sökningen, dvs. samma bugg som utan stad.
    const wantedCity = cityHint.trim().toLowerCase()
    const matches: any[] = []
    const seen = new Set<string>()
    for (const query of [`${domain} ${cityHint}`.trim(), domain]) {
      const places = await searchTextPlaces(query, apiKey, FIND_BUSINESS_FIELD_MASK)
      for (const place of places) {
        if (!matchesDomain(place, ourDomain) || seen.has(place.id)) continue
        seen.add(place.id)
        matches.push(place)
        if (extractCityFromAddress(place.formattedAddress)?.toLowerCase() === wantedCity) {
          return { ...place, _domainMatch: true, _searchQuery: query }
        }
      }
    }

    if (matches.length > 0) {
      const byCity = groupByCity(matches)
      // Flera kontor men inget i den angivna staden -> fråga i stället för att gissa.
      if (byCity.size > 1) return multipleLocationsResult(byCity)
      // Ett enda kontor (användaren angav t.ex. en grannort) -> det kontoret.
      const [[, place]] = byCity
      return { ...place, _domainMatch: true, _searchQuery: domain }
    }
  }

  // Strategi 2: Om ingen matchade domänen, returnera ändå första resultatet men flagga
  const fallbackPlaces = await searchTextPlaces(
    domain,
    apiKey,
    'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types',
  )
  const fallbackPlace = fallbackPlaces[0]

  if (!fallbackPlace) return null

  return { ...fallbackPlace, _domainMatch: false, _warning: 'Kunde inte verifiera att detta är rätt företag. Kontrollera att adressen stämmer.' }
}

export async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=sv`
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey!,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,photos,editorialSummary,types,primaryType,primaryTypeDisplayName,location,reviews',
    },
  })
  if (!res.ok) return null
  const data = await res.json()

  console.log(`[Places] Reviews: ${data.reviews?.length ?? 0}`)

  return data
}

export interface NearbyCompetitor {
  placeId: string
  name: string
  rating: number | null
  userRatingCount: number | null
  distanceMeters: number
  primaryType: string | null
  /** Konkurrentens webbplats enligt Google-profilen — scannas i paid (competitorComparison.ts). */
  websiteUri: string | null
}

/**
 * Find up to N nearest businesses with the same primaryType, excluding the
 * business itself. Returns [] if Places API doesn't have lat/lng or fails.
 *
 * Uses Places API (New) Nearby Search — same Google Cloud project as
 * findBusinessByUrl, billed under the SKU "Nearby Search (New)".
 */
const NEARBY_FIELD_MASK = 'places.id,places.displayName,places.rating,places.userRatingCount,places.primaryType,places.types,places.location,places.websiteUri'

type NearbySearchResult = { ok: true; places: any[] } | { ok: false; status: number; body: string }

async function searchNearby(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  maxResultCount: number,
  primaryType: string | null,
): Promise<NearbySearchResult> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify({
      ...(primaryType ? { includedPrimaryTypes: [primaryType] } : {}),
      maxResultCount,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      languageCode: 'sv',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, status: res.status, body }
  }
  const data = await res.json()
  return { ok: true, places: data.places ?? [] }
}

/**
 * Places API (New) Text Search — used ONLY as a fallback when Nearby Search's
 * `includedPrimaryTypes` filter rejects the type (see findNearbyCompetitors).
 * Different billing SKU than Nearby Search ("Text Search (New)" vs "Nearby
 * Search (New)") — see CLAUDE.md "Competitors check #36".
 */
async function searchTextNearby(
  apiKey: string,
  textQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  maxResultCount: number,
): Promise<NearbySearchResult> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'sv',
      maxResultCount,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      // Deliberately no includedType — Google rejects the same types there too
      // (verified live: "Invalid included_type" for "general_contractor").
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, status: res.status, body }
  }
  const data = await res.json()
  return { ok: true, places: data.places ?? [] }
}

/** Rå Places-plats (Nearby/Text Search) -> NearbyCompetitor-lista, deduplicerad på normaliserat namn. */
function toCompetitorsList(places: any[], lat: number, lng: number): NearbyCompetitor[] {
  const competitors: NearbyCompetitor[] = []
  const seenNames = new Set<string>()
  for (const p of places) {
    const competitor = toNearbyCompetitor(p, { latitude: lat, longitude: lng })
    // Dedupe on normalized name (Google often lists the same business with multiple Place IDs)
    const normName = competitor.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ´`'']/g, '').trim()
    if (seenNames.has(normName)) continue
    seenNames.add(normName)
    competitors.push(competitor)
  }
  return competitors
}

/**
 * Find up to N nearest businesses with the same primaryType, excluding the
 * business itself. Returns [] if Places API doesn't have lat/lng or fails.
 *
 * Uses Places API (New) Nearby Search — same Google Cloud project as
 * findBusinessByUrl, billed under the SKU "Nearby Search (New)".
 *
 * Google's `includedPrimaryTypes` filter rejects some legitimate Place types
 * with HTTP 400 "Unsupported types: X" (verified for e.g. "general_contractor",
 * even though Place Details happily returns it as `primaryType`). `includedType`
 * on Text Search rejects the same types too ("Invalid included_type" — verified
 * live), so there is no type-filtered request that works for these businesses.
 *
 * Fallback (fix sep 2026, roranalys.se): on that specific 400, run a Text Search
 * for the business's own Swedish `primaryTypeDisplayName` (e.g. "Generalentreprenör")
 * biased to the same location, with NO type filter, then post-filter the results
 * ourselves against the returned `types` field, exclude the business itself, sort
 * by distance and cap at `maxResultCount`. An earlier version of this fix fell back
 * to the unfiltered nearby list when the post-filter matched nothing — that produced
 * arbitrary unrelated neighbouring businesses labelled as "competitors" and fed them
 * into the paid competitor comparison (irrelevant results are worse than notMeasured).
 * That fallback has been removed: if nothing matches the exact type, this returns []
 * and the check stays `notMeasured` with an accurate "no same-type business nearby"
 * finding (see checkBuilder.ts `buildCompetitorsNotMeasuredFinding`).
 */
export async function findNearbyCompetitors(
  lat: number,
  lng: number,
  primaryType: string | null,
  excludePlaceId: string,
  radiusMeters = 1500,
  maxResultCount = 6,
  primaryTypeDisplayName: string | null = null,
): Promise<NearbyCompetitor[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !primaryType || typeof lat !== 'number' || typeof lng !== 'number') return []

  try {
    const result = await searchNearby(apiKey, lat, lng, radiusMeters, maxResultCount, primaryType)

    if (result.ok) {
      const places = result.places.filter((p) => p.id && p.id !== excludePlaceId)
      return toCompetitorsList(places, lat, lng).slice(0, 5)
    }

    console.warn(`[Places Nearby] ${result.status}: ${result.body.slice(0, 200)}`)
    if (result.status !== 400 || !/Unsupported types/i.test(result.body)) return []

    // Google rejected includedPrimaryTypes for this type — fall back to Text Search
    // by the business's own type name, then post-filter/sort/cap ourselves.
    if (!primaryTypeDisplayName) {
      console.warn('[Places Nearby] no primaryTypeDisplayName available for Text Search fallback')
      return []
    }

    const textResult = await searchTextNearby(apiKey, primaryTypeDisplayName, lat, lng, radiusMeters, 10)
    if (!textResult.ok) {
      console.warn(`[Places Nearby] Text Search fallback ${textResult.status}: ${textResult.body.slice(0, 200)}`)
      return []
    }

    const wantedType = primaryType.toLowerCase()
    const sameType = textResult.places.filter((p) =>
      p.id && p.id !== excludePlaceId &&
      Array.isArray(p.types) && p.types.some((t: string) => t?.toLowerCase() === wantedType)
    )
    if (sameType.length === 0) return []

    const withDistance = sameType.map((p) => ({
      place: p,
      distance: typeof p.location?.latitude === 'number' && typeof p.location?.longitude === 'number'
        ? haversineMeters(lat, lng, p.location.latitude, p.location.longitude)
        : Infinity,
    }))
    // Text Search's locationBias only weights results — it is not a boundary — so enforce
    // the same radius as Nearby Search ourselves (the finding text says "≤1,5 km").
    const withinRadius = withDistance.filter((x) => x.distance <= radiusMeters)
    withinRadius.sort((a, b) => a.distance - b.distance)
    const capped = withinRadius.slice(0, maxResultCount).map((x) => x.place)

    return toCompetitorsList(capped, lat, lng).slice(0, 5)
  } catch (err: any) {
    console.warn(`[Places Nearby] failed: ${err.message}`)
    return []
  }
}

/**
 * Rå Places-plats (Nearby Search eller Place Details) → NearbyCompetitor. Avståndet
 * räknas från `origin` (det scannade företagets position); saknas någon position blir det 0.
 */
export function toNearbyCompetitor(
  p: any,
  origin: { latitude?: number; longitude?: number } | null | undefined,
): NearbyCompetitor {
  const plat = p.location?.latitude
  const plng = p.location?.longitude
  const olat = origin?.latitude
  const olng = origin?.longitude
  const distance = typeof plat === 'number' && typeof plng === 'number' && typeof olat === 'number' && typeof olng === 'number'
    ? haversineMeters(olat, olng, plat, plng)
    : 0
  return {
    placeId: p.id,
    name: p.displayName?.text ?? 'Okänt företag',
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    distanceMeters: Math.round(distance),
    primaryType: p.primaryType ?? null,
    websiteUri: typeof p.websiteUri === 'string' && p.websiteUri ? p.websiteUri : null,
  }
}

/**
 * Färsk konkurrentdata för ett sparat place_id (Place Details, samma fält som Nearby
 * Search). Används när en lagrad premiumrapport öppnas: Places-villkoren tillåter att
 * place_id lagras men inte namn/betyg/webbplats, så de hämtas om vid läsning.
 * Returnerar null vid saknad API-nyckel, HTTP-fel eller nätverksfel — kastar aldrig.
 */
export async function getCompetitorDetails(
  placeId: string,
  origin: { latitude?: number; longitude?: number } | null | undefined,
): Promise<NearbyCompetitor | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !placeId) return null
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=sv`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,primaryType,location,websiteUri',
      },
    })
    if (!res.ok) {
      console.warn(`[Places Details] konkurrent ${placeId}: HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    if (!data?.id) return null
    return toNearbyCompetitor(data, origin)
  } catch (err: any) {
    console.warn(`[Places Details] konkurrent ${placeId} misslyckades: ${err?.message}`)
    return null
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
