export async function findBusinessByUrl(url: string, cityHint?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const domain = new URL(url).hostname.replace(/^www\./, '').replace(/\.(se|com|nu|net|org)$/, '')

  // Strategi 1: Sök på domännamn + ort
  const searchQueries = [
    `${domain} ${cityHint || ''}`.trim(),
    `${domain}`.trim(),
  ]

  for (const query of searchQueries) {
    if (!query) continue

    const res = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey!,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types,places.primaryType,places.location',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'sv',
        }),
      }
    )

    if (!res.ok) continue
    const data = await res.json()
    const place = data.places?.[0]

    if (!place) continue

    // VALIDERING: Kolla om websiteUri matchar vår domän
    if (place.websiteUri) {
      try {
        const placeDomain = new URL(place.websiteUri).hostname.replace(/^www\./, '')
        const ourDomain = new URL(url).hostname.replace(/^www\./, '')

        if (placeDomain === ourDomain) {
          return { ...place, _domainMatch: true, _searchQuery: query }
        }
      } catch {
        // Ogiltig URL, fortsätt
      }
    }
  }

  // Strategi 2: Om ingen matchade domänen, returnera ändå första resultatet men flagga
  const fallbackRes = await fetch(
    `https://places.googleapis.com/v1/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types',
      },
      body: JSON.stringify({
        textQuery: domain,
        languageCode: 'sv',
      }),
    }
  )

  if (!fallbackRes.ok) return null
  const fallbackData = await fallbackRes.json()
  const fallbackPlace = fallbackData.places?.[0]

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
