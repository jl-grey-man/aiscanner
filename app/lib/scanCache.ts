/**
 * scanCache.ts — Task 12: paid-scan återanvänder den cachade free-scanen.
 *
 * Varför: kunden ser gratisrapportens poäng, betalar och ska få en premiumrapport
 * byggd på EXAKT samma mätning. Tidigare kördes hela scannet om vid betalning
 * (scraping + Flash + Places + Tavily + PSI + AI-test) — Flash-bedömningarna kunde
 * då landa annorlunda och `scores.free` skilde sig mellan gratis- och premiumrapporten,
 * och betalflödet tog 15–20 s längre.
 *
 * Vad som cachas: inte bara ScanResult utan hela insamlingsfasens rådata
 * (`ScanContext`) — paid-berikningen (Report Writer, Pro-syntes, reviewInsights,
 * konkurrentjämförelse, faktaförankring, huvudschema) behöver skrapad data, Places-
 * detaljer med recensionstexter och Flash-rådata som inte finns i ScanResult.
 *
 * Nyckel: normaliserad URL + den stad scannet LANDADE i (`meta.city`). Gratisrapporten
 * skickar `meta.url` + `meta.city` till checkout, som skickar dem vidare till paid-scan —
 * så nyckeln matchar även när användaren inte skrev någon stad (staden kom då från Places).
 *
 * Lagring: tabellen `scan_cache` i checkoutDb.ts (SQLite).
 */

import { ScanResultSchema } from './scanResult'
import type { ScanResult } from './scanResult'
import type { EnhancedData } from './enhancedScraper'
import type { ScrapedData } from './scraper'
import type { NearbyCompetitor } from './places'
import type { AIMentionResult } from './aiMentionChecker'

/** Bumpa när ScanContext ändras inkompatibelt — gamla rader blir då cachemissar. */
export const SCAN_CACHE_VERSION = 1

/** Resultatet av analyzeReviewReplies() i route.ts (Audit #3: alltid notMeasured). */
export interface ReviewReplyAnalysis {
  total: number
  status: 'notMeasured'
  finding: string
  fix: string
  sampleNote: string
}

/**
 * Allt insamlingsfasen producerar och som paid-berikningen behöver. Måste vara
 * JSON-säkert (inga Map/Set/Date) — det serialiseras till SQLite.
 */
export interface ScanContext {
  /** URL-strängen som scannades (används nedströms i stället för paid-anropets URL). */
  url: string
  /** Stad som scannet landade i (input → Places → skrapad), '' om okänd. */
  city: string
  companyName: string
  bransch: string
  isHttps: boolean
  enhancedData: EnhancedData
  scrapedData: ScrapedData
  /** Places-detaljer (eller Text Search-träffen) — `any` precis som i route.ts. */
  placeForAnalysis: any
  /** Recensionstexter från Place Details (max 5). */
  reviews: any[]
  reviewReplyResult: ReviewReplyAnalysis
  technicalResult: any
  faqResult: any
  eatResult: any
  directoryResult: any
  aiMentionResult: AIMentionResult | null
  cwvMetrics: any
  competitorList: NearbyCompetitor[]
}

export interface CachedFreeScan {
  v: typeof SCAN_CACHE_VERSION
  scanResult: ScanResult
  context: ScanContext
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

export function serializeFreeScan(scanResult: ScanResult, context: ScanContext): string {
  const entry: CachedFreeScan = { v: SCAN_CACHE_VERSION, scanResult, context }
  return JSON.stringify(entry)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Tolkar en cachad rad. Returnerar null (= cachemiss) vid trasig JSON, fel version,
 * ogiltigt ScanResult eller ofullständig ScanContext — aldrig ett halvt objekt.
 * Returnerar originalobjektet (inte Zod-utdata) så inga fält strippas.
 */
export function parseCachedFreeScan(json: string): CachedFreeScan | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObject(raw) || raw.v !== SCAN_CACHE_VERSION) return null
  if (!ScanResultSchema.safeParse(raw.scanResult).success) return null

  const ctx = raw.context
  if (!isObject(ctx)) return null
  if (typeof ctx.url !== 'string' || typeof ctx.city !== 'string') return null
  if (typeof ctx.companyName !== 'string' || typeof ctx.bransch !== 'string') return null
  if (typeof ctx.isHttps !== 'boolean') return null
  if (!isObject(ctx.enhancedData)) return null
  if (!isObject(ctx.scrapedData) || !Array.isArray(ctx.scrapedData.pages)) return null
  if (!Array.isArray(ctx.reviews) || !Array.isArray(ctx.competitorList)) return null
  if (!isObject(ctx.reviewReplyResult)) return null
  if (!isObject(ctx.technicalResult) || !isObject(ctx.faqResult) || !isObject(ctx.eatResult)) return null
  if (!isObject(ctx.directoryResult)) return null

  return raw as unknown as CachedFreeScan
}
