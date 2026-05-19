import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createCheckout, getCheckout, markPaid, saveScanResult, markFailed, getScanResult } from '@/app/lib/checkoutDb'
import { APP_URL } from '@/app/lib/config'

const stripe = new Stripe(process.env.STRIPE_API_KEY!, { typescript: true })

/**
 * POST /api/checkout/finalize
 *
 * Anropas från /report-sidan efter att Stripe har redirectat tillbaka.
 * Flöde:
 *   1. Hämta Stripe Checkout Session via session_id
 *   2. Verifiera payment_status === 'paid'
 *   3. Slå upp checkout i SQLite, hämta url + city
 *   4. Om scan-resultat finns cachat → returnera direkt
 *   5. Annars kör paid-scan internt mot vår egen enhanced-scan endpoint, spara, returnera
 */
export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

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
      session = await stripe.checkout.sessions.retrieve(sessionId)
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
      // Återskapa DB-rad så fortsatta retries kan cacha scan-resultatet
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

    // 5. Kör paid-scan via vår egen endpoint
    console.log(`[Finalize] running paid scan for ${targetUrl}`)
    const scanRes = await fetch(`${APP_URL}/api/enhanced-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        city: targetCity || undefined,
        tier: 'paid',
      }),
    })

    if (!scanRes.ok) {
      const detail = await scanRes.text().catch(() => '')
      markFailed(sessionId)
      console.error(`[Finalize] scan failed: ${scanRes.status} ${detail.slice(0, 200)}`)
      return NextResponse.json(
        { error: 'Scan misslyckades', detail: `HTTP ${scanRes.status}` },
        { status: 500, headers: corsHeaders },
      )
    }

    const scanResult = await scanRes.json()
    saveScanResult(sessionId, scanResult)

    return NextResponse.json(
      { scanResult, fromCache: false },
      { headers: corsHeaders },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Okänt fel'
    console.error('[Finalize] error:', msg)
    return NextResponse.json(
      { error: 'Internt fel', detail: msg },
      { status: 500, headers: corsHeaders },
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
