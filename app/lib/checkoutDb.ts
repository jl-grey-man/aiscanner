/**
 * checkoutDb.ts — SQLite-baserad persistens för Stripe-checkouts.
 *
 * Tabellen `checkouts` håller mappning mellan Stripe Checkout Session ID och
 * scan-parametrar (url, city) som ska användas när användaren returnerar
 * efter betalning. Vi sparar också det färdiga scan-resultatet så samma
 * session_id kan laddas om utan att vi kör scanen igen.
 *
 * Schema:
 *   session_id       TEXT PRIMARY KEY   — Stripe Checkout Session ID (cs_test_…)
 *   url              TEXT NOT NULL      — sajten som ska scannas
 *   city             TEXT               — användarens stad-hint (nullable)
 *   status           TEXT NOT NULL      — 'pending' | 'paid' | 'scanned' | 'failed'
 *   scan_result_json TEXT               — ScanResult UTAN Places-innehåll (stripPlacesContent i
 *                                         placesContent.ts, bara place_id) när scanen är klar
 *   created_at       INTEGER NOT NULL   — ms sedan epoch
 *   updated_at       INTEGER NOT NULL
 *   scan_status      TEXT               — Task 13: 'pending' | 'running' | 'done' | 'failed'
 *   scan_started_at  INTEGER            — ms när nuvarande paid-scan startade (försöks-id)
 *
 * Task 13 — asynkron finalize: finalize startar paid-scannet i bakgrunden
 * (claimScan → 'running') och klienten pollar GET /api/checkout/status.
 * Ett 'running' äldre än SCAN_STALE_MS (processen startades om mitt i) räknas
 * som 'failed' och får tas över av ett nytt finalize-anrop — en betalande kund
 * ska aldrig bli strandsatt. Äldre databaser får kolumnerna via ALTER TABLE.
 *
 * Tabellen `scan_cache` (Task 12) håller den senaste lyckade free-scanen per
 * normaliserad URL + stad (nyckel från scanCache.ts `scanCacheKey`) så paid-scanen
 * kan återanvända samma mätning i stället för att scanna om:
 *   cache_key   TEXT PRIMARY KEY   — "<normaliserad url>|<stad i gemener>"
 *   result_json TEXT NOT NULL      — serializeFreeScan(): { v: 2, scanDate, scores, statuses, context }
 *                                    — context utan Places-innehåll (bara place_id)
 *   created_at  INTEGER NOT NULL   — ms sedan epoch; rader äldre än TTL rensas vid varje läsning/skrivning
 *
 * Google Places-villkoren: inget Places-innehåll utöver place_id lagras i någon av
 * tabellerna. Äldre rader migreras när databasen öppnas (migratePlacesContent).
 *
 * OBS: SQLite-filen ligger i ./data/checkouts.db. Railway raderar disk vid
 * deploy om ingen volume är monterad — för permanent persistens, montera en
 * volume på /app/data. För MVP är det OK att data försvinner vid deploy
 * eftersom user-flowet (free scan → betalning → retur) brukar ta minuter.
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type { ScanResult } from './scanResult'
import { isStoredReport, stripPlacesContent } from './placesContent'
import type { StoredReport } from './placesContent'
import { SCAN_CACHE_VERSION } from './scanCache'

const DB_PATH = process.env.CHECKOUT_DB_PATH || './data/checkouts.db'

type Status = 'pending' | 'paid' | 'scanned' | 'failed'

/** Paid-scannets tillstånd för en checkout (Task 13). */
export type ScanStatus = 'pending' | 'running' | 'done' | 'failed'

/**
 * Ett 'running' som är äldre än så här har ingen levande process bakom sig
 * (paid-scan tar ~2–3 min). Status rapporteras då som 'failed' och ett nytt
 * finalize-anrop får starta om scannet.
 */
export const SCAN_STALE_MS = 15 * 60 * 1000

export interface Checkout {
  session_id: string
  url: string
  city: string | null
  status: Status
  scan_result_json: string | null
  created_at: number
  updated_at: number
  scan_status: ScanStatus | null
  scan_started_at: number | null
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkouts (
      session_id       TEXT PRIMARY KEY,
      url              TEXT NOT NULL,
      city             TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      scan_result_json TEXT,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL,
      scan_status      TEXT DEFAULT 'pending',
      scan_started_at  INTEGER
    )
  `)
  // Databaser skapade före Task 13 saknar statuskolumnerna.
  const columns = new Set(
    (db.prepare('PRAGMA table_info(checkouts)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!columns.has('scan_status')) db.exec(`ALTER TABLE checkouts ADD COLUMN scan_status TEXT DEFAULT 'pending'`)
  if (!columns.has('scan_started_at')) db.exec('ALTER TABLE checkouts ADD COLUMN scan_started_at INTEGER')
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_cache (
      cache_key   TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS scan_cache_created_at ON scan_cache (created_at)')
  migratePlacesContent(db)
  return db
}

/**
 * Places-villkoren: rader sparade före placesContent.ts innehåller Places-innehåll.
 * - checkouts: varje resultat utan `placesStripped` strippas på plats (place_id behålls
 *   om det finns; äldre rapporter slås upp via Text Search vid läsning).
 * - scan_cache: rader i ett annat format än SCAN_CACHE_VERSION (v1 = rå Places-data) raderas.
 * Körs när databasen öppnas. Exporterad för tester.
 */
export function migratePlacesContent(conn: Database.Database): { checkouts: number; scanCache: number } {
  const legacy = conn.prepare(`
    SELECT session_id, scan_result_json FROM checkouts
    WHERE scan_result_json IS NOT NULL AND json_valid(scan_result_json) = 1
      AND json_type(scan_result_json, '$.placesStripped') IS NULL
  `).all() as { session_id: string; scan_result_json: string }[]
  const update = conn.prepare('UPDATE checkouts SET scan_result_json = ? WHERE session_id = ?')
  let checkouts = 0
  for (const row of legacy) {
    const parsed = JSON.parse(row.scan_result_json) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    update.run(JSON.stringify(stripPlacesContent(parsed as ScanResult)), row.session_id)
    checkouts++
  }
  const scanCache = conn.prepare(`
    DELETE FROM scan_cache
    WHERE json_valid(result_json) = 0 OR json_extract(result_json, '$.v') IS NOT ?
  `).run(SCAN_CACHE_VERSION).changes
  if (checkouts > 0 || scanCache > 0) {
    console.log(`[PlacesCompliance] Migrering: ${checkouts} lagrade rapporter strippade, ${scanCache} gamla scan_cache-rader raderade`)
  }
  return { checkouts, scanCache }
}

/** Hur länge en cachad free-scan får återanvändas av paid-flödet. */
export const SCAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Raderar scan_cache-rader äldre än maxAgeMs (standard: TTL) och returnerar antalet.
 * Anropas vid varje läsning och skrivning av cachen — utgångna rader blir alltså kvar
 * högst till nästa cacheanvändning, och kan aldrig läsas.
 */
export function purgeExpiredScanCache(now: number = Date.now(), maxAgeMs: number = SCAN_CACHE_TTL_MS): number {
  return getDb().prepare('DELETE FROM scan_cache WHERE created_at < ?').run(now - maxAgeMs).changes
}

/**
 * Sparar (ersätter) en free-scan under cacheKey och rensar rader äldre än TTL,
 * så tabellen inte växer obegränsat med publika gratisscans.
 */
export function saveFreeScan(cacheKey: string, resultJson: string): void {
  const now = Date.now()
  purgeExpiredScanCache(now)
  getDb().prepare(`
    INSERT OR REPLACE INTO scan_cache (cache_key, result_json, created_at) VALUES (?, ?, ?)
  `).run(cacheKey, resultJson, now)
}

/** Cachad free-scan som JSON, eller null om den saknas eller är äldre än maxAgeMs. Rensar utgångna rader. */
export function getFreeScan(cacheKey: string, maxAgeMs: number): string | null {
  purgeExpiredScanCache()
  const row = getDb().prepare('SELECT result_json, created_at FROM scan_cache WHERE cache_key = ?')
    .get(cacheKey) as { result_json: string; created_at: number } | undefined
  if (!row) return null
  if (Date.now() - row.created_at > maxAgeMs) return null
  return row.result_json
}

export function createCheckout(sessionId: string, url: string, city: string | null): void {
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO checkouts (session_id, url, city, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(sessionId, url, city, now, now)
}

export function getCheckout(sessionId: string): Checkout | null {
  const row = getDb().prepare('SELECT * FROM checkouts WHERE session_id = ?').get(sessionId) as Checkout | undefined
  return row ?? null
}

export function markPaid(sessionId: string): void {
  getDb().prepare(`
    UPDATE checkouts SET status = 'paid', updated_at = ? WHERE session_id = ?
  `).run(Date.now(), sessionId)
}

/**
 * Atomiskt anspråk på att köra paid-scannet för en session. Lyckas bara om det
 * inte redan finns ett giltigt resultat och inget färskt scan kör (pending,
 * failed eller 'running' äldre än SCAN_STALE_MS). Två samtidiga finalize-anrop
 * (två flikar, omladdning) kan därför aldrig starta två scans.
 *
 * @returns försöks-id (= starttid i ms) att skicka till markScanFailed, eller null
 */
export function claimScan(sessionId: string, now: number = Date.now()): number | null {
  const res = getDb().prepare(`
    UPDATE checkouts SET scan_status = 'running', scan_started_at = ?, updated_at = ?
    WHERE session_id = ?
      AND (scan_result_json IS NULL OR json_valid(scan_result_json) = 0)
      AND (scan_status IS NULL OR scan_status != 'running'
           OR scan_started_at IS NULL OR scan_started_at <= ?)
  `).run(now, now, sessionId, now - SCAN_STALE_MS)
  return res.changes === 1 ? now : null
}

/**
 * Sparar paid-resultatet och sätter scan_status = 'done'. Första resultatet
 * vinner: ett äldre, övertaget försök som blir klart senare skriver inte över
 * en rapport kunden redan kan ha sett. Returnerar true om raden uppdaterades.
 */
export function markScanDone(sessionId: string, result: ScanResult): boolean {
  // Places-villkoren: rapporten lagras ALLTID utan Places-innehåll (bara place_id) —
  // den centrala spärren, oavsett vem som anropar. Läsaren bygger om via rehydrateStoredReport().
  const res = getDb().prepare(`
    UPDATE checkouts SET status = 'scanned', scan_status = 'done', scan_result_json = ?, updated_at = ?
    WHERE session_id = ? AND (scan_result_json IS NULL OR json_valid(scan_result_json) = 0)
  `).run(JSON.stringify(stripPlacesContent(result)), Date.now(), sessionId)
  return res.changes === 1
}

/**
 * Markerar försöket `attempt` som misslyckat. Gör ingenting om ett nyare
 * försök redan har tagit över (eller scannet hunnit bli klart) — ett gammalt
 * försöks fel får inte skriva över ett pågående omstartat scan.
 */
export function markScanFailed(sessionId: string, attempt: number): boolean {
  const res = getDb().prepare(`
    UPDATE checkouts SET status = 'failed', scan_status = 'failed', updated_at = ?
    WHERE session_id = ? AND scan_status = 'running' AND scan_started_at = ?
  `).run(Date.now(), sessionId, attempt)
  return res.changes === 1
}

/** Lagrad (Places-strippad) rapport — kör rehydrateStoredReport() innan den visas. */
export function getScanResult(sessionId: string): StoredReport | null {
  const row = getCheckout(sessionId)
  return row ? parseScanResult(row.scan_result_json) : null
}

function parseScanResult(json: string | null): StoredReport | null {
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  // Säkerhetsnät om en rad skrivits utan strip (t.ex. av en äldre process efter migreringen).
  return isStoredReport(parsed) ? parsed : stripPlacesContent(parsed as ScanResult)
}

type ScanStatusRow = Pick<Checkout, 'scan_status' | 'scan_started_at' | 'scan_result_json'>

/**
 * Härleder publik scanstatus ur en rad. Ett läsbart resultat är alltid 'done'
 * (även rader sparade före Task 13). 'running' äldre än SCAN_STALE_MS → 'failed'.
 */
export function deriveScanStatus(row: ScanStatusRow, now: number = Date.now()): ScanStatus {
  if (parseScanResult(row.scan_result_json)) return 'done'
  switch (row.scan_status) {
    case 'running':
      if (row.scan_started_at === null || now - row.scan_started_at >= SCAN_STALE_MS) return 'failed'
      return 'running'
    case 'failed':
    case 'done': // 'done' utan läsbart resultat går inte att visa → kan startas om
      return 'failed'
    default:
      return 'pending'
  }
}

export type ScanStatusResponse =
  | { status: 'done'; scanResult: StoredReport }
  | { status: 'running' | 'failed' | 'pending' }

/**
 * Status för GET /api/checkout/status, eller null om sessionen är okänd.
 * `scanResult` är den lagrade, Places-strippade rapporten — routen rehydrerar den.
 */
export function getScanStatus(sessionId: string, now: number = Date.now()): ScanStatusResponse | null {
  const row = getCheckout(sessionId)
  if (!row) return null
  const status = deriveScanStatus(row, now)
  if (status === 'done') {
    return { status, scanResult: parseScanResult(row.scan_result_json) as StoredReport }
  }
  return { status }
}
