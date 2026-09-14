import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { buildPaidReport, loadPlacesFixture, FIXTURE_PLACES_VALUES } from './fixtures/placesFixture'

// Route-handlers mot en temporär databas. Stripe mockas (inget riktigt köp),
// och det interna anropet till /api/enhanced-scan fångas via global fetch.
const retrieve = vi.fn()
vi.mock('@/app/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve } } }),
}))
const checkLimit = vi.fn(() => ({ ok: true, retryAfterSec: 0 }))
vi.mock('@/app/lib/rateLimit', () => ({ checkLimit, getClientIp: () => '1.2.3.4' }))
// Places API mockas: status/finalize hämtar färsk Places-data när en lagrad rapport öppnas.
const places = vi.hoisted(() => ({
  getPlaceDetails: vi.fn(),
  getCompetitorDetails: vi.fn(),
  findBusinessByUrl: vi.fn(),
  findNearbyCompetitors: vi.fn(),
}))
vi.mock('@/app/lib/places', () => places)

let dir: string
let dbPath: string
let db: typeof import('@/app/lib/checkoutDb')
let finalize: typeof import('@/app/api/checkout/finalize/route')
let status: typeof import('@/app/api/checkout/status/route')

const fakeResult = { meta: { url: 'https://tvakanten.se' }, checks: [{ key: 'https' }], scores: { free: 79, full: 72 } }

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'checkout-routes-test-'))
  dbPath = path.join(dir, 'checkouts.db')
  process.env.CHECKOUT_DB_PATH = dbPath
  db = await import('@/app/lib/checkoutDb')
  finalize = await import('@/app/api/checkout/finalize/route')
  status = await import('@/app/api/checkout/status/route')
})

afterAll(() => {
  delete process.env.CHECKOUT_DB_PATH
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  retrieve.mockReset()
})

function paidSession(sessionId: string, metadata: Record<string, string> = {}) {
  retrieve.mockResolvedValue({ id: sessionId, payment_status: 'paid', metadata })
}

function postFinalize(sessionId: string) {
  return finalize.POST(new NextRequest('http://localhost/api/checkout/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }))
}

async function getStatus(sessionId: string) {
  const res = await status.GET(new NextRequest(`http://localhost/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`))
  return { code: res.status, body: await res.json() }
}

/** Stubbar fetch så enhanced-scan-anropet hänger tills testet släpper det. */
function deferredScan() {
  let release!: (res: Response) => void
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, release: (res: Response) => release(res) }
}

describe('GET /api/checkout/status', () => {
  it('404 för okänt session_id', async () => {
    expect(await getStatus('finns_inte')).toEqual({ code: 404, body: { error: 'Okänd session' } })
  })

  it('400 utan session_id', async () => {
    const res = await status.GET(new NextRequest('http://localhost/api/checkout/status'))
    expect(res.status).toBe(400)
  })

  it('rate-limitern blockerar aldrig pollningen (150 anrop i rad)', async () => {
    db.createCheckout('cs_poll', 'https://a.se', null)
    for (let i = 0; i < 150; i++) {
      const { code } = await getStatus('cs_poll')
      expect(code).toBe(200)
    }
    expect(checkLimit).not.toHaveBeenCalled()
  })
})

describe('POST /api/checkout/finalize (asynkron)', () => {
  it('running → done: 202 direkt, status pollas, resultatet öppnas igen via samma länk', async () => {
    db.createCheckout('cs_async', 'https://tvakanten.se', 'Göteborg')
    paidSession('cs_async')
    const scan = deferredScan()

    const res = await postFinalize('cs_async')
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'running' })
    expect(scan.fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = scan.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toMatch(/\/api\/enhanced-scan$/)
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://tvakanten.se', city: 'Göteborg', tier: 'paid' })

    expect(await getStatus('cs_async')).toEqual({ code: 200, body: { status: 'running' } })

    // Omladdning medan scannet kör → inget nytt scan
    const again = await postFinalize('cs_async')
    expect(again.status).toBe(202)
    expect(scan.fetchMock).toHaveBeenCalledTimes(1)

    scan.release(new Response(JSON.stringify(fakeResult), { status: 200 }))
    await vi.waitFor(async () => {
      expect((await getStatus('cs_async')).body.status).toBe('done')
    })
    expect(await getStatus('cs_async')).toEqual({ code: 200, body: { status: 'done', scanResult: fakeResult } })

    // (b) Samma /report?session_id=-länk senare → cachat resultat, inget nytt scan
    const reopen = await postFinalize('cs_async')
    expect(reopen.status).toBe(200)
    expect(await reopen.json()).toEqual({ scanResult: fakeResult, fromCache: true })
    expect(scan.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('misslyckat scan → failed, nytt finalize startar om', async () => {
    db.createCheckout('cs_retry', 'https://sprej.nu', null)
    paidSession('cs_retry')
    const first = deferredScan()
    expect((await postFinalize('cs_retry')).status).toBe(202)
    first.release(new Response('boom', { status: 500 }))
    await vi.waitFor(async () => {
      expect((await getStatus('cs_retry')).body).toEqual({ status: 'failed' })
    })

    const second = deferredScan()
    expect((await postFinalize('cs_retry')).status).toBe(202)
    expect(second.fetchMock).toHaveBeenCalledTimes(1)
    expect((await getStatus('cs_retry')).body).toEqual({ status: 'running' })
    second.release(new Response(JSON.stringify(fakeResult), { status: 200 }))
    await vi.waitFor(async () => {
      expect((await getStatus('cs_retry')).body.status).toBe('done')
    })
  })

  it('15-min-regeln: running från omstartad process → failed, finalize startar om', async () => {
    db.createCheckout('cs_orphan', 'https://tvakanten.se', null)
    db.getCheckout('cs_orphan') // säkerställ att schemat finns
    new Database(dbPath).prepare(`UPDATE checkouts SET scan_status = 'running', scan_started_at = ? WHERE session_id = 'cs_orphan'`)
      .run(Date.now() - db.SCAN_STALE_MS - 1000)
    expect(await getStatus('cs_orphan')).toEqual({ code: 200, body: { status: 'failed' } })

    paidSession('cs_orphan')
    const scan = deferredScan()
    expect((await postFinalize('cs_orphan')).status).toBe(202)
    expect(scan.fetchMock).toHaveBeenCalledTimes(1)
    expect((await getStatus('cs_orphan')).body).toEqual({ status: 'running' })
    scan.release(new Response(JSON.stringify(fakeResult), { status: 200 }))
    await vi.waitFor(async () => {
      expect((await getStatus('cs_orphan')).body.status).toBe('done')
    })
  })

  it('running yngre än 15 min startas inte om', async () => {
    db.createCheckout('cs_young', 'https://tvakanten.se', null)
    new Database(dbPath).prepare(`UPDATE checkouts SET scan_status = 'running', scan_started_at = ? WHERE session_id = 'cs_young'`)
      .run(Date.now() - db.SCAN_STALE_MS + 60_000)
    paidSession('cs_young')
    const scan = deferredScan()
    expect((await postFinalize('cs_young')).status).toBe(202)
    expect(scan.fetchMock).not.toHaveBeenCalled()
  })

  it('DB-raden saknas (t.ex. efter deploy) → återskapas från Stripe-metadata och scannet körs', async () => {
    paidSession('cs_wiped', { url: 'https://sprej.nu', city: '' })
    const scan = deferredScan()
    expect((await postFinalize('cs_wiped')).status).toBe(202)
    expect(db.getCheckout('cs_wiped')?.url).toBe('https://sprej.nu')
    expect((await getStatus('cs_wiped')).body).toEqual({ status: 'running' })
    scan.release(new Response(JSON.stringify(fakeResult), { status: 200 }))
    await vi.waitFor(async () => {
      expect((await getStatus('cs_wiped')).body.status).toBe('done')
    })
  })

  it('obetald session startar inget scan', async () => {
    db.createCheckout('cs_unpaid', 'https://a.se', null)
    retrieve.mockResolvedValue({ id: 'cs_unpaid', payment_status: 'unpaid', metadata: {} })
    const scan = deferredScan()
    const res = await postFinalize('cs_unpaid')
    expect(res.status).toBe(402)
    expect(scan.fetchMock).not.toHaveBeenCalled()
    expect((await getStatus('cs_unpaid')).body).toEqual({ status: 'pending' })
  })
})

describe('Places-villkoren: lagrad rapport utan Places-innehåll, rehydrerad vid läsning', () => {
  it('status och finalize returnerar rapporten med färsk GBP-/konkurrentdata, databasen har bara place_id', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-nyckel')
    const fixture = loadPlacesFixture()
    places.getPlaceDetails.mockImplementation(async (id: string) => (id === fixture.freshPlace.id ? fixture.freshPlace : null))
    places.getCompetitorDetails.mockImplementation(async (id: string) => fixture.freshCompetitors.find(c => c.placeId === id) ?? null)

    const report = buildPaidReport()
    db.createCheckout('cs_places', 'https://www.krogentest.se', 'Göteborg')
    db.claimScan('cs_places')
    expect(db.markScanDone('cs_places', report)).toBe(true)

    const raw = new Database(dbPath)
    const row = raw.prepare(`SELECT scan_result_json FROM checkouts WHERE session_id = 'cs_places'`).get() as { scan_result_json: string }
    raw.close()
    for (const value of FIXTURE_PLACES_VALUES) expect(row.scan_result_json, value).not.toContain(value)
    expect(row.scan_result_json).toContain('ChIJtest-krogen')

    const polled = await getStatus('cs_places')
    expect(polled).toEqual({ code: 200, body: { status: 'done', scanResult: report } })
    expect(polled.body.scanResult.gbp).toMatchObject({ phone: '031-700 12 34', rating: 4.6, address: 'Testgatan 12, 411 36 Göteborg, Sverige' })
    expect(places.getPlaceDetails).toHaveBeenCalledWith('ChIJtest-krogen')

    paidSession('cs_places')
    const reopen = await postFinalize('cs_places')
    expect(reopen.status).toBe(200)
    expect(await reopen.json()).toEqual({ scanResult: report, fromCache: true })
    vi.unstubAllEnvs()
  })
})
