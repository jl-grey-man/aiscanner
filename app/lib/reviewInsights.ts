/**
 * reviewInsights.ts — Audit #9 (recensionsdelen): grounded review-theme extraction.
 *
 * Paid tier only. Google Places API (New) gives us up to 5 real review texts per
 * scan (API cap) — no more, no less. This module sends those verbatim texts to a
 * Flash JSON-mode call and asks for recurring themes/praise/complaints with a
 * supporting quote per theme, then throws away any theme whose quote is not an
 * exact substring of a real review text. The model can propose themes; it cannot
 * invent evidence — validateReviewInsights() is the enforcement point.
 *
 * Related: Audit #3 (app/api/enhanced-scan/route.ts, analyzeReviewReplies) found
 * that the same Places API Review object has no owner-reply field at all, so a
 * "reply rate" can never be measured from it either — kept separate from this
 * module because it's a different, structural limitation (no data exists to
 * validate), not something a quote-check can fix.
 *
 * Places policy — "You must always credit the author when displaying photos or
 * reviews" (verified against developers.google.com/maps/documentation/places/
 * web-service/policies, 2026-09-14): every quote carries `authorName`/`authorUri`
 * (Review.authorAttribution.displayName/uri) so PremiumReport can show a link to
 * the reviewer's profile next to their quote. Author name/uri are Places content
 * just like the quote itself — never persisted (placesContent.ts strips them
 * before storage and re-derives them from fresh Places data on read).
 */

import { withRetry } from './retry'
import type { CallOpenRouterFn } from './reportWriter'

const FLASH_MODEL = 'google/gemini-2.5-flash'

export interface ReviewInsightTheme {
  theme: string
  sentiment: 'positive' | 'negative' | 'mixed'
  quote: string
  // Places policy: "You must always credit the author when displaying photos or
  // reviews" — namn + länk till profilen för recensionen citatet kom ifrån.
  // null när recensionen saknar authorAttribution.
  authorName: string | null
  authorUri: string | null
}

export interface ReviewInsights {
  themes: ReviewInsightTheme[]
  praise: string[]
  complaints: string[]
  sampleNote: string
}

export interface ReviewForInsights {
  rating: number | null
  text: string
  authorName: string | null
  authorUri: string | null
}

/**
 * Plockar ut upp till 5 riktiga recensionstexter (betyg + ordagrann text + författar-
 * attribution) ur en rå Places `reviews`-array. Places API (New) ger max 5 recensioner
 * per anrop och har ingen sortering/paginering — detta är hela stickprovet vi någonsin
 * har. `authorAttribution.displayName`/`.uri` följer med varje Review-objekt (fältmasken
 * 'reviews' i places.ts hämtar hela resursen) — krävs för att kreditera författaren
 * (Places policy) vid varje citat i reviewInsights.
 */
export function extractReviewTexts(reviews: unknown): ReviewForInsights[] {
  if (!Array.isArray(reviews)) return []
  return reviews
    .map((r): ReviewForInsights => {
      const rec = r as Record<string, unknown>
      const ratingVal = rec?.rating
      const textObj = rec?.text as Record<string, unknown> | undefined
      const author = rec?.authorAttribution as Record<string, unknown> | undefined
      return {
        rating: typeof ratingVal === 'number' ? ratingVal : null,
        text: typeof textObj?.text === 'string' ? textObj.text.trim() : '',
        authorName: typeof author?.displayName === 'string' && author.displayName.trim() ? author.displayName.trim() : null,
        authorUri: typeof author?.uri === 'string' && author.uri.trim() ? author.uri.trim() : null,
      }
    })
    .filter((r) => r.text.length > 0)
    .slice(0, 5)
}

export function buildReviewInsightsPrompt(
  reviews: ReviewForInsights[],
  meta: { companyName: string; bransch: string },
): string {
  const reviewBlock = reviews
    .map((r, i) => `${i + 1}. Betyg: ${r.rating ?? 'okänt'}/5\n"${r.text}"`)
    .join('\n\n')

  return `Analysera dessa ${reviews.length} riktiga Google-recensioner av "${meta.companyName}" (${meta.bransch}). Svara ENDAST i giltig JSON.

RECENSIONER:
${reviewBlock}

Identifiera återkommande TEMAN, BERÖM och KLAGOMÅL. VARJE tema MÅSTE ha ett "quote"-fält som är ett ORDAGRANT utdrag (exakt kopierat, oförändrat, samma tecken) ur en av recensionstexterna ovan — hitta ALDRIG på ett citat och skriv aldrig om det. Om inget tema har stöd i texten: lämna listan tom.

Returnera exakt detta JSON-format:
{
  "themes": [
    { "theme": "kort temanamn, t.ex. \\"Trevlig personal\\"", "sentiment": "positive|negative|mixed", "quote": "ordagrant utdrag ur en recension" }
  ],
  "praise": ["kort punkt om vad kunder gillar, baserat ENBART på recensionerna ovan"],
  "complaints": ["kort punkt om vad kunder klagar på, baserat ENBART på recensionerna ovan — tom lista om inget klagomål finns"],
  "sampleNote": "en mening på svenska om att detta baseras på ett stickprov (Google Places API ger max 5 recensioner, ingen sortering)"
}

REGLER:
- Max 5 teman.
- quote MÅSTE vara ett exakt substräng-utdrag ur en av recensionerna ovan (samma tecken, inget omskrivet, ingen översättning, ingen sammanfattning).
- Hitta ALDRIG på recensioner, citat eller teman som inte finns i texten ovan.
- Alla texter på svenska (citat undantagna — de ska stå exakt som i originalet, oavsett språk).
- Returnera ENBART giltig JSON — inga markdown-kodblock, ingen text utanför JSON.`
}

/**
 * Behåller bara teman vars citat är ett ordagrant utdrag (exakt substräng) ur någon
 * av de faktiska recensionstexterna — kastar allt annat. Detta är hela poängen med
 * modulen: modellen får föreslå teman men aldrig hitta på belägg för dem.
 *
 * Tar hela recensionsobjekt (inte bara texterna) för att kunna kreditera rätt
 * författare (Places policy) — se `ReviewInsightTheme.authorName/authorUri`: citatets
 * författare hittas genom att slå upp vilken recension som innehåller det exakta
 * utdraget. Matchar flera recensioner samma utdrag (osannolikt, men möjligt vid korta
 * citat) används den första — samma ordning som citatvalideringen redan litar på.
 *
 * Exporterad separat för tester.
 */
export function validateReviewInsights(
  raw: unknown,
  reviews: Pick<ReviewForInsights, 'text' | 'authorName' | 'authorUri'>[],
): ReviewInsights | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const validSentiments = new Set(['positive', 'negative', 'mixed'])
  const themesRaw = Array.isArray(obj.themes) ? obj.themes : []
  const themes: ReviewInsightTheme[] = themesRaw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter((t) => {
      const quote = typeof t.quote === 'string' ? t.quote.trim() : ''
      return (
        typeof t.theme === 'string' && t.theme.trim().length > 0 &&
        validSentiments.has(t.sentiment as string) &&
        quote.length > 0 &&
        reviews.some((r) => r.text.includes(quote))
      )
    })
    .map((t) => {
      const quote = (t.quote as string).trim()
      const source = reviews.find((r) => r.text.includes(quote))
      return {
        theme: (t.theme as string).trim(),
        sentiment: t.sentiment as ReviewInsightTheme['sentiment'],
        quote,
        authorName: source?.authorName ?? null,
        authorUri: source?.authorUri ?? null,
      }
    })
    .slice(0, 5)

  const strArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : []

  const praise = strArray(obj.praise)
  const complaints = strArray(obj.complaints)
  const sampleNote = typeof obj.sampleNote === 'string' ? obj.sampleNote.trim() : ''

  // Inget att visa alls (varken verifierade citat eller allmänt beröm/klagomål) → hellre
  // null (döljs i UI) än ett tomt kort.
  if (themes.length === 0 && praise.length === 0 && complaints.length === 0) return null

  return { themes, praise, complaints, sampleNote }
}

/**
 * Skickar de faktiska recensionstexterna (max 5, Places API-gränsen) till en Flash-
 * analys i JSON-läge och returnerar validerade, faktaförankrade recensionsinsikter.
 * Returnerar null om det inte finns några recensionstexter att analysera, eller om
 * AI-svaret inte innehöll ett enda citat som gick att verifiera ordagrant.
 *
 * `call` gör ETT anrop (ingen egen retry — se app/api/enhanced-scan/route.ts
 * callOpenRouterOnce) — retry sköts här via withRetry, samma mönster som
 * reportWriter.ts.
 */
export async function analyzeReviewInsights(
  reviews: unknown,
  meta: { companyName: string; bransch: string },
  call: CallOpenRouterFn,
): Promise<ReviewInsights | null> {
  const reviewTexts = extractReviewTexts(reviews)
  if (reviewTexts.length === 0) return null

  const prompt = buildReviewInsightsPrompt(reviewTexts, meta)
  const systemPrompt = 'Du är en svensk AI-sökningsanalytiker. Svara ENDAST i giltig JSON. Ingen markdown, ingen text utanför JSON.'

  try {
    const raw = await withRetry(
      () => call(FLASH_MODEL, systemPrompt, prompt, 30000, false, 2000),
      { attempts: 2, baseDelayMs: 1000, isRetryable: (err) => !(err as { permanent?: boolean })?.permanent },
    )
    return validateReviewInsights(raw, reviewTexts)
  } catch (err) {
    console.error('[ReviewInsights] Kunde inte generera:', (err as Error).message)
    return null
  }
}
