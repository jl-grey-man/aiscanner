import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { ScanResult } from '@/app/lib/scanResult'
import { stripPlacesContent } from '@/app/lib/placesContent'
import { buildPaidReport, FIXTURE_PLACES_VALUES } from './fixtures/placesFixture'

// checkoutDb läser CHECKOUT_DB_PATH vid import. Databasen skapas först med
// schemat från före Task 13 (utan scan_status/scan_started_at) så migreringen testas.
let dir: string
let dbPath: string
let db: typeof import('@/app/lib/checkoutDb')

const fakeResult = { checks: [], scores: { free: 50, full: 40 } } as unknown as ScanResult
const T0 = new Date('2026-09-14T12:00:00Z').getTime()

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'checkout-status-test-'))
  dbPath = path.join(dir, 'checkouts.db')
  const legacy = new Database(dbPath)
  legacy.exec(`
    CREATE TABLE checkouts (
      session_id TEXT PRIMARY KEY, url TEXT NOT NULL, city TEXT,
      status TEXT NOT NULL DEFAULT 'pending', scan_result_json TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )
  `)
  legacy.prepare(`INSERT INTO checkouts VALUES ('cs_legacy_done', 'https://a.se', NULL, 'scanned', ?, 1, 1)`)
    .run(JSON.stringify(fakeResult))
  legacy.prepare(`INSERT INTO checkouts VALUES ('cs_legacy_failed', 'https://a.se', NULL, 'failed', NULL, 1, 1)`).run()
  // Rapport sparad före Places-efterlevnaden: rått Places-innehåll och inget placesRef.
  const legacyPlacesReport = buildPaidReport()
  delete legacyPlacesReport.placesRef
  legacy.prepare(`INSERT INTO checkouts VALUES ('cs_legacy_places', 'https://www.krogentest.se', 'Göteborg', 'scanned', ?, 1, 1)`)
    .run(JSON.stringify(legacyPlacesReport))
  // scan_cache v1 innehöll rå Places-data (placeForAnalysis, recensioner, konkurrentlista).
  legacy.exec('CREATE TABLE scan_cache (cache_key TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at INTEGER NOT NULL)')
  legacy.prepare('INSERT INTO scan_cache VALUES (?, ?, ?)')
    .run('https://www.krogentest.se|göteborg', JSON.stringify({ v: 1, context: { placeForAnalysis: { formattedAddress: 'Testgatan 12' } } }), Date.now())
  legacy.close()
  process.env.CHECKOUT_DB_PATH = dbPath
  db = await import('@/app/lib/checkoutDb')
})

afterAll(() => {
  delete process.env.CHECKOUT_DB_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('migrering av databas från före Task 13', () => {
  it('lägger till scan_status/scan_started_at och behåller gamla rader', () => {
    const legacyDone = db.getCheckout('cs_legacy_done')
    expect(legacyDone?.scan_status).toBe('pending')
    expect(legacyDone?.scan_started_at).toBeNull()
    // Gammalt sparat resultat går att öppna igen
    expect(db.getScanStatus('cs_legacy_done')).toEqual({ status: 'done', scanResult: stripPlacesContent(fakeResult) })
  })

  it('Places-villkoren: gammal rapport med Places-innehåll strippas och v1-cacherader raderas när databasen öppnas', () => {
    db.getCheckout('cs_legacy_places') // öppnar databasen → migreringen körs
    const raw = new Database(dbPath)
    const row = raw.prepare(`SELECT scan_result_json FROM checkouts WHERE session_id = 'cs_legacy_places'`).get() as { scan_result_json: string }
    for (const value of FIXTURE_PLACES_VALUES) expect(row.scan_result_json, value).not.toContain(value)
    expect(JSON.parse(row.scan_result_json).placesStripped).toMatchObject({ v: 1, lookupByUrl: true })
    expect(raw.prepare('SELECT COUNT(*) AS n FROM scan_cache').get()).toEqual({ n: 0 })
    raw.close()
    expect(db.getScanStatus('cs_legacy_places')?.status).toBe('done')
  })

  it('gammal misslyckad rad utan scan_status kan startas', () => {
    expect(db.getScanStatus('cs_legacy_failed')).toEqual({ status: 'pending' })
    expect(db.claimScan('cs_legacy_failed', T0)).toBe(T0)
  })
})

describe('deriveScanStatus', () => {
  const row = (over: Partial<Parameters<typeof db.deriveScanStatus>[0]>) => ({
    scan_status: null, scan_started_at: null, scan_result_json: null, ...over,
  })

  it('läsbart resultat är alltid done', () => {
    expect(db.deriveScanStatus(row({ scan_status: 'running', scan_started_at: T0, scan_result_json: '{"checks":[]}' }), T0)).toBe('done')
  })

  it('running yngre än 15 min är running', () => {
    expect(db.deriveScanStatus(row({ scan_status: 'running', scan_started_at: T0 }), T0 + db.SCAN_STALE_MS - 1)).toBe('running')
  })

  it('running äldre än 15 min (omstartad process) är failed', () => {
    expect(db.SCAN_STALE_MS).toBe(15 * 60 * 1000)
    expect(db.deriveScanStatus(row({ scan_status: 'running', scan_started_at: T0 }), T0 + db.SCAN_STALE_MS)).toBe('failed')
    expect(db.deriveScanStatus(row({ scan_status: 'running', scan_started_at: null }), T0)).toBe('failed')
  })

  it('failed, done utan läsbart resultat och pending', () => {
    expect(db.deriveScanStatus(row({ scan_status: 'failed' }), T0)).toBe('failed')
    expect(db.deriveScanStatus(row({ scan_status: 'done', scan_result_json: 'trasig{' }), T0)).toBe('failed')
    expect(db.deriveScanStatus(row({ scan_status: 'pending' }), T0)).toBe('pending')
    expect(db.deriveScanStatus(row({}), T0)).toBe('pending')
  })
})

describe('claimScan / markScanDone / markScanFailed', () => {
  it('okänd session ger null-status och går inte att ta anspråk på', () => {
    expect(db.getScanStatus('cs_finns_inte')).toBeNull()
    expect(db.claimScan('cs_finns_inte', T0)).toBeNull()
  })

  it('running → done: bara ett scan åt gången, resultatet cachas', () => {
    db.createCheckout('cs_flow', 'https://tvakanten.se', 'Göteborg')
    expect(db.getScanStatus('cs_flow')).toEqual({ status: 'pending' })

    const attempt = db.claimScan('cs_flow', T0)
    expect(attempt).toBe(T0)
    expect(db.getScanStatus('cs_flow', T0 + 1000)).toEqual({ status: 'running' })
    // Omladdning / andra fliken startar inget nytt scan
    expect(db.claimScan('cs_flow', T0 + 60_000)).toBeNull()

    expect(db.markScanDone('cs_flow', fakeResult)).toBe(true)
    expect(db.getScanStatus('cs_flow', T0 + 2000)).toEqual({ status: 'done', scanResult: stripPlacesContent(fakeResult) })
    expect(db.getScanResult('cs_flow')).toEqual(stripPlacesContent(fakeResult))
    expect(db.getCheckout('cs_flow')?.status).toBe('scanned')
    // Klart resultat startas aldrig om, inte ens långt senare
    expect(db.claimScan('cs_flow', T0 + 10 * db.SCAN_STALE_MS)).toBeNull()
  })

  it('Places-villkoren: markScanDone lagrar rapporten utan Places-innehåll men med place_id', () => {
    db.createCheckout('cs_places_store', 'https://www.krogentest.se', 'Göteborg')
    db.claimScan('cs_places_store', T0)
    expect(db.markScanDone('cs_places_store', buildPaidReport())).toBe(true)
    const raw = new Database(dbPath)
    const row = raw.prepare(`SELECT scan_result_json FROM checkouts WHERE session_id = 'cs_places_store'`).get() as { scan_result_json: string }
    raw.close()
    for (const value of FIXTURE_PLACES_VALUES) expect(row.scan_result_json, value).not.toContain(value)
    expect(row.scan_result_json).toContain('ChIJtest-krogen')
    expect(db.getScanResult('cs_places_store')).toEqual(stripPlacesContent(buildPaidReport()))
  })

  it('failed → nytt anspråk startar om scannet', () => {
    db.createCheckout('cs_fail', 'https://sprej.nu', null)
    const attempt = db.claimScan('cs_fail', T0) as number
    expect(db.markScanFailed('cs_fail', attempt)).toBe(true)
    expect(db.getScanStatus('cs_fail', T0 + 1)).toEqual({ status: 'failed' })
    expect(db.claimScan('cs_fail', T0 + 2)).toBe(T0 + 2)
    expect(db.getScanStatus('cs_fail', T0 + 3)).toEqual({ status: 'running' })
  })

  it('15-min-regeln: hängande running tas över, gamla försökets fel skriver inte över det nya', () => {
    db.createCheckout('cs_stale', 'https://tvakanten.se', null)
    const old = db.claimScan('cs_stale', T0) as number
    // Före gränsen: ingen omstart
    expect(db.claimScan('cs_stale', T0 + db.SCAN_STALE_MS - 1)).toBeNull()
    // Efter gränsen: status failed och nytt anspråk lyckas
    const later = T0 + db.SCAN_STALE_MS
    expect(db.getScanStatus('cs_stale', later)).toEqual({ status: 'failed' })
    const fresh = db.claimScan('cs_stale', later)
    expect(fresh).toBe(later)
    expect(db.getScanStatus('cs_stale', later + 1000)).toEqual({ status: 'running' })

    // Det gamla försöket dör sent → får inte markera det nya som failed
    expect(db.markScanFailed('cs_stale', old)).toBe(false)
    expect(db.getScanStatus('cs_stale', later + 2000)).toEqual({ status: 'running' })

    expect(db.markScanDone('cs_stale', fakeResult)).toBe(true)
    // Ett andra resultat (t.ex. från det gamla försöket) skriver inte över
    const other = { ...fakeResult, scores: { free: 1, full: 1 } } as unknown as ScanResult
    expect(db.markScanDone('cs_stale', other)).toBe(false)
    expect(db.getScanResult('cs_stale')).toEqual(stripPlacesContent(fakeResult))
  })

  it('done-rad med trasig JSON kan startas om', () => {
    db.createCheckout('cs_corrupt', 'https://a.se', null)
    new Database(dbPath).prepare(`UPDATE checkouts SET scan_status = 'done', scan_result_json = 'trasig{' WHERE session_id = 'cs_corrupt'`).run()
    expect(db.getScanStatus('cs_corrupt')).toEqual({ status: 'failed' })
    expect(db.claimScan('cs_corrupt', T0)).toBe(T0)
  })
})
