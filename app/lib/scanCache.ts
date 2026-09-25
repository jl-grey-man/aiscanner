/**
 * scanCache.ts — Task 12: paid-scan återanvänder den cachade free-scanen.
 *
 * Varför: kunden ser gratisrapportens poäng, betalar och ska få en premiumrapport
 * byggd på EXAKT samma mätning. Tidigare kördes hela scannet om vid betalning
 * (scraping + Flash + Places + Tavily + PSI + AI-test) — Flash-bedömningarna kunde
 * då landa annorlunda och `scores.free` skilde sig mellan gratis- och premiumrapporten,
 * och betalflödet tog 15–20 s längre.
 *
 * Vad som cachas (v2, Places-villkoren — se placesContent.ts): bara insamlingsfasens
 * ICKE-Places-data (`CachedScanContext`: skrapad data, Flash-bedömningar, katalogdata
 * från Tavily, AI-test, PSI) + place_id. Places-innehåll (namn, adress, telefon, betyg,
 * recensioner, öppettider, types, konkurrentlistan) lagras aldrig: vid paid-träff hämtas
 * Place Details + Nearby Search färskt och `restoreScanContext()` bygger om det
 * Places-beroende deterministiskt; route.ts kör sedan buildCheckResults() på nytt.
 *
 * Nyckel: normaliserad URL + den stad scannet LANDADE i (`meta.city`). Gratisrapporten
 * skickar `meta.url` + `meta.city` till checkout, som skickar dem vidare till paid-scan —
 * så nyckeln matchar även när användaren inte skrev någon stad (staden kom då från Places).
 *
 * Lagring: tabellen `scan_cache` i checkoutDb.ts (SQLite).
 */

import type { CheckResult, ScanResult } from './scanResult'
import type { EnhancedData } from './enhancedScraper'
import type { ScrapedData } from './scraper'
import type { NearbyCompetitor } from './places'
import type { AIMentionResult } from './aiMentionChecker'
import { derivePlacesParts } from './placesContent'
import type { PlaceData, ReviewReplyAnalysis } from './placesContent'

export type { ReviewReplyAnalysis } from './placesContent'

/** Bumpa när det cachade formatet ändras inkompatibelt — gamla rader blir då cachemissar (och raderas). */
export const SCAN_CACHE_VERSION = 2

/**
 * Den del av insamlingsfasen som FÅR lagras: inget Places-innehåll, bara place_id och
 * vår egen domänverifiering. Måste vara JSON-säkert (inga Map/Set/Date).
 */
export interface CachedScanContext {
  /** URL-strängen som scannades (används nedströms i stället för paid-anropets URL). */
  url: string
  /** Stad som scannet landade i (input → Places → skrapad), '' om okänd. */
  city: string
  isHttps: boolean
  enhancedData: EnhancedData
  scrapedData: ScrapedData
  technicalResult: any
  faqResult: any
  eatResult: any
  directoryResult: any
  aiMentionResult: AIMentionResult | null
  cwvMetrics: any
  /** Google place_id (undantaget i Places-villkoren), null = ingen profil hittades. */
  placeId: string | null
  /** Matchade Text Search-träffens websiteUri den scannade domänen? (vår egen kontroll) */
  domainMatch: boolean | null
  /** Vår varningstext när domänen inte kunde verifieras. */
  placeWarning: string | null
  /**
   * Antal distinkta kontor findBusinessByUrl hittade för domänen när ingen stad angavs
   * (bjurfors.se-buggen), null = inte tvetydigt. Bara ANTALET cachas — ortnamnen är
   * Places-innehåll (andra kontors adresser) och visas bara i det levande svaret
   * (route.ts bygger om meta.multipleLocations.cities[] från en färsk sökning finns
   * inte vid cacheträff, så en paid-rapport byggd från cache visar bara antalet).
   */
  multipleLocationsCount: number | null
}

/**
 * Hela insamlingsfasen i minnet = cachebar del + Places-delar. Places-delarna hämtas
 * färskt vid varje scan och varje cacheträff och får aldrig serialiseras.
 */
export interface ScanContext extends CachedScanContext {
  companyName: string
  bransch: string
  /** Places-detaljer (eller Text Search-träffen) — `any` precis som i route.ts. */
  placeForAnalysis: any
  /** Recensionstexter från Place Details (max 5). */
  reviews: any[]
  reviewReplyResult: ReviewReplyAnalysis
  competitorList: NearbyCompetitor[]
}

export interface CachedFreeScan {
  v: typeof SCAN_CACHE_VERSION
  /** När gratisscanen gjordes — premiumrapporten visar "Data hämtad <scanDate>". */
  scanDate: string
  /** Gratisscanens poäng och statusar, för att logga om färsk Places-data ändrar dem. */
  scores: { free: number; full: number }
  statuses: Record<string, CheckResult['status']>
  context: CachedScanContext
}

/**
 * Cachenyckel = normaliserad URL + normaliserad stad.
 * - Värd gemener, standardport bort, fragment bort, avslutande snedstreck bort.
 * - Protokollet behålls (http och https bedöms olika i https-checken) och `www.`
 *   behålls (URL-strängen används nedströms, t.ex. i huvudschemats @id).
 * - Stad: trimmad, blanksteg hopslagna, gemener; null/undefined/'' blir samma sak.
 * Returnerar null för en URL som inte går att tolka.
 */
export function scanCacheKey(url: string, city: string | null | undefined): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const path = parsed.pathname.replace(/\/+$/, '')
  const normalizedUrl = `${parsed.protocol}//${parsed.host}${path}${parsed.search}`
  const normalizedCity = (city ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv-SE')
  return `${normalizedUrl}|${normalizedCity}`
}

/**
 * Anledning att INTE cacha en free-scan, eller null om den får cachas.
 * En premiumrapport ska inte ärva ett tillfälligt API-fel: föll någon Flash-bedömning
 * eller AI-testet tillbaka på "Kunde inte analyseras" körs paid i stället om från början.
 */
export function cacheSkipReason(input: {
  failedAssessments: string[]
  aiMentionResult: AIMentionResult | null
  scanResultValid: boolean
}): string | null {
  if (!input.scanResultValid) return 'ScanResult klarade inte Zod-valideringen'
  if (input.failedAssessments.length > 0) {
    return `Flash-bedömning misslyckades (${input.failedAssessments.join(', ')})`
  }
  if (!input.aiMentionResult || input.aiMentionResult.errored) return 'AI-testet misslyckades'
  return null
}

/**
 * Plockar ut EXAKT de cachebara fälten (vitlista — ett nytt Places-fält i ScanContext
 * kan aldrig av misstag följa med till databasen).
 */
export function toCachedContext(context: ScanContext): CachedScanContext {
  return {
    url: context.url,
    city: context.city,
    isHttps: context.isHttps,
    enhancedData: context.enhancedData,
    scrapedData: context.scrapedData,
    technicalResult: context.technicalResult,
    faqResult: context.faqResult,
    eatResult: context.eatResult,
    directoryResult: context.directoryResult,
    aiMentionResult: context.aiMentionResult,
    cwvMetrics: context.cwvMetrics,
    placeId: context.placeId,
    domainMatch: context.domainMatch,
    placeWarning: context.placeWarning,
    multipleLocationsCount: context.multipleLocationsCount,
  }
}

export function serializeFreeScan(scanResult: ScanResult, context: ScanContext): string {
  const entry: CachedFreeScan = {
    v: SCAN_CACHE_VERSION,
    scanDate: scanResult.meta.scanDate,
    scores: { free: scanResult.scores.free, full: scanResult.scores.full },
    statuses: Object.fromEntries(scanResult.checks.map(c => [c.key, c.status])),
    context: toCachedContext(context),
  }
  return JSON.stringify(entry)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Tolkar en cachad rad. Returnerar null (= cachemiss) vid trasig JSON, fel version
 * eller ofullständig kontext — aldrig ett halvt objekt.
 */
export function parseCachedFreeScan(json: string): CachedFreeScan | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObject(raw) || raw.v !== SCAN_CACHE_VERSION) return null
  if (typeof raw.scanDate !== 'string' || !isObject(raw.statuses)) return null
  if (!isObject(raw.scores) || typeof raw.scores.free !== 'number' || typeof raw.scores.full !== 'number') return null

  const ctx = raw.context
  if (!isObject(ctx)) return null
  if (typeof ctx.url !== 'string' || typeof ctx.city !== 'string') return null
  if (typeof ctx.isHttps !== 'boolean') return null
  if (!isObject(ctx.enhancedData)) return null
  if (!isObject(ctx.scrapedData) || !Array.isArray(ctx.scrapedData.pages)) return null
  if (!isObject(ctx.technicalResult) || !isObject(ctx.faqResult) || !isObject(ctx.eatResult)) return null
  if (!isObject(ctx.directoryResult)) return null
  if (ctx.placeId !== null && typeof ctx.placeId !== 'string') return null

  return raw as unknown as CachedFreeScan
}

/**
 * Bygger den fullständiga ScanContext av den cachade (Places-fria) delen + FÄRSK
 * Places-data, med samma härledning som insamlingsfasen (derivePlacesParts).
 */
export function restoreScanContext(
  cached: CachedScanContext,
  fresh: { place: PlaceData | null; competitorList: NearbyCompetitor[] },
): ScanContext {
  const title = cached.scrapedData.pages[0]?.title ?? null
  const parts = derivePlacesParts({ place: fresh.place, details: fresh.place, title })
  return {
    ...cached,
    ...parts,
    reviews: parts.reviews as any[],
    placeForAnalysis: fresh.place,
    competitorList: fresh.competitorList,
  }
}

/** "openingHours: ok → notMeasured" för varje check vars status skiljer sig från gratisscanen. */
export function diffCachedStatuses(
  cachedStatuses: Record<string, CheckResult['status']>,
  checks: Pick<CheckResult, 'key' | 'status'>[],
): string[] {
  return checks
    .filter(c => cachedStatuses[c.key] !== undefined && cachedStatuses[c.key] !== c.status)
    .map(c => `${c.key}: ${cachedStatuses[c.key]} → ${c.status}`)
}
