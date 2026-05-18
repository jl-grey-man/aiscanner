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

export interface Checkout {
  session_id: string
  url: string
  city: string | null
  status: Status
  scan_result_json: string | null
  created_at: number
  updated_at: number
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
      updated_at       INTEGER NOT NULL
    )
  `)
  return db
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

export function saveScanResult(sessionId: string, result: ScanResult): void {
  getDb().prepare(`
    UPDATE checkouts SET status = 'scanned', scan_result_json = ?, updated_at = ? WHERE session_id = ?
  `).run(JSON.stringify(result), Date.now(), sessionId)
}

export function markFailed(sessionId: string): void {
  getDb().prepare(`
    UPDATE checkouts SET status = 'failed', updated_at = ? WHERE session_id = ?
  `).run(Date.now(), sessionId)
}

export function getScanResult(sessionId: string): ScanResult | null {
  const row = getCheckout(sessionId)
  if (!row?.scan_result_json) return null
  try {
    return JSON.parse(row.scan_result_json) as ScanResult
  } catch {
    return null
  }
}
