/**
 * Places raw `types`/`primaryType` value → svensk bransch-etikett (Audit #10).
 * Håll i synk med känslan i masterSchema.ts:s PLACES_TO_SCHEMA_TYPE — samma
 * Places-typer, men svenska ord i stället för schema.org-klasser.
 */
const PLACES_TYPE_MAP: Record<string, string> = {
  restaurant: 'restaurang', food: 'restaurang', fast_food_restaurant: 'snabbmatsrestaurang',
  meal_takeaway: 'restaurang', meal_delivery: 'restaurang',
  cafe: 'café', coffee_shop: 'café', bakery: 'bageri', ice_cream_shop: 'glassbar',
  bar: 'bar', pub: 'pub', wine_bar: 'vinbar', night_club: 'nattklubb',
  brewery: 'bryggeri', winery: 'vingård',
  hair_salon: 'frisör', hair_care: 'frisör', barber_shop: 'barberare',
  beauty_salon: 'skönhetssalong', nail_salon: 'nagelsalong', spa: 'spa', tattoo_parlor: 'tatueringsstudio',
  gym: 'gym', fitness_center: 'gym',
  dentist: 'tandläkare', dental_clinic: 'tandläkare', doctor: 'läkare', hospital: 'sjukhus',
  pharmacy: 'apotek', drugstore: 'apotek', veterinary_care: 'veterinär', optician: 'optiker',
  real_estate_agency: 'mäklare',
  lodging: 'hotell', hotel: 'hotell', hostel: 'vandrarhem', motel: 'motell',
  bed_and_breakfast: 'bed & breakfast', campground: 'camping',
  plumber: 'rörmokare', electrician: 'elektriker', roofing_contractor: 'takläggare',
  general_contractor: 'hantverkare', painter: 'målare', locksmith: 'låssmed', moving_company: 'flyttfirma',
  lawyer: 'advokatbyrå', accounting: 'redovisningsbyrå', insurance_agency: 'försäkringsbolag',
  bank: 'bank', travel_agency: 'resebyrå',
  car_repair: 'bilverkstad', car_dealer: 'bilhandlare', gas_station: 'bensinstation', car_wash: 'biltvätt',
  florist: 'blomsterhandel', clothing_store: 'klädbutik', electronics_store: 'elektronikbutik',
  supermarket: 'matbutik', grocery_store: 'matbutik', grocery_or_supermarket: 'matbutik',
  furniture_store: 'möbelbutik', hardware_store: 'järnaffär', jewelry_store: 'guldsmed', shoe_store: 'skobutik',
  book_store: 'bokhandel', pet_store: 'djuraffär', bicycle_store: 'cykelaffär', liquor_store: 'systembolagsbutik',
  store: 'butik', school: 'skola', preschool: 'förskola', child_care_agency: 'barnomsorg',
}

/**
 * Mappar en enskild Places `type`/`primaryType`-sträng till svensk bransch.
 * Suffix-reglerna fångar Places undertyper som `scandinavian_restaurant`,
 * `japanese_restaurant` osv. som saknas explicit i tabellen ovan (samma
 * mönster som `schemaTypeFor()` i masterSchema.ts). `null` = ingen träff.
 */
export function mapPlacesType(type: string | null | undefined): string | null {
  if (!type) return null
  const t = type.toLowerCase()
  if (PLACES_TYPE_MAP[t]) return PLACES_TYPE_MAP[t]
  if (t.endsWith('_restaurant')) return 'restaurang'
  if (t.endsWith('_store')) return 'butik'
  return null
}

/**
 * Härleder bransch (Audit #10): `primaryType` först (den mest träffsäkra
 * Places-signalen), sedan första träffande typen i `types`, sedan sista
 * segmentet i sidans `<title>` (titelns FÖRSTA segment är oftast
 * företagsnamnet — se companyName — så bara det sista är en säker gissning,
 * och bara om det inte är identiskt med companyName), annars en neutral
 * fallback. bransch får ALDRIG bli identisk med companyName.
 */
export function deriveBransch(params: {
  primaryType?: string | null
  types?: string[] | null
  title?: string | null
  companyName: string
}): string {
  const { primaryType, types, title, companyName } = params
  const placeTypes = types ?? []
  const titleSegments = (title ?? '')
    .split(/\s*[\|–\-·]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const titleLastSegment = titleSegments.length ? titleSegments[titleSegments.length - 1] : null

  return (
    mapPlacesType(primaryType) ||
    placeTypes.map(mapPlacesType).find(Boolean) ||
    (titleLastSegment && titleLastSegment !== companyName ? titleLastSegment : null) ||
    'företag'
  )
}
