import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  createCheckout, getCheckout, markPaid, getScanResult,
  claimScan, markScanDone, markScanFailed, SCAN_STALE_MS,
} from '@/app/lib/checkoutDb'
import type { ScanResult } from '@/app/lib/scanResult'
import { APP_URL } from '@/app/lib/config'
import { getStripe } from '@/app/lib/stripe'

/**
 * POST /api/checkout/finalize
 *
 * Anropas från /report-sidan efter att Stripe har redirectat tillbaka, och
 * igen varje gång kunden öppnar samma /report?session_id=-länk.
 * Flöde:
 *   1. Hämta Stripe Checkout Session via session_id
 *   2. Verifiera payment_status === 'paid'
 *   3. Slå upp checkout i SQLite, hämta url + city
 *   4. Om scan-resultat finns cachat → 200 { scanResult, fromCache: true }
 *   5. Annars (Task 13, asynkront): claimScan → starta paid-scannet i bakgrunden och
 *      svara direkt 202 { status: 'running' }. Klienten pollar GET /api/checkout/status.
 *      Kör redan ett färskt scan för sessionen startas inget nytt (också 202).
 *      Ett misslyckat eller > 15 min gammalt 'running' startas om.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'sessionId saknas' },
        { status: 400, headers: corsHeaders },
      )
    }

    // 1. Hämta session från Stripe
    let session: Stripe.Checkout.Session
    try {
      session = await getStripe().checkout.sessions.retrieve(sessionId)
    } catch (e) {
      return NextResponse.json(
        { error: 'Ogiltig session_id' },
        { status: 404, headers: corsHeaders },
      )
    }

    // 2. Verifiera betalning
    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        {
          error: 'Betalning ej genomförd',
          paymentStatus: session.payment_status,
        },
        { status: 402, headers: corsHeaders },
      )
    }

    // 3. Hämta url + city — DB är cachen, Stripe metadata är källan (överlever deploy)
    let targetUrl: string
    let targetCity: string | null

    const storedCheckout = getCheckout(sessionId)
    if (storedCheckout) {
      targetUrl = storedCheckout.url
      targetCity = storedCheckout.city
    } else {
      // DB saknar raden (t.ex. SQLite raderades vid Railway-deploy)
      // Stripe metadata är alltid tillgänglig och innehåller url + city
      targetUrl = (session.metadata?.url as string) ?? ''
      targetCity = (session.metadata?.city as string) ?? null
      if (!targetUrl) {
        return NextResponse.json(
          { error: 'Hittar inte scan-parametrar för denna session' },
          { status: 500, headers: corsHeaders },
        )
      }
      // Återskapa DB-rad så scannet kan köras asynkront och resultatet cachas
      try { createCheckout(sessionId, targetUrl, targetCity) } catch {}
    }

    // markPaid är en UPDATE — gör ingenting om raden av någon anledning saknas
    markPaid(sessionId)

    // 4. Cachat resultat? (försvinner vid deploy, men scan körs om automatiskt)
    const cached = getScanResult(sessionId)
    if (cached) {
      console.log(`[Finalize] returning cached scan for ${sessionId}`)
      return NextResponse.json(
        { scanResult: cached, fromCache: true },
        { headers: corsHeaders },
      )
    }

    // 5. Starta paid-scannet i bakgrunden (om inget färskt scan redan kör)
    const attempt = claimScan(sessionId)
    if (attempt === null) {
      // Resultatet kan ha blivit klart mellan steg 4 och anspråket
      const justFinished = getScanResult(sessionId)
      if (justFinished) {
        return NextResponse.json(
          { scanResult: justFinished, fromCache: true },
          { headers: corsHeaders },
        )
      }
      if (!getCheckout(sessionId)) {
        // Raden gick inte att skapa → inget att polla mot
        throw new Error(`checkout-rad saknas för ${sessionId}`)
      }
      console.log(`[Finalize] paid scan already running for ${sessionId}`)
      return NextResponse.json({ status: 'running' }, { status: 202, headers: corsHeaders })
    }

    console.log(`[Finalize] starting paid scan for ${targetUrl} (${sessionId})`)
    void runPaidScan(sessionId, targetUrl, targetCity, attempt).catch((err) => {
      console.error(`[Finalize] background scan crashed for ${sessionId}:`, err)
    })

    return NextResponse.json({ status: 'running' }, { status: 202, headers: corsHeaders })
  } catch (err: unknown) {
    const errorId = crypto.randomUUID().slice(0, 8)
    console.error(`[Finalize] error [${errorId}]:`, err)
    return NextResponse.json(
      { error: 'Internt fel', errorId },
      { status: 500, headers: corsHeaders },
    )
  }
}

/**
 * Kör paid-scannet mot vår egen enhanced-scan endpoint och sparar utfallet.
 * Kastar aldrig: vid fel markeras just detta försök som 'failed'.
 */
async function runPaidScan(sessionId: string, url: string, city: string | null, attempt: number): Promise<void> {
  const started = Date.now()
  try {
    const scanRes = await fetch(`${APP_URL}/api/enhanced-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-scan-token': process.env.INTERNAL_SCAN_TOKEN ?? '' },
      body: JSON.stringify({
        url,
        city: city || undefined,
        tier: 'paid',
      }),
      // Ett scan som hänger längre än stale-gränsen har redan tagits över
      signal: AbortSignal.timeout(SCAN_STALE_MS),
    })

    if (!scanRes.ok) {
      const detail = await scanRes.text().catch(() => '')
      markScanFailed(sessionId, attempt)
      console.error(`[Finalize] scan failed for ${sessionId}: ${scanRes.status} ${detail.slice(0, 200)}`)
      return
    }

    const scanResult = (await scanRes.json()) as ScanResult
    if (!scanResult || typeof scanResult !== 'object' || !Array.isArray(scanResult.checks)) {
      markScanFailed(sessionId, attempt)
      console.error(`[Finalize] scan for ${sessionId} returned no ScanResult`)
      return
    }

    const saved = markScanDone(sessionId, scanResult)
    console.log(`[Finalize] paid scan ${saved ? 'done' : 'done but a result was already saved'} for ${sessionId} in ${Math.round((Date.now() - started) / 1000)} s`)
  } catch (err: unknown) {
    try { markScanFailed(sessionId, attempt) } catch {}
    console.error(`[Finalize] scan error for ${sessionId}:`, err)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}
