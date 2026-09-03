import Stripe from 'stripe'

let stripe: Stripe | null = null

/**
 * Lazy Stripe-instans — initieras först vid första anropet (runtime).
 *
 * Varför: `next build` samlar page data för route-handlers vid byggtid,
 * och en top-level `new Stripe(...)` kräver att STRIPE_API_KEY finns i
 * build-miljön. Utan den kraschade hela bygget ("Neither apiKey nor
 * config.authenticator provided") → Railway-deploys FAILED sedan 2026-05-18.
 * Med lazy-init fungerar bygget utan nyckel; vid runtime används
 * STRIPE_API_KEY från Railway-variablerna.
 */
export function getStripe(): Stripe {
  if (!stripe) {
    const apiKey = process.env.STRIPE_API_KEY
    if (!apiKey) {
      throw new Error('STRIPE_API_KEY saknas — sätt variabeln i Railway')
    }
    stripe = new Stripe(apiKey, { typescript: true })
  }
  return stripe
}
