import { NextRequest, NextResponse } from 'next/server'
import { getScanStatus } from '@/app/lib/checkoutDb'
import { rehydrateStoredReport } from '@/app/lib/placesContent'

/**
 * GET /api/checkout/status?session_id=cs_…
 *
 * Pollas av /report var 5:e sekund medan paid-scannet körs i bakgrunden
 * (se POST /api/checkout/finalize). Svar:
 *   200 { status: 'done', scanResult } | { status: 'running' } | { status: 'failed' } | { status: 'pending' }
 *   404 okänd session
 *
 * Medvetet INTE rate-limitad (app/lib/rateLimit.ts): en kund pollar upp till
 * 120 gånger på 10 min, och endpointen läser bara en SQLite-rad — den startar
 * inga scans och kostar inga API-krediter. Resultat lämnas bara ut för sessioner
 * vars betalning finalize redan har verifierat mot Stripe (scannet startar först då).
 *
 * Places-villkoren: rapporten är lagrad utan Places-innehåll. Vid `done` hämtas
 * Place Details + konkurrenter färskt via sparade place_id och fälten återställs
 * (rehydrateStoredReport) innan svaret — klienten slutar polla vid `done`.
 */
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id saknas' }, { status: 400, headers })
  }

  try {
    const result = getScanStatus(sessionId)
    if (!result) {
      return NextResponse.json({ error: 'Okänd session' }, { status: 404, headers })
    }
    if (result.status === 'done') {
      return NextResponse.json({ status: 'done', scanResult: await rehydrateStoredReport(result.scanResult) }, { headers })
    }
    return NextResponse.json(result, { headers })
  } catch (err: unknown) {
    const errorId = crypto.randomUUID().slice(0, 8)
    console.error(`[CheckoutStatus] error [${errorId}]:`, err)
    return NextResponse.json({ error: 'Internt fel', errorId }, { status: 500, headers })
  }
}
