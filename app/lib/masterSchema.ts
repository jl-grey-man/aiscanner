/**
 * masterSchema.ts — ETT kanoniskt huvudschema per premiumrapport (Audit #7)
 *
 * Tidigare genererade Report Writer ett eget LocalBusiness-block för varje
 * schema-relaterad check (localBusiness, schemaAny, localSubtype, jsonLd,
 * aiMentions …) → kunden fick nästan samma kod 3–5 gånger (0,7–0,94 likhet).
 *
 * Nu:
 *   1. `buildMasterSchema()` bygger huvudschemat DETERMINISTISKT, enbart av
 *      verifierad data (Google Places + sajtens egna sameAs). Ingen LLM → inga
 *      påhittade värden, inget aggregateRating.
 *   2. `pickMasterOwner()` väljer den mest relevanta schema-checken som äger
 *      kodblocket (localBusiness → localSubtype → schemaAny → jsonLd).
 *   3. `applyMasterSchema()` lägger huvudschemat på ägarkortet; övriga checks
 *      vars lösning täcks av huvudschemat får `codeRef` = ägarens nyckel och
 *      bara sin DELTA som kod (`extractSchemaDelta()`), eller ingen kod alls.
 *   4. `dedupeCodeExamples()` är ett generellt säkerhetsnät: kodblock som är
 *      för lika (normaliserad token-likhet ≥ 0,6) visas bara en gång.
 */

import type { CheckKey } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** En tidpunkt i Places API (New) `regularOpeningHours.periods` — day 0 = söndag. */
export interface OpeningPeriodPoint {
  day: number
  hour: number
  minute?: number
}

export interface OpeningPeriod {
  open: OpeningPeriodPoint
  close?: OpeningPeriodPoint | null
}

/** Verifierad företagsdata som huvudschemat får byggas av (delmängd av BusinessMeta). */
export interface MasterSchemaInput {
  companyName: string
  url: string
  city: string | null
  phone?: string
  streetAddress?: string | null
  postalCode?: string | null
  formattedAddress?: string | null
  email?: string | null
  latitude?: number | null
  longitude?: number | null
  placeId?: string | null
  primaryType?: string | null
  openingPeriods?: OpeningPeriod[] | null
  schemaTypes?: string[]
  socialLinks?: string[]
}

export interface MasterSchema {
  /** schema.org-typ, t.ex. "HairSalon". */
  type: string
  /** Stabilt @id som andra block kan referera till. */
  id: string
  /** JSON-LD-objektet. */
  data: Record<string, unknown>
  /** Färdigt kodblock att kopiera (`<script type="application/ld+json">`). */
  code: string
}

/** Det som dedup/delta behöver av ett rikt check-resultat. */
export interface CodeCarrier {
  richCodeExample: string | null
  codeRef?: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Kodblock med minst så här hög normaliserad likhet räknas som dubbletter. */
export const DUPLICATE_THRESHOLD = 0.6

/** Checks som kan äga huvudschemat, i relevansordning. */
export const MASTER_OWNER_PRIORITY: CheckKey[] = ['localBusiness', 'localSubtype', 'schemaAny', 'jsonLd']

/**
 * Checks vars kodlösning (helt eller delvis) täcks av huvudschemat.
 * 'always' = alltid täckt. En lista = täckt bara om huvudschemat faktiskt
 * innehåller minst en av egenskaperna (annars får checken ingen hänvisning).
 */
const MASTER_COVERAGE: Partial<Record<CheckKey, 'always' | readonly string[]>> = {
  localBusiness: 'always',
  localSubtype: 'always',
  schemaAny: 'always',
  jsonLd: 'always',
  aiMentions: 'always',
  socialPresence: ['sameAs'],
  gbpData: ['sameAs'],
  openingHours: ['openingHoursSpecification'],
  napConsistency: ['address', 'telephone'],
  phone: ['telephone'],
  contactInfo: ['telephone', 'email', 'address'],
}

/** Google Places-typ → schema.org LocalBusiness-subtyp. */
const PLACES_TO_SCHEMA_TYPE: Record<string, string> = {
  restaurant: 'Restaurant', meal_takeaway: 'Restaurant', meal_delivery: 'Restaurant',
  fast_food_restaurant: 'FastFoodRestaurant',
  cafe: 'CafeOrCoffeeShop', coffee_shop: 'CafeOrCoffeeShop',
  bakery: 'Bakery', ice_cream_shop: 'IceCreamShop',
  bar: 'BarOrPub', pub: 'BarOrPub', wine_bar: 'BarOrPub', night_club: 'NightClub',
  brewery: 'Brewery', winery: 'Winery',
  hair_salon: 'HairSalon', hair_care: 'HairSalon', barber_shop: 'HairSalon',
  beauty_salon: 'BeautySalon', nail_salon: 'NailSalon', spa: 'DaySpa', tattoo_parlor: 'TattooParlor',
  gym: 'ExerciseGym', fitness_center: 'ExerciseGym',
  dentist: 'Dentist', dental_clinic: 'Dentist', doctor: 'Physician', hospital: 'Hospital',
  pharmacy: 'Pharmacy', drugstore: 'Pharmacy', veterinary_care: 'VeterinaryCare', optician: 'Optician',
  plumber: 'Plumber', electrician: 'Electrician', roofing_contractor: 'RoofingContractor',
  general_contractor: 'GeneralContractor', painter: 'HousePainter', locksmith: 'Locksmith',
  moving_company: 'MovingCompany',
  lawyer: 'Attorney', accounting: 'AccountingService', insurance_agency: 'InsuranceAgency',
  bank: 'BankOrCreditUnion', real_estate_agency: 'RealEstateAgent', travel_agency: 'TravelAgency',
  car_repair: 'AutoRepair', car_dealer: 'AutoDealer', gas_station: 'GasStation', car_wash: 'AutoWash',
  lodging: 'LodgingBusiness', hotel: 'Hotel', hostel: 'Hostel', motel: 'Motel',
  bed_and_breakfast: 'BedAndBreakfast', campground: 'Campground',
  florist: 'Florist', clothing_store: 'ClothingStore', electronics_store: 'ElectronicsStore',
  supermarket: 'GroceryStore', grocery_store: 'GroceryStore', furniture_store: 'FurnitureStore',
  hardware_store: 'HardwareStore', jewelry_store: 'JewelryStore', shoe_store: 'ShoeStore',
  book_store: 'BookStore', pet_store: 'PetStore', bicycle_store: 'BikeStore', liquor_store: 'LiquorStore',
  store: 'Store',
  school: 'School', preschool: 'Preschool', child_care_agency: 'ChildCare',
}

const BUSINESS_SCHEMA_TYPES = new Set<string>([
  'LocalBusiness', 'Organization', 'FoodEstablishment', 'HealthAndBeautyBusiness',
  'HomeAndConstructionBusiness', 'ProfessionalService', 'MedicalBusiness', 'AutomotiveBusiness',
  ...Object.values(PLACES_TO_SCHEMA_TYPE),
])

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const JSON_LD_SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

// ---------------------------------------------------------------------------
// Building the master schema
// ---------------------------------------------------------------------------

/** Välj schema.org-typ: Places primaryType → sajtens befintliga subtyp → LocalBusiness. */
export function schemaTypeFor(primaryType?: string | null, schemaTypes: string[] = []): string {
  const pt = (primaryType ?? '').toLowerCase()
  if (PLACES_TO_SCHEMA_TYPE[pt]) return PLACES_TO_SCHEMA_TYPE[pt]
  if (pt.endsWith('_restaurant')) return 'Restaurant'
  if (pt.endsWith('_store')) return 'Store'
  const existing = schemaTypes.find(t => BUSINESS_SCHEMA_TYPES.has(t) && t !== 'LocalBusiness' && t !== 'Organization')
  return existing ?? 'LocalBusiness'
}

/** "060-61 45 00" → "+46 60 61 45 00". Okänt format lämnas orört. */
export function toInternationalPhone(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('+')) return t
  if (/^[\d\s\-()]+$/.test(t) && /^\(?0[1-9]/.test(t)) {
    return '+46 ' + t.replace(/^\(?0/, '').replace(/[-()]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return t
}

function hhmm(p: OpeningPeriodPoint): string {
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')}`
}

function isValidPoint(p: unknown): p is OpeningPeriodPoint {
  if (!p || typeof p !== 'object') return false
  const { day, hour, minute } = p as Record<string, unknown>
  return Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6 &&
    Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) <= 24 &&
    (minute === undefined || (Number.isInteger(minute) && (minute as number) >= 0 && (minute as number) < 60))
}

/**
 * Places `regularOpeningHours.periods` → schema.org openingHoursSpecification.
 * Dagar med samma tider grupperas. Returnerar null om perioderna saknas eller
 * är ogiltiga — hellre inga öppettider än fel öppettider.
 */
export function openingHoursSpecification(periods?: OpeningPeriod[] | null): Record<string, unknown>[] | null {
  if (!Array.isArray(periods) || periods.length === 0) return null

  // Dygnet runt: en period som öppnar söndag 00:00 och saknar close.
  if (periods.length === 1 && !periods[0]?.close && isValidPoint(periods[0]?.open) &&
      periods[0].open.day === 0 && periods[0].open.hour === 0 && (periods[0].open.minute ?? 0) === 0) {
    return [{ '@type': 'OpeningHoursSpecification', dayOfWeek: [...DAY_NAMES.slice(1), DAY_NAMES[0]], opens: '00:00', closes: '23:59' }]
  }

  const groups = new Map<string, { opens: string; closes: string; days: number[] }>()
  for (const period of periods) {
    if (!isValidPoint(period?.open) || !isValidPoint(period?.close)) return null
    const opens = hhmm(period.open)
    const closes = hhmm(period.close)
    const groupKey = `${opens}-${closes}`
    const group = groups.get(groupKey) ?? { opens, closes, days: [] }
    if (!group.days.includes(period.open.day)) group.days.push(period.open.day)
    groups.set(groupKey, group)
  }

  const mondayFirst = (d: number) => (d + 6) % 7
  return [...groups.values()]
    .map(g => ({ ...g, days: g.days.sort((a, b) => mondayFirst(a) - mondayFirst(b)) }))
    .sort((a, b) => mondayFirst(a.days[0]) - mondayFirst(b.days[0]) || a.opens.localeCompare(b.opens))
    .map(g => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: g.days.map(d => DAY_NAMES[d]),
      opens: g.opens,
      closes: g.closes,
    }))
}

function wrapJsonLd(value: unknown): string {
  return `<script type="application/ld+json">\n${JSON.stringify(value, null, 2)}\n</script>`
}

/**
 * Bygger huvudschemat av ENBART verifierad data. Fält vars data saknas utelämnas.
 * Returnerar null om företagsnamn eller giltig URL saknas.
 */
export function buildMasterSchema(input: MasterSchemaInput): MasterSchema | null {
  const name = input.companyName?.trim()
  if (!name) return null
  let site: URL
  try {
    site = new URL(input.url)
  } catch {
    return null
  }

  const type = schemaTypeFor(input.primaryType, input.schemaTypes ?? [])
  const id = `${site.origin}/#localbusiness`
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': id,
    name,
    url: site.href,
  }

  if (input.phone?.trim()) data.telephone = toInternationalPhone(input.phone)
  if (input.email?.trim()) data.email = input.email.trim()

  const formatted = input.formattedAddress ?? ''
  const localityFromPlaces = formatted.match(/\d{3}\s?\d{2}\s+([^,\d]+?)\s*(?:,|$)/)?.[1]?.trim()
  const locality = localityFromPlaces || (formatted ? null : input.city?.trim() || null)
  const isSwedish = /\b(Sverige|Sweden)\b/i.test(formatted) || !!input.postalCode
  if (input.streetAddress || input.postalCode || locality) {
    const address: Record<string, unknown> = { '@type': 'PostalAddress' }
    if (input.streetAddress) address.streetAddress = input.streetAddress
    if (input.postalCode) address.postalCode = input.postalCode
    if (locality) address.addressLocality = locality
    if (isSwedish) address.addressCountry = 'SE'
    data.address = address
  }

  if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
    data.geo = { '@type': 'GeoCoordinates', latitude: input.latitude, longitude: input.longitude }
  }

  const hours = openingHoursSpecification(input.openingPeriods)
  if (hours) data.openingHoursSpecification = hours

  const sameAs = [
    ...(input.placeId ? [`https://www.google.com/maps/place/?q=place_id:${input.placeId}`] : []),
    ...(input.socialLinks ?? []).filter(l => /^https?:\/\//i.test(l)),
  ]
  const uniqueSameAs = [...new Set(sameAs)]
  if (uniqueSameAs.length > 0) data.sameAs = uniqueSameAs

  return { type, id, data, code: wrapJsonLd(data) }
}

// ---------------------------------------------------------------------------
// Ownership & coverage
// ---------------------------------------------------------------------------

interface OwnerCandidate {
  key: string
  status: string
  fix: string | null
}

/**
 * Den mest relevanta schema-checken som ska äga huvudschemat. Kräver bad/warning
 * och en fix-text (annars renderas inget lösningskort att länka till).
 */
export function pickMasterOwner(checks: OwnerCandidate[]): CheckKey | null {
  for (const key of MASTER_OWNER_PRIORITY) {
    const c = checks.find(ch => ch.key === key)
    if (c && (c.status === 'bad' || c.status === 'warning') && c.fix !== null) return key
  }
  return null
}

/** Täcks checkens kodlösning (helt eller delvis) av just det här huvudschemat? */
export function referencesMaster(key: string, master: MasterSchema): boolean {
  const coverage = MASTER_COVERAGE[key as CheckKey]
  if (!coverage) return false
  if (coverage === 'always') return true
  return coverage.some(prop => prop in master.data)
}

/** Nycklar (bland `keys`) som ska hänvisa till huvudschemat i stället för att upprepa det. */
export function referencingKeys(keys: string[], ownerKey: string, master: MasterSchema): string[] {
  return keys.filter(k => k !== ownerKey && referencesMaster(k, master))
}

// ---------------------------------------------------------------------------
// Delta extraction
// ---------------------------------------------------------------------------

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

function isBusinessNode(node: Record<string, unknown>, master: MasterSchema): boolean {
  if (node['@id'] === master.id) return true
  return typesOf(node).some(t => t === master.type || BUSINESS_SCHEMA_TYPES.has(t))
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Reducerar ett JSON-LD-värde mot huvudschemat:
 *  - företagsnoder (samma typ/@id) behåller bara egenskaper som INTE finns i huvudschemat,
 *    med huvudschemats @type/@id så de slås ihop; inget kvar → borttagen
 *  - nästlade företagsobjekt (t.ex. "provider") ersätts med {"@id": ...}
 *  - övriga noder (Service, FAQPage …) lämnas orörda
 */
function reduceJsonLdValue(value: unknown, master: MasterSchema, topLevel: boolean): unknown | null {
  if (Array.isArray(value)) {
    const reduced = value.map(v => reduceJsonLdValue(v, master, topLevel)).filter(v => v !== null)
    return reduced.length > 0 ? reduced : null
  }
  if (!isObject(value)) return value

  if (Array.isArray(value['@graph'])) {
    const graph = (value['@graph'] as unknown[]).map(v => reduceJsonLdValue(v, master, true)).filter(v => v !== null)
    if (graph.length === 0) return null
    return { ...value, '@graph': graph }
  }

  if (isBusinessNode(value, master)) {
    if (!topLevel) return { '@id': master.id }
    const extra = Object.entries(value).filter(([k]) => !['@context', '@type', '@id'].includes(k) && !(k in master.data))
    if (extra.length === 0) return null
    return {
      ...('@context' in value ? { '@context': value['@context'] } : {}),
      '@type': master.type,
      '@id': master.id,
      ...Object.fromEntries(extra),
    }
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = isObject(v) || Array.isArray(v) ? reduceJsonLdValue(v, master, false) ?? v : v
  }
  return out
}

/** undefined = gick inte att tolka som JSON. */
function reduceJsonText(text: string, master: MasterSchema): unknown | null | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  return reduceJsonLdValue(parsed, master, true)
}

/**
 * Tar fram det en checks kodexempel tillför UTÖVER huvudschemat.
 * Returnerar null om inget substantiellt återstår eller om resten ändå
 * är nästan samma sak som huvudschemat.
 */
export function extractSchemaDelta(code: string | null, master: MasterSchema): string | null {
  if (!code || !code.trim()) return null

  let result: string
  JSON_LD_SCRIPT_RE.lastIndex = 0
  if (JSON_LD_SCRIPT_RE.test(code)) {
    JSON_LD_SCRIPT_RE.lastIndex = 0
    result = code.replace(JSON_LD_SCRIPT_RE, (whole, inner: string) => {
      const reduced = reduceJsonText(inner.trim(), master)
      if (reduced === undefined) return whole // otolkbart — likhetskontrollen nedan avgör
      return reduced === null ? '' : wrapJsonLd(reduced)
    })
  } else if (/^\s*[\[{]/.test(code)) {
    const reduced = reduceJsonText(code.trim(), master)
    result = reduced === undefined ? code : reduced === null ? '' : JSON.stringify(reduced, null, 2)
  } else {
    result = code
  }

  result = result.replace(/\n{3,}/g, '\n\n').trim()
  const substance = result.replace(/<!--[\s\S]*?-->/g, '').replace(/\s/g, '')
  if (substance.length < 10) return null
  if (codeSimilarity(result, master.code) >= DUPLICATE_THRESHOLD) return null
  return result
}

/**
 * Lägger huvudschemat på ägarkortet och gör om övriga täckta checks till
 * hänvisning (`codeRef`) + delta. Muterar `rich`.
 */
export function applyMasterSchema<T extends CodeCarrier>(
  rich: Record<string, T>,
  ownerKey: string,
  master: MasterSchema,
): void {
  const owner = rich[ownerKey]
  if (!owner) return
  owner.richCodeExample = master.code
  delete owner.codeRef
  for (const key of referencingKeys(Object.keys(rich), ownerKey, master)) {
    const data = rich[key]
    data.codeRef = ownerKey
    data.richCodeExample = extractSchemaDelta(data.richCodeExample, master)
  }
}

// ---------------------------------------------------------------------------
// Similarity & generic dedup
// ---------------------------------------------------------------------------

/**
 * Normaliserar kod till tokens: gemener, inga citattecken, och JSON-LD-omslaget
 * (`<script type="application/ld+json">`, `"@context": "https://schema.org"`) räknas
 * inte — två olika små block ska inte bli "lika" bara för att de delar omslaget.
 */
function similarityTokens(code: string): string[] {
  const stripped = code
    .replace(/<script[^>]*>|<\/script>/gi, ' ')
    .replace(/"@context"\s*:\s*"https?:\/\/schema\.org\/?"\s*,?/gi, ' ')
    .replace(/["'`]/g, ' ')
    .toLowerCase()
  return stripped.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? []
}

/** Antal tokens i matchande block (Ratcliff/Obershelp: längsta gemensamma sekvens, rekursivt). */
function matchingTokenCount(a: string[], b: string[]): number {
  let total = 0
  const stack: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (stack.length > 0) {
    const [aLo, aHi, bLo, bHi] = stack.pop()!
    if (aLo >= aHi || bLo >= bHi) continue
    let bestLen = 0, bestA = aLo, bestB = bLo
    let prev = new Int32Array(bHi - bLo + 1)
    let curr = new Int32Array(bHi - bLo + 1)
    for (let i = aLo; i < aHi; i++) {
      for (let j = bLo; j < bHi; j++) {
        const len = a[i] === b[j] ? prev[j - bLo] + 1 : 0
        curr[j - bLo + 1] = len
        if (len > bestLen) {
          bestLen = len
          bestA = i - len + 1
          bestB = j - len + 1
        }
      }
      ;[prev, curr] = [curr, prev]
      curr.fill(0)
    }
    if (bestLen === 0) continue
    total += bestLen
    stack.push([aLo, bestA, bLo, bestB], [bestA + bestLen, aHi, bestB + bestLen, bHi])
  }
  return total
}

/** Normaliserad likhet 0–1 mellan två kodblock (tålig mot whitespace, citattecken och JSON-LD-omslag). */
export function codeSimilarity(a: string, b: string): number {
  const ta = similarityTokens(a)
  const tb = similarityTokens(b)
  if (ta.length + tb.length === 0) return 1
  return (2 * matchingTokenCount(ta, tb)) / (ta.length + tb.length)
}

export interface DedupeOptions {
  /** Nyckel som alltid behåller sin kod och jämförs först (huvudschemats ägare). */
  first?: string | null
  /** Nycklar vars kort renderas och därför får vara mål för en hänvisning. Default: alla. */
  referenceable?: Set<string>
  threshold?: number
  /**
   * Huvudschemat, om `first` äger ett. Textlikhet räcker INTE för att hänvisa till
   * ägaren — det kräver att MASTER_COVERAGE faktiskt listar checken (`referencesMaster()`).
   * Utan detta kan t.ex. ett Service-schema (delar företagsnamn/adress/telefon med
   * LocalBusiness-schemat) felaktigt länkas till huvudschemat trots att det inte
   * innehåller någon tjänst alls — se Audit sep 2026.
   */
  master?: MasterSchema | null
}

/**
 * Generellt säkerhetsnät mot upprepad kod: går igenom kodblocken i rapportordning
 * (ev. `first` först, sedan CHECK_REGISTRY-ordning). Ett block som är för likt ett
 * tidigare behållet block tas bort och får `codeRef` till det (om det inte redan
 * hänvisar någonstans) — MEN en hänvisning till huvudschemats ägare (`first`) kräver
 * dessutom att MASTER_COVERAGE täcker checken; annars behålls blockets egen kod.
 * Muterar och returnerar `rich`.
 */
export function dedupeCodeExamples<T extends CodeCarrier>(
  rich: Record<string, T>,
  options: DedupeOptions = {},
): Record<string, T> {
  const threshold = options.threshold ?? DUPLICATE_THRESHOLD
  const registryIndex = new Map(CHECK_REGISTRY.map((e, i) => [e.key as string, i]))
  const rank = (key: string) => (key === options.first ? -1 : registryIndex.get(key) ?? Number.MAX_SAFE_INTEGER)
  const keys = Object.keys(rich).sort((a, b) => rank(a) - rank(b))

  const kept: { key: string; code: string }[] = []
  for (const key of keys) {
    const data = rich[key]
    const code = data.richCodeExample
    if (!code || !code.trim()) continue
    const duplicateOf = kept.find(k => {
      if (codeSimilarity(k.code, code) < threshold) return false
      if (k.key === options.first && options.master && !referencesMaster(key, options.master)) return false
      return true
    })
    if (duplicateOf) {
      data.richCodeExample = null
      if (!data.codeRef) data.codeRef = duplicateOf.key
    } else if (!options.referenceable || options.referenceable.has(key)) {
      kept.push({ key, code })
    }
  }
  return rich
}
