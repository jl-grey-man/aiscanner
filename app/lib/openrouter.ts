/**
 * openrouter.ts — Centraliserad OpenRouter-konfiguration (dataskydd).
 *
 * Places-data och kunddata (företagsnamn, adress, telefon, recensioner, e-post, ...)
 * skickas till OpenRouter i varenda prompt i app/ — tekniska/FAQ/E-A-T-bedömningar
 * och syntesen i enhanced-scan/route.ts, Report Writer, recensionsinsikter, och
 * AI-omnämnandetestet i aiMentionChecker.ts.
 *
 * OpenRouter ruttar som DEFAULT till providers som får logga/lagra/träna på
 * prompt-data (`provider.data_collection` default = "allow" — verifierat
 * 2026-09-14 mot openrouter.ai/docs/features/provider-routing). Satt till "deny"
 * begränsas routningen till providers UTAN datalagring/träning på prompten.
 * Verifierat 2026-09-14 (riktiga anrop, HTTP 200 med denna parameter) att minst en
 * sådan provider finns för alla tre modeller appen använder: google/gemini-2.5-flash,
 * google/gemini-2.5-pro, openai/gpt-4o-mini.
 *
 * VARJE direkt fetch-anrop mot openrouter.ai i app/ MÅSTE bygga sin body med
 * buildOpenRouterRequestBody() nedan — aldrig ett eget `provider`-fält, och aldrig
 * URL:en som en egen sträng — så parametern inte kan glömmas bort på ett nytt
 * anropsställe. tests/openrouter.test.ts har ett regressionsskydd som grep:ar app/
 * efter `openrouter.ai`/`data_collection` utanför den här filen.
 */

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Tvingar OpenRouter att bara rutta till providers med data_collection: "deny". */
export const OPENROUTER_PRIVACY_PROVIDER = { data_collection: 'deny' } as const

export interface OpenRouterMessage {
  role: 'system' | 'user'
  content: string
}

export interface OpenRouterRequestParams {
  model: string
  messages: OpenRouterMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
}

/**
 * Bygger request-bodyn för ETT OpenRouter chat/completions-anrop.
 * `provider` sätts alltid till OPENROUTER_PRIVACY_PROVIDER — anropsstället kan inte
 * skriva över det (fältet finns inte i OpenRouterRequestParams).
 */
export function buildOpenRouterRequestBody(params: OpenRouterRequestParams): Record<string, unknown> {
  return {
    ...params,
    provider: OPENROUTER_PRIVACY_PROVIDER,
  }
}
