import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createCheckout } from '@/app/lib/checkoutDb'
import { APP_URL } from '@/app/lib/config'

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  // Använd default apiVersion från Stripe-paketet
  typescript: true,
})

// Pris för premiumrapport (öre, SEK)
const PRICE_AMOUNT_ORE = 49900
const CURRENCY = 'sek'

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const { url, city } = await req.json()
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json(
        { error: 'Ogiltig URL' },
        { status: 400, headers: corsHeaders },
      )
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            unit_amount: PRICE_AMOUNT_ORE,
            product_data: {
              name: 'Premiumrapport — AI-synlighetsanalys',
              description: `Fullständig analys av ${url} med konkreta åtgärder, AI-omnämnande-test, konkurrentjämförelse och recensionsanalys.`,
            },
          },
          quantity: 1,
        },
      ],
      // Stripe fyller i {CHECKOUT_SESSION_ID} när användaren returnerar
      success_url: `${APP_URL}/report?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/?cancelled=1`,
      // Metadata speglar vad vi sparar i SQLite — användbart för debugging via Stripe-dashboarden
      metadata: {
        url,
        city: city ?? '',
      },
      // Spara user-mail i Stripe automatiskt
      customer_creation: 'always',
      // Svensk lokalisering
      locale: 'sv',
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe returnerade ingen checkout-URL' },
        { status: 500, headers: corsHeaders },
      )
    }

    // Spara i DB så vi kan slå upp url+city vid retur från Stripe
    createCheckout(session.id, url, city ?? null)

    console.log(`[Checkout] created session ${session.id} for ${url}`)

    return NextResponse.json(
      { url: session.url, sessionId: session.id },
      { headers: corsHeaders },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Okänt fel'
    console.error('[Checkout] error:', msg)
    return NextResponse.json(
      { error: 'Kunde inte starta betalning', detail: msg },
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
