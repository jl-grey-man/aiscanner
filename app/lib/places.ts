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
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,photos,editorialSummary,types,primaryType,location,reviews',
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
export async function findNearbyCompetitors(
  lat: number,
  lng: number,
  primaryType: string | null,
  excludePlaceId: string,
  radiusMeters = 1500,
  maxResultCount = 6
): Promise<NearbyCompetitor[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !primaryType || typeof lat !== 'number' || typeof lng !== 'number') return []

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.primaryType,places.location,places.websiteUri',
      },
      body: JSON.stringify({
        includedPrimaryTypes: [primaryType],
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
      console.warn(`[Places Nearby] ${res.status}: ${body.slice(0, 200)}`)
      return []
    }

    const data = await res.json()
    const places: any[] = data.places ?? []

    const competitors: NearbyCompetitor[] = []
    const seenNames = new Set<string>()
    for (const p of places) {
      if (!p.id || p.id === excludePlaceId) continue
      const competitor = toNearbyCompetitor(p, { latitude: lat, longitude: lng })
      // Dedupe on normalized name (Google often lists the same business with multiple Place IDs)
      const normName = competitor.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ´`'']/g, '').trim()
      if (seenNames.has(normName)) continue
      seenNames.add(normName)
      competitors.push(competitor)
    }
    return competitors.slice(0, 5)
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
