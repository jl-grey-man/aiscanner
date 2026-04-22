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
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types',
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
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=sv`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,photos,editorialSummary,types,reviews',
      },
    }
  )
  if (!res.ok) return null
  return res.json()
}
