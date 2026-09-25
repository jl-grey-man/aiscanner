/**
 * placesContent.ts — Google Places-villkoren: inget Places-innehåll lagras, bara place_id.
 *
 * Villkoren (verifierade mot primärkälla 2026-09-14):
 *  - developers.google.com/maps/documentation/places/web-service/policies:
 *    "You must not pre-fetch, cache, or store Places API content beyond the allowed
 *    exceptions, although the place_id is exempt from caching restrictions."
 *  - Service Specific Terms 14.3: lat/lng får cachas i max 30 dagar (vi lagrar dem inte alls).
 *
 * All Places-data (namn, adress, telefon, betyg, antal recensioner, öppettider,
 * recensionstexter, types, konkurrenters namn/betyg/webbplats) visas därför bara färsk:
 *  - scan_cache (scanCache.ts) sparar insamlingsfasen UTAN Places-delar + place_id;
 *    paid-träffen hämtar Place Details + Nearby Search igen och bygger om Places-
 *    beroende checks deterministiskt (`derivePlacesParts`, buildCheckResults).
 *  - checkouts (checkoutDb.ts) sparar premiumrapporten via `stripPlacesContent()`;
 *    status-/finalize-routen kör `rehydrateStoredReport()` innan svaret.
 *
 * GRÅZON (medvetet beslut, Jens informerad): AI-genererad text — richRelevance,
 * richSteps, AI-skrivna kodexempel, syntesen, recensionsinsikternas beröm/klagomål och
 * AI-testets svar/faktagranskning — sparas som den är, fast den kan innehålla
 * adress/telefon/betyg som modellen fick i prompten.
 */

import { createHash } from 'node:crypto'
import type { CheckKey, CheckResult, GBPData, PlacesRef, ScanResult } from './scanResult'
import { buildGbpDataCheck, buildOpeningHoursCheck, formatCompetitorsFinding } from './checkBuilder'
import { getGenericFix } from './genericFixes'
import { fillTemplate } from './templateFill'
import { buildMasterSchema, pickMasterOwner } from './masterSchema'
import type { OpeningPeriod } from './masterSchema'
import { deriveBransch } from './bransch'
import { extractReviewTexts } from './reviewInsights'
import { stripTrackingFromWebsite } from './competitorComparison'
import { findBusinessByUrl, findNearbyCompetitors, getCompetitorDetails, getPlaceDetails } from './places'
import type { NearbyCompetitor } from './places'

/** Rå Places-plats (Place Details eller Text Search) — otypad, precis som API-svaret. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlaceData = Record<string, any>

// ---------------------------------------------------------------------------
// Härledning ur Places-data (delas av scan-flödet och ombyggnaden vid läsning)
// ---------------------------------------------------------------------------

/** Resultatet av analyzeReviewReplies() (Audit #3: alltid notMeasured). */
export interface ReviewReplyAnalysis {
  total: number
  status: 'notMeasured'
  finding: string
  fix: string
  sampleNote: string
}

/**
 * Audit #3: Google Places API (New) Review-objektet har INGET fält för ägarsvar
 * (verifierat mot officiell dokumentation:
 * https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#Review
 * — Review har name/text/originalText/rating/authorAttribution/publishTime/
 * flagContentUri/googleMapsUri/visitDate/relativePublishTimeDescription, inget
 * "reviewReply"/"ownerResponse"). En svarsfrekvens går därför ALDRIG att mäta via
 * detta API — checken blir alltid notMeasured, aldrig ett påstått 0 %.
 */
export function analyzeReviewReplies(reviews: unknown[], totalReviewCount?: number | null): ReviewReplyAnalysis {
  const list = Array.isArray(reviews) ? reviews : []
  // Sanity-check: if knownTotal < reviews.length the reported total is unreliable — never
  // emit "X av totalt Y" where Y < X, as that is self-contradictory.
  const knownTotal = (totalReviewCount != null && totalReviewCount >= list.length)
    ? totalReviewCount
    : null
  const sampleNote = list.length > 0 && knownTotal !== null && knownTotal > list.length
    ? `Baserat på ett stickprov av ${list.length} recensioner av totalt ${knownTotal} (Google Places API-gränsen).`
    : ''

  if (list.length === 0) {
    return {
      total: 0,
      status: 'notMeasured',
      finding: 'Inga recensioner tillgängliga för analys.',
      fix: 'Be kunder lämna recensioner på Google.',
      sampleNote,
    }
  }

  return {
    total: list.length,
    status: 'notMeasured',
    finding: 'Google tillhandahåller inte ägarsvar via API:t — kontrollera i Google Business Profile.',
    fix: 'Logga in på Google Business Profile (business.google.com) och se där hur stor andel av recensionerna som fått svar.',
    sampleNote,
  }
}

/** Företagsnamn: Places displayName, annars första segmentet i sajtens <title>. */
export function deriveCompanyName(place: PlaceData | null | undefined, title: string | null | undefined): string {
  return place?.displayName?.text || title?.split(/\s*[\|–\-]\s*/)[0]?.trim() || ''
}

/**
 * Allt i ScanContext som är Places-innehåll eller härlett ur det. Byggs vid varje
 * scan och vid varje cacheträff av FÄRSK Places-data — lagras aldrig.
 * `details` = Place Details-svaret (recensioner finns bara där), `place` = details
 * eller Text Search-träffen om Details misslyckades.
 */
export function derivePlacesParts(input: {
  place: PlaceData | null
  details: PlaceData | null
  title: string | null
}): { companyName: string; bransch: string; reviews: unknown[]; reviewReplyResult: ReviewReplyAnalysis } {
  const companyName = deriveCompanyName(input.place, input.title)
  const bransch = deriveBransch({
    primaryType: input.place?.primaryType ?? null,
    types: input.place?.types || [],
    title: input.title,
    companyName,
  })
  const reviews: unknown[] = Array.isArray(input.details?.reviews) ? input.details!.reviews : []
  return { companyName, bransch, reviews, reviewReplyResult: analyzeReviewReplies(reviews, input.details?.userRatingCount) }
}

/** Places-fakta till Report Writer, huvudschema och kodmallar (samma härledning vid scan och vid läsning). */
export function placeFacts(place: PlaceData | null | undefined): {
  phone: string | undefined
  streetAddress: string | null
  postalCode: string | null
  formattedAddress: string | null
  latitude: number | null
  longitude: number | null
  placeId: string | null
  primaryType: string | null
  googleRating: number | null
  reviewCount: number | null
  weekdayHours: string[] | null
  openingPeriods: OpeningPeriod[] | null
} {
  // "Gatuadress 12, 411 36 Göteborg" → streetAddress="Gatuadress 12", postalCode="411 36"
  const formattedAddress: string | undefined = place?.formattedAddress
  const addrMatch = formattedAddress?.match(/^(.+?),\s*(\d{3}\s?\d{2})\s+/)
  return {
    phone: place?.nationalPhoneNumber || undefined,
    streetAddress: addrMatch?.[1]?.trim() || null,
    postalCode: addrMatch?.[2]?.trim() || null,
    formattedAddress: formattedAddress || null,
    latitude: place?.location?.latitude ?? null,
    longitude: place?.location?.longitude ?? null,
    placeId: place?.id ?? null,
    primaryType: place?.primaryType ?? null,
    googleRating: place?.rating ?? null,
    reviewCount: place?.userRatingCount ?? null,
    weekdayHours: place?.regularOpeningHours?.weekdayDescriptions ?? null,
    openingPeriods: place?.regularOpeningHours?.periods ?? null,
  }
}

/** ScanResult.gbp ur en Places-plats (null utan plats). */
export function buildGbpData(place: PlaceData | null | undefined): GBPData | null {
  if (!place) return null
  return {
    name: place.displayName?.text,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    address: place.formattedAddress ?? null,
    phone: place.nationalPhoneNumber ?? null,
    websiteUri: place.websiteUri ?? null,
    weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions,
    types: place.types,
    _domainMatch: place._domainMatch,
  }
}

// ---------------------------------------------------------------------------
// Strip — innan en premiumrapport lagras
// ---------------------------------------------------------------------------

/**
 * EXAKT de fält i ScanResult som är Places-innehåll (eller byggs deterministiskt av det)
 * och därför strippas av `stripPlacesContent()` och byggs om av `rehydratePlacesContent()`.
 * place_id (placesRef.placeId, konkurrenternas placeId) lagras — det är undantaget.
 */
export const PLACES_CONTENT_FIELDS = [
  'meta.companyName',
  'meta.bransch',
  'scores.google',
  'scores.googleCount',
  'gbp',
  'reviewReplies.total',
  'reviewReplies.sampleNote',
  'reviewInsights.themes[].quote',
  'reviewInsights.themes[].authorName',
  'reviewInsights.themes[].authorUri',
  'competitorComparison.competitors[].name',
  'competitorComparison.competitors[].website',
  'competitorComparison.competitors[].rating',
  'competitorComparison.competitors[].reviewCount',
  'checks[openingHours].finding + data (när öppettiderna kommer från Google Business Profile)',
  'checks[reviewReplies].data',
  'checks[gbpData].finding + data',
  'checks[competitors].finding + data',
  'checks[].genericCodeTemplate (ifylld med företagsnamn/adress/telefon)',
  'checks[huvudschemats ägare].richCodeExample (huvudschemat byggs av Places-data)',
] as const

export const PLACES_STRIP_VERSION = 1

/** Det som behövs för att bygga om de strippade fälten — inget av det är Places-innehåll. */
export interface StrippedPlacesRefs {
  v: typeof PLACES_STRIP_VERSION
  /** Rapporten sparades före placesRef fanns men hade GBP-data → place_id slås upp via Text Search vid läsning. */
  lookupByUrl: boolean
  /** Checks vars finding/data strippades. */
  checks: CheckKey[]
  /** place_id för konkurrenterna i check #36, i ursprunglig ordning. */
  competitorPlaceIds: string[]
  /** Checken vars richCodeExample var huvudschemat (strippat, byggs om). */
  masterSchemaOwner: CheckKey | null
  /** Per recensionstema: SHA-256 + längd av det ordagranna citatet (texten lagras inte). */
  reviewQuotes: Array<{ sha256: string; length: number }>
}

export type StoredReport = ScanResult & { placesStripped: StrippedPlacesRefs }

export function isStoredReport(value: unknown): value is StoredReport {
  const refs = (value as { placesStripped?: { v?: unknown } } | null)?.placesStripped
  return !!refs && typeof refs === 'object' && refs.v === PLACES_STRIP_VERSION
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Sajtens egna uppgifter — ur placesRef, eller ur checks för rapporter sparade innan placesRef fanns. */
function siteFactsOf(report: ScanResult): PlacesRef['site'] {
  if (report.placesRef?.site) return report.placesRef.site
  const data = (key: CheckKey) => report.checks?.find(c => c.key === key)?.data ?? null
  const title = data('title')?.title
  const phones = data('phone')?.phones
  const schemaTypes = data('schemaAny')?.schemaTypes
  return {
    title: typeof title === 'string' ? title : null,
    phone: Array.isArray(phones) && typeof phones[0] === 'string' ? phones[0] : null,
    email: null,
    schemaTypes: Array.isArray(schemaTypes) ? schemaTypes.filter((t): t is string => typeof t === 'string') : [],
    socialLinks: [],
  }
}

/** Är koden huvudschemat (buildMasterSchema) för den här sajten — inte AI-skriven kod? */
function isMasterSchemaCode(code: unknown, url: string | undefined): boolean {
  if (typeof code !== 'string' || !url) return false
  const m = code.trim().match(/^<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*)<\/script>$/i)
  if (!m || /<script/i.test(m[1])) return false
  let origin: string
  try { origin = new URL(url).origin } catch { return false }
  try {
    const data = JSON.parse(m[1])
    return isRecord(data) && data['@id'] === `${origin}/#localbusiness` && typeof data.name === 'string'
  } catch {
    return false
  }
}

/**
 * Returnerar en kopia av premiumrapporten utan Places-innehåll (PLACES_CONTENT_FIELDS),
 * med `placesStripped`-referenser för ombyggnaden. Ren funktion, idempotent, tål
 * ofullständiga objekt (rör bara fält som finns). Status, poäng och AI-text rörs inte.
 */
export function stripPlacesContent(result: ScanResult): StoredReport {
  if (isStoredReport(result)) return JSON.parse(JSON.stringify(result))
  const out = JSON.parse(JSON.stringify(result)) as ScanResult
  const refs: StrippedPlacesRefs = {
    v: PLACES_STRIP_VERSION,
    lookupByUrl: !out.placesRef && out.gbp != null,
    checks: [],
    competitorPlaceIds: [],
    masterSchemaOwner: null,
    reviewQuotes: [],
  }

  if (isRecord(out.meta)) {
    if ('companyName' in out.meta) out.meta.companyName = ''
    if ('bransch' in out.meta) out.meta.bransch = ''
  }
  if (isRecord(out.scores)) {
    if ('google' in out.scores) out.scores.google = null
    if ('googleCount' in out.scores) out.scores.googleCount = null
  }
  if ('gbp' in out) out.gbp = null
  if (isRecord(out.reviewReplies)) {
    if ('total' in out.reviewReplies) out.reviewReplies.total = 0
    if ('sampleNote' in out.reviewReplies) out.reviewReplies.sampleNote = ''
  }

  const checks: CheckResult[] = Array.isArray(out.checks) ? out.checks : []
  const competitorNameToId = new Map<string, string>()

  for (const c of checks) {
    if (!isRecord(c)) continue
    switch (c.key) {
      case 'openingHours':
        if (Array.isArray(c.data?.weekdayDescriptions)) {
          c.finding = ''
          c.data = null
          refs.checks.push(c.key)
        }
        break
      case 'reviewReplies':
        if (c.data) {
          c.data = null
          refs.checks.push(c.key)
        }
        break
      case 'gbpData':
        if (c.data) {
          c.finding = ''
          c.data = null
          refs.checks.push(c.key)
        }
        break
      case 'competitors': {
        const list = c.data?.competitors
        if (Array.isArray(list)) {
          for (const entry of list) {
            if (isRecord(entry) && typeof entry.placeId === 'string') {
              refs.competitorPlaceIds.push(entry.placeId)
              if (typeof entry.name === 'string') competitorNameToId.set(entry.name, entry.placeId)
            }
          }
          c.finding = ''
          c.data = null
          refs.checks.push(c.key)
        }
        break
      }
    }
    // Paid fyller mallarna med namn/adress/telefon (fillTemplate) → tillbaka till ren mall.
    if (typeof c.genericCodeTemplate === 'string') {
      c.genericCodeTemplate = getGenericFix(c.key, c.status)?.codeTemplate ?? null
    }
  }

  const owner = pickMasterOwner(checks.filter(c => isRecord(c) && (c.status === 'bad' || c.status === 'warning')))
  const ownerCheck = owner ? checks.find(c => c.key === owner) : undefined
  if (ownerCheck && !ownerCheck.codeRef && isMasterSchemaCode(ownerCheck.richCodeExample, out.meta?.url)) {
    ownerCheck.richCodeExample = null
    refs.masterSchemaOwner = ownerCheck.key
  }

  if (isRecord(out.reviewInsights) && Array.isArray(out.reviewInsights.themes)) {
    for (const theme of out.reviewInsights.themes) {
      const quote = typeof theme.quote === 'string' ? theme.quote : ''
      refs.reviewQuotes.push({ sha256: sha256(quote), length: quote.length })
      theme.quote = ''
      // Places policy: författarens namn/profillänk är precis som citatet Places-
      // innehåll — får inte lagras. Rehydrateras från samma recension som citatet
      // (findQuote → author lookup), ingen egen referens behövs.
      if ('authorName' in theme) theme.authorName = null
      if ('authorUri' in theme) theme.authorUri = null
    }
  }

  if (isRecord(out.competitorComparison) && Array.isArray(out.competitorComparison.competitors)) {
    for (const entry of out.competitorComparison.competitors) {
      // Äldre rapporter saknar placeId i jämförelsen → samma namn som i check #36 (Nearby dedupar på namn).
      entry.placeId = entry.placeId ?? competitorNameToId.get(entry.name) ?? null
      entry.name = ''
      entry.website = ''
      entry.rating = null
      entry.reviewCount = null
    }
  }

  return { ...out, placesStripped: refs }
}

// ---------------------------------------------------------------------------
// Rehydrate — när en lagrad premiumrapport läses
// ---------------------------------------------------------------------------

export interface FreshPlaces {
  /** Färsk Place Details (inkl. recensioner och `_domainMatch`), null om ingen/misslyckad. */
  place: PlaceData | null
  /** Färsk konkurrentdata per place_id (saknas = kunde inte hämtas). */
  competitors: Map<string, NearbyCompetitor>
}

export const EMPTY_FRESH_PLACES: FreshPlaces = { place: null, competitors: new Map() }

/** Hittar citatet (via hash + längd) i de färska recensionstexterna, eller null. */
function findQuote(texts: string[], ref: { sha256: string; length: number }): string | null {
  if (ref.length <= 0) return null
  for (const text of texts) {
    for (let start = 0; start + ref.length <= text.length; start++) {
      const candidate = text.slice(start, start + ref.length)
      if (sha256(candidate) === ref.sha256) return candidate
    }
  }
  return null
}

/**
 * Bygger om en lagrad premiumrapport med färsk Places-data. Ren och deterministisk:
 * samma lagrade rapport + samma Places-data ger samma resultat. Status, prioritet och
 * poäng är de uppmätta vid scannet; bara Places-innehållet fylls i. Saknas färsk
 * data (API-fel, plats borttagen) visas en ärlig "kunde inte hämtas"-text.
 */
export function rehydratePlacesContent(stored: StoredReport, fresh: FreshPlaces): ScanResult {
  const out = JSON.parse(JSON.stringify(stored)) as StoredReport
  const refs = out.placesStripped
  delete (out as Partial<StoredReport>).placesStripped
  if (!refs) return out

  const place = fresh.place
  const site = siteFactsOf(out)
  const parts = derivePlacesParts({ place, details: place, title: site.title })
  const facts = placeFacts(place)

  if (isRecord(out.meta)) {
    if ('companyName' in out.meta) out.meta.companyName = parts.companyName
    if ('bransch' in out.meta) out.meta.bransch = parts.bransch
  }
  if (isRecord(out.scores)) {
    if ('google' in out.scores) out.scores.google = facts.googleRating
    if ('googleCount' in out.scores) out.scores.googleCount = facts.reviewCount
  }
  if ('gbp' in out) out.gbp = buildGbpData(place)
  if (isRecord(out.reviewReplies)) {
    if ('total' in out.reviewReplies) out.reviewReplies.total = parts.reviewReplyResult.total
    if ('sampleNote' in out.reviewReplies) out.reviewReplies.sampleNote = parts.reviewReplyResult.sampleNote
  }

  const phone = facts.phone || site.phone || undefined
  const templateMeta = {
    companyName: parts.companyName,
    phone,
    streetAddress: facts.streetAddress,
    city: out.meta?.city ?? null,
    postalCode: facts.postalCode,
    domain: out.meta?.domain ?? null,
    url: out.meta?.url ?? null,
    email: site.email,
  }

  const checks: CheckResult[] = Array.isArray(out.checks) ? out.checks : []
  for (const c of checks) {
    if (!isRecord(c)) continue
    if (refs.checks.includes(c.key)) {
      switch (c.key) {
        case 'openingHours': {
          const oh = buildOpeningHoursCheck(facts.weekdayHours ?? undefined, null)
          const fromGbp = oh.source === 'api' && oh.status === 'ok'
          c.finding = fromGbp ? oh.finding : 'Öppettider från Google Business Profile kunde inte hämtas från Google just nu.'
          c.data = fromGbp ? oh.data : null
          break
        }
        case 'reviewReplies':
          c.data = { total: parts.reviewReplyResult.total, sampleNote: parts.reviewReplyResult.sampleNote }
          break
        case 'gbpData':
          if (place) {
            const gbp = buildGbpDataCheck(place)
            c.finding = gbp.finding
            c.data = gbp.data
          } else {
            c.finding = 'Google Business Profile-data kunde inte hämtas från Google just nu.'
            c.data = null
          }
          break
        case 'competitors': {
          const list = refs.competitorPlaceIds
            .map(id => fresh.competitors.get(id))
            .filter((x): x is NearbyCompetitor => !!x)
          c.finding = list.length > 0
            ? formatCompetitorsFinding(list)
            : 'Närliggande konkurrenter kunde inte hämtas från Google just nu.'
          c.data = list.length > 0 ? { competitors: list } : null
          break
        }
      }
    }
    if (typeof c.genericCodeTemplate === 'string') {
      c.genericCodeTemplate = fillTemplate(c.genericCodeTemplate, templateMeta)
    }
    if (refs.masterSchemaOwner === c.key) {
      c.richCodeExample = buildMasterSchema({
        companyName: parts.companyName,
        url: out.meta?.url ?? '',
        city: out.meta?.city ?? null,
        phone,
        streetAddress: facts.streetAddress,
        postalCode: facts.postalCode,
        formattedAddress: facts.formattedAddress,
        email: site.email,
        latitude: facts.latitude,
        longitude: facts.longitude,
        placeId: facts.placeId,
        primaryType: facts.primaryType,
        openingPeriods: facts.openingPeriods,
        schemaTypes: site.schemaTypes,
        socialLinks: site.socialLinks,
      })?.code ?? null
    }
  }

  if (isRecord(out.reviewInsights) && Array.isArray(out.reviewInsights.themes)) {
    const freshReviews = extractReviewTexts(parts.reviews)
    const texts = freshReviews.map(r => r.text)
    const themes = out.reviewInsights.themes
      .map((theme, i) => {
        const ref = refs.reviewQuotes[i]
        const quote = ref ? findQuote(texts, ref) : null
        if (!quote) return null
        // Places policy: kreditera författaren — hitta vilken färsk recension
        // citatet kom ifrån och sätt dess authorAttribution på temat.
        const author = freshReviews.find(r => r.text.includes(quote))
        return { ...theme, quote, authorName: author?.authorName ?? null, authorUri: author?.authorUri ?? null }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
    const dropped = out.reviewInsights.themes.length - themes.length
    if (dropped > 0) {
      console.warn(`[PlacesRehydrate] ${dropped} recensionstema(n) utelämnas — citatet finns inte bland Googles färska recensioner`)
    }
    out.reviewInsights.themes = themes
    const isEmpty = (list: unknown) => !Array.isArray(list) || list.length === 0
    if (themes.length === 0 && isEmpty(out.reviewInsights.praise) && isEmpty(out.reviewInsights.complaints)) {
      out.reviewInsights = null
    }
  }

  if (isRecord(out.competitorComparison) && Array.isArray(out.competitorComparison.competitors)) {
    for (const entry of out.competitorComparison.competitors) {
      const comp = entry.placeId ? fresh.competitors.get(entry.placeId) : undefined
      entry.name = comp?.name ?? 'Okänd konkurrent'
      entry.website = comp?.websiteUri ? stripTrackingFromWebsite(comp.websiteUri) : ''
      entry.rating = comp?.rating ?? null
      entry.reviewCount = comp?.userRatingCount ?? null
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Färsk hämtning
// ---------------------------------------------------------------------------

export interface PlacesFetchers {
  getPlaceDetails: (placeId: string) => Promise<PlaceData | null>
  getCompetitorDetails: (placeId: string, origin: { latitude?: number; longitude?: number } | null) => Promise<NearbyCompetitor | null>
  findBusinessByUrl: (url: string, cityHint?: string) => Promise<PlaceData | null>
  findNearbyCompetitors: (
    lat: number,
    lng: number,
    primaryType: string | null,
    excludePlaceId: string,
    radiusMeters?: number,
    maxResultCount?: number,
    primaryTypeDisplayName?: string | null,
  ) => Promise<NearbyCompetitor[]>
}

export const defaultPlacesFetchers: PlacesFetchers = {
  getPlaceDetails,
  getCompetitorDetails,
  findBusinessByUrl,
  findNearbyCompetitors,
}

/** Nearby Search för en plats (tom lista utan position/primaryType/id). Kastar aldrig. */
export async function competitorsForPlace(
  place: PlaceData | null,
  fetchers: Pick<PlacesFetchers, 'findNearbyCompetitors'> = defaultPlacesFetchers,
): Promise<NearbyCompetitor[]> {
  const lat = place?.location?.latitude
  const lng = place?.location?.longitude
  const ptype = place?.primaryType
  // Svensk visningstext för platsens typ (t.ex. "Generalentreprenör") — används bara
  // som Text Search-fallback när Nearby Search avvisar typfiltret, se places.ts.
  const ptypeDisplayName = typeof place?.primaryTypeDisplayName?.text === 'string'
    ? place.primaryTypeDisplayName.text
    : null
  if (typeof lat !== 'number' || typeof lng !== 'number' || !ptype || !place?.id) return []
  return fetchers.findNearbyCompetitors(lat, lng, ptype, place.id, undefined, undefined, ptypeDisplayName).catch((err: Error) => {
    console.error('[Places] Nearby competitors failed:', err?.message)
    return []
  })
}

/** Place Details för ett lagrat place_id med vår egen domänflagga påsatt. null vid fel. */
async function freshPlaceDetails(
  placeId: string,
  domainMatch: boolean | null | undefined,
  warning: string | null | undefined,
  fetchers: Pick<PlacesFetchers, 'getPlaceDetails'>,
): Promise<PlaceData | null> {
  const details = await fetchers.getPlaceDetails(placeId).catch(() => null)
  if (!details) return null
  return {
    ...details,
    ...(typeof domainMatch === 'boolean' ? { _domainMatch: domainMatch } : {}),
    ...(warning ? { _warning: warning } : {}),
  }
}

/**
 * Paid-cacheträff (scanCache.ts): färsk Place Details + Nearby Search för gratisscanens
 * place_id. Ingen place_id (gratisscanen hittade ingen profil) → inga anrop.
 */
export async function fetchPlacesForCachedScan(
  input: { placeId: string | null; domainMatch: boolean | null; placeWarning: string | null },
  fetchers: Pick<PlacesFetchers, 'getPlaceDetails' | 'findNearbyCompetitors'> = defaultPlacesFetchers,
): Promise<{ place: PlaceData | null; competitorList: NearbyCompetitor[] }> {
  if (!input.placeId) return { place: null, competitorList: [] }
  const place = await freshPlaceDetails(input.placeId, input.domainMatch, input.placeWarning, fetchers)
  if (!place) {
    console.warn(`[Places] Färsk Place Details för ${input.placeId} misslyckades — Places-beroende checks mäts utan profildata`)
    return { place: null, competitorList: [] }
  }
  return { place, competitorList: await competitorsForPlace(place, fetchers) }
}

/** Hämtar det en lagrad rapport behöver: Place Details + konkurrenter per place_id. Kastar aldrig. */
export async function fetchPlacesForStoredReport(
  stored: StoredReport,
  fetchers: PlacesFetchers = defaultPlacesFetchers,
): Promise<FreshPlaces> {
  const refs = stored.placesStripped
  let placeId = stored.placesRef?.placeId ?? null
  let domainMatch = stored.placesRef?.domainMatch ?? null
  if (!placeId && refs.lookupByUrl && stored.meta?.url) {
    const found = await fetchers.findBusinessByUrl(stored.meta.url, stored.meta.city ?? undefined).catch(() => null)
    placeId = typeof found?.id === 'string' ? found.id : null
    domainMatch = typeof found?._domainMatch === 'boolean' ? found._domainMatch : null
  }
  const place = placeId ? await freshPlaceDetails(placeId, domainMatch, null, fetchers) : null

  const ids = [...new Set([
    ...refs.competitorPlaceIds,
    ...(stored.competitorComparison?.competitors ?? []).map(c => c.placeId).filter((id): id is string => typeof id === 'string'),
  ])]
  const origin = place?.location ?? null
  const fetched = await Promise.all(ids.map(id => fetchers.getCompetitorDetails(id, origin).catch(() => null)))
  const competitors = new Map<string, NearbyCompetitor>()
  ids.forEach((id, i) => { if (fetched[i]) competitors.set(id, fetched[i]!) })
  return { place, competitors }
}

/** Behöver den lagrade rapporten några Places-anrop alls? */
export function needsPlacesFetch(stored: StoredReport): boolean {
  const refs = stored.placesStripped
  return !!stored.placesRef?.placeId || refs.lookupByUrl || refs.competitorPlaceIds.length > 0 ||
    (stored.competitorComparison?.competitors ?? []).some(c => typeof c.placeId === 'string')
}

/**
 * Status-/finalize-routen: lagrad (strippad) rapport → rapport med färsk Places-data.
 * Kastar aldrig; saknad API-nyckel eller fel ger rapporten utan Places-innehåll (loggas).
 */
export async function rehydrateStoredReport(
  stored: StoredReport,
  fetchers: PlacesFetchers = defaultPlacesFetchers,
): Promise<ScanResult> {
  let fresh = EMPTY_FRESH_PLACES
  if (needsPlacesFetch(stored)) {
    if (fetchers === defaultPlacesFetchers && !process.env.GOOGLE_PLACES_API_KEY) {
      console.warn('[PlacesRehydrate] GOOGLE_PLACES_API_KEY saknas — rapporten visas utan Places-data')
    } else {
      try {
        fresh = await fetchPlacesForStoredReport(stored, fetchers)
      } catch (err) {
        console.error('[PlacesRehydrate] Hämtningen misslyckades:', (err as Error)?.message)
      }
      const wanted = stored.placesStripped.competitorPlaceIds.length
      console.log(`[PlacesRehydrate] ${stored.meta?.url ?? '?'}: plats ${fresh.place ? 'hämtad' : 'saknas'}, konkurrenter ${fresh.competitors.size} hämtade (${wanted} i check #36)`)
    }
  }
  return rehydratePlacesContent(stored, fresh)
}
