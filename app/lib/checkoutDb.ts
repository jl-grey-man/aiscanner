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
 *   scan_result_json TEXT               — full ScanResult som JSON när scanen är klar
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
 *   result_json TEXT NOT NULL      — serializeFreeScan(): { v, scanResult, context }
 *   created_at  INTEGER NOT NULL   — ms sedan epoch; rader äldre än TTL rensas vid skrivning
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
  return db
}

/** Hur länge en cachad free-scan får återanvändas av paid-flödet. */
export const SCAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Sparar (ersätter) en free-scan under cacheKey och rensar rader äldre än maxAgeMs,
 * så tabellen inte växer obegränsat med publika gratisscans.
 */
export function saveFreeScan(cacheKey: string, resultJson: string, maxAgeMs: number = SCAN_CACHE_TTL_MS): void {
  const now = Date.now()
  const conn = getDb()
  conn.prepare('DELETE FROM scan_cache WHERE created_at < ?').run(now - maxAgeMs)
  conn.prepare(`
    INSERT OR REPLACE INTO scan_cache (cache_key, result_json, created_at) VALUES (?, ?, ?)
  `).run(cacheKey, resultJson, now)
}

/** Cachad free-scan som JSON, eller null om den saknas eller är äldre än maxAgeMs. */
export function getFreeScan(cacheKey: string, maxAgeMs: number): string | null {
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
  const res = getDb().prepare(`
    UPDATE checkouts SET status = 'scanned', scan_status = 'done', scan_result_json = ?, updated_at = ?
    WHERE session_id = ? AND (scan_result_json IS NULL OR json_valid(scan_result_json) = 0)
  `).run(JSON.stringify(result), Date.now(), sessionId)
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

export function getScanResult(sessionId: string): ScanResult | null {
  const row = getCheckout(sessionId)
  return row ? parseScanResult(row.scan_result_json) : null
}

function parseScanResult(json: string | null): ScanResult | null {
  if (!json) return null
  try {
    return JSON.parse(json) as ScanResult
  } catch {
    return null
  }
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
  | { status: 'done'; scanResult: ScanResult }
  | { status: 'running' | 'failed' | 'pending' }

/** Status för GET /api/checkout/status, eller null om sessionen är okänd. */
export function getScanStatus(sessionId: string, now: number = Date.now()): ScanStatusResponse | null {
  const row = getCheckout(sessionId)
  if (!row) return null
  const status = deriveScanStatus(row, now)
  if (status === 'done') {
    return { status, scanResult: parseScanResult(row.scan_result_json) as ScanResult }
  }
  return { status }
}
