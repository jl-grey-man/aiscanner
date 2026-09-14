/**
 * synthesisBudget.ts — Z3: total tidsbudget för Pro-syntesens retry-race.
 *
 * Bakgrund: den paid-syntesen kör Pro (primär) och Flash (alltid redo-reserv)
 * parallellt via callOpenRouter — en generisk withRetry-wrapper (attempts: 3,
 * inget tak på total tid). Vid transienta fel (429/5xx) kunde Pro-anropet därför
 * göra upp till 3 × 120 s = 360 s+ INNAN Flash-reserven användes (X2:s observation)
 * — ett enskilt betalt scan kunde då dra ut mot 6 minuter, långt över den
 * dokumenterade ~100–170 s-normalen.
 *
 * callWithDeadline() är samma retry-semantik som callOpenRouter (withRetry,
 * permanenta fel retryas aldrig), men bunden av en delad deadline: varje nytt
 * försök krymper sin timeout till vad som faktiskt är kvar av budgeten, och ett
 * nytt försök startas aldrig om det inte finns minst MIN_SYNTHESIS_CALL_MS kvar
 * (kastar ett fel med budgetExhausted: true i stället). route.ts ger Pro- och
 * Flash-anropet SAMMA deadline (start + SYNTHESIS_BUDGET_MS) — Flash-reserven är
 * alltså bunden av precis samma budget, inte lämnad okontrollerad, men vinner
 * fortfarande om Pro misslyckas eftersom fallback-logiken i route.ts är oförändrad.
 */

import { withRetry } from './retry'
import type { CallOpenRouterFn } from './reportWriter'

/** Under denna återstående tid startas inget nytt försök — det skulle ändå inte hinna svara. */
export const MIN_SYNTHESIS_CALL_MS = 15_000

export interface CallWithDeadlineOptions {
  /** Max antal försök (inkl. det första). Default 3, samma som callOpenRouter. */
  attempts?: number
  /** Bas-fördröjning för withRetry:s exponentiella backoff. Default 1000 ms. */
  baseDelayMs?: number
  /** Klocka (injiceras i tester). Default Date.now. */
  now?: () => number
}

/**
 * Som callOpenRouter (route.ts), men varje försök är bundet av `deadline`
 * (en Date.now()-baserad tidsstämpel som anroparen väljer, t.ex. `Date.now() +
 * SYNTHESIS_BUDGET_MS`, delad mellan flera parallella anrop). Kastar ett fel
 * med `budgetExhausted: true` om det inte finns tid kvar för ett nytt försök —
 * det felet retryas aldrig (precis som `permanent: true`-fel).
 */
export async function callWithDeadline(
  call: CallOpenRouterFn,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  deadline: number,
  expectMarkdown = false,
  maxTokensOverride?: number,
  temperature?: number,
  options: CallWithDeadlineOptions = {},
): Promise<any> {
  const { attempts = 3, baseDelayMs = 1000, now = Date.now } = options

  return withRetry(
    async () => {
      const available = deadline - now()
      if (available < MIN_SYNTHESIS_CALL_MS) {
        const err = new Error(
          `Tidsbudgeten räcker inte för ett nytt ${model}-försök (${Math.max(0, Math.round(available / 1000))} s kvar)`
        )
        ;(err as any).budgetExhausted = true
        throw err
      }
      return call(model, systemPrompt, userPrompt, Math.min(timeoutMs, available), expectMarkdown, maxTokensOverride, temperature)
    },
    {
      attempts,
      baseDelayMs,
      isRetryable: (err) => !(err as any)?.permanent && !(err as any)?.budgetExhausted,
    }
  )
}
