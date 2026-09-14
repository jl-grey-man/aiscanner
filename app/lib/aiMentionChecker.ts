import { APP_URL } from './config'
import { withRetry } from './retry'
import { ASSESSMENT_TEMPERATURE } from './reportWriter'
import type { CallOpenRouterFn } from './reportWriter'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// GPT-4o-mini: cheap, has broad web training data — good for simulating ChatGPT user queries
const AI_MENTION_MODEL = 'openai/gpt-4o-mini'
// Klassificeringen av AI-svaret (Audit #4) körs mot Flash i JSON-läge — samma modell
// som övriga JSON-klassificeringar i appen (reviewInsights.ts, reportWriter.ts).
const FLASH_MODEL = 'google/gemini-2.5-flash'

/**
 * Audit #4: entityKnows sattes tidigare av en längdheuristik (`svar.length > 80`),
 * som gav `entityKnows: true` även när AI:t uttryckligen sa att det saknade
 * information (så länge svaret var långt nog / inte innehöll en av tre exakta
 * fraser). Ersatt med en riktig klassificering (`classifyEntityResponse`, Flash i
 * JSON-läge) i tre klasser — och en faktagranskning av AI:ns konkreta påståenden
 * (plats, stad, bransch) mot kända GBP-fakta, så rapporten kan visa exakt VAD AI:t
 * har fel om ("AI tror att ni ligger i Haga — fel, ni ligger på Kungsportsavenyen 27").
 */
export type EntityClassification = 'knows' | 'doesNotKnow' | 'wrongFacts'

export interface FactCheckClaim {
  /** Kort svensk beskrivning av vad AI:t påstår, t.ex. "Ligger i Haga". */
  claim: string
  verdict: 'correct' | 'wrong' | 'unverifiable'
  /** Den kända, korrekta uppgiften — bara satt när verdict === 'wrong'. */
  correctFact: string | null
}

export interface AIMentionResult {
  entityQuery: string
  entityResponse: string
  entityKnows: boolean   // = entityClassification === 'knows'
  entityClassification: EntityClassification
  entitySentiment: 'positive' | 'neutral' | 'negative' | 'unknown'
  /** Faktagranskning av AI:ns konkreta påståenden om plats/stad/bransch mot kända GBP-fakta. */
  factChecks: FactCheckClaim[]

  extractedNiche: string   // niche extracted from entity response
  categoryQuery: string
  categoryResponse: string
  categoryMentioned: boolean

  status: 'ok' | 'warning' | 'bad'
  finding: string
  fix: string
  errored: boolean   // true = a real API/network error occurred (never treat as 'bad')
}

async function callGPT(
  apiKey: string,
  query: string,
  timeoutMs = 20000
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'AI Search Scanner - AI Mention Check',
      },
      body: JSON.stringify({
        model: AI_MENTION_MODEL,
        messages: [{ role: 'user', content: query }],
        temperature: 0.3,
        max_tokens: 600,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const err = await res.text()
      console.error(`[AI Mention] OpenRouter error ${res.status}: ${err.slice(0, 200)}`)
      throw new Error(`OpenRouter ${res.status}: ${err}`)
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    console.log(`[AI Mention] Response length: ${content.length}, model: ${data.model}`)
    return content
  } catch (err: any) {
    console.error(`[AI Mention] callGPT failed: ${err.message}`)
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function mentionedInResponse(companyName: string, response: string): boolean {
  const nameLower = companyName.toLowerCase()
  const responseLower = response.toLowerCase()

  if (responseLower.includes(nameLower)) return true

  // Check significant parts (words > 4 chars)
  const parts = nameLower.split(/\s+/).filter(p => p.length > 4)
  if (parts.length > 0 && parts.every(p => responseLower.includes(p))) return true

  return false
}

function detectEntitySentiment(response: string): 'positive' | 'neutral' | 'negative' | 'unknown' {
  const pos = ['välkänd', 'populär', 'rekommenderar', 'bra', 'etablerad', 'ledande', 'pålitlig', 'hög kvalitet', 'välrenommerad']
  const neg = ['dålig', 'problem', 'klagomål', 'bedrageri', 'undvika', 'varning', 'negativ']
  const rLower = response.toLowerCase()

  const posHits = pos.filter(w => rLower.includes(w)).length
  const negHits = neg.filter(w => rLower.includes(w)).length

  if (posHits > negHits && posHits > 0) return 'positive'
  if (negHits > posHits && negHits > 0) return 'negative'
  if (response.length > 100) return 'neutral'
  return 'unknown'
}

const PLACES_NICHE_MAP: Record<string, string[]> = {
  restaurant: ['restaurang', 'mat', 'lunch', 'middag', 'kök', 'bistro', 'brunch', 'finedining', 'buffé'],
  cafe: ['café', 'kaffe', 'fika', 'konditori', 'bageri'],
  bakery: ['bageri', 'konditori', 'bröd', 'kaffe'],
  bar: ['bar', 'pub', 'dryck', 'cocktail', 'öl'],
  night_club: ['nattklubb', 'klubb', 'nöje'],
  real_estate_agency: ['mäklare', 'fastighet', 'bostad', 'lägenhet', 'villa'],
  dentist: ['tandläkare', 'tandvård', 'tand'],
  hair_care: ['frisör', 'hår', 'salong', 'klippning', 'frisörssalong'],
  beauty_salon: ['skönhet', 'salong', 'massage', 'spa', 'naglar', 'ansiktsbehandling'],
  gym: ['gym', 'träning', 'fitness', 'crossfit'],
  physiotherapist: ['fysioterapeut', 'sjukgymnast', 'rehabilitering', 'massage'],
  doctor: ['läkare', 'klinik', 'vårdcentral', 'hälsa'],
  lawyer: ['advokat', 'jurist', 'juridik'],
  accounting: ['redovisning', 'bokföring', 'revisor', 'ekonomi'],
  car_repair: ['bilverkstad', 'mekaniker', 'service', 'däck', 'bil'],
  car_dealer: ['bilhandlare', 'bil', 'fordon', 'autohandel'],
  clothing_store: ['kläder', 'mode', 'butik', 'klädaffär'],
  grocery_or_supermarket: ['livsmedel', 'mataffär', 'supermarket', 'dagligvaror'],
  pharmacy: ['apotek', 'läkemedel'],
  hotel: ['hotell', 'boende', 'övernattning', 'rum'],
  travel_agency: ['resebyrå', 'resor', 'resa', 'paketresa'],
  electrician: ['elektriker', 'el', 'elinstallation'],
  plumber: ['rörmokare', 'VVS', 'vatten', 'rör'],
  painter: ['målare', 'målning', 'renovering'],
}

async function extractNiche(
  apiKey: string,
  companyName: string,
  entityResponse: string,
  fallbackBransch: string,
  placesTypes?: string[]
): Promise<string> {
  const prompt = `Baserat på denna beskrivning av "${companyName}":
"${entityResponse.slice(0, 500)}"

Vad är deras specifika MAT- eller SERVICENISCH? Fokusera på: typ av kök (t.ex. "karibisk mat", "husmanskost", "sushi", "pizza"), eller serviceform (t.ex. "lunchbuffé", "finedining", "brunch").

Svara med 1-3 ord på svenska som passar i frågan "Vilka [svar]-ställen kan du rekommendera i [stad]?".
Bara orden — ingen förklaring. Om du inte kan avgöra nischen, svara med "${fallbackBransch}".`

  try {
    const response = await callGPT(apiKey, prompt, 10000)
    const niche = response.trim().replace(/^["']|["']$/g, '').slice(0, 60)
    if (niche.length > 3) {
      // Cross-validate against Places types if provided
      if (placesTypes && placesTypes.length > 0) {
        const nicheLower = niche.toLowerCase()
        let matchedType: string | null = null
        let hasOverlap = false

        for (const placeType of placesTypes) {
          const keywords = PLACES_NICHE_MAP[placeType]
          if (!keywords) continue
          matchedType = placeType
          if (keywords.some(kw => nicheLower.includes(kw))) {
            hasOverlap = true
            break
          }
        }

        if (matchedType && !hasOverlap) {
          console.warn(
            `[AI Mention] Niche mismatch: GPT="${niche}" vs Places="${matchedType}". Using fallback.`
          )
          return fallbackBransch
        }
      }
      return niche
    }
  } catch {
    // fall through to fallback
  }
  return fallbackBransch
}

interface EntityClassificationResult {
  classification: EntityClassification
  factChecks: FactCheckClaim[]
}

export function buildClassificationPrompt(
  companyName: string,
  city: string,
  bransch: string,
  address: string | null,
  entityResponse: string,
): string {
  const knownFacts = [
    `Företagsnamn: ${companyName}`,
    city ? `Stad: ${city}` : null,
    bransch ? `Bransch: ${bransch}` : null,
    address ? `Adress (Google Business Profile): ${address}` : null,
  ].filter(Boolean).join('\n')

  return `Du utvärderar ett AI-svar om ett specifikt företag. Svara ENDAST i giltig JSON.

KÄNDA, VERIFIERADE FAKTA (Google Business Profile):
${knownFacts}

AI-SVARET SOM SKA UTVÄRDERAS:
"${entityResponse}"

Gör två saker:

1. Klassificera svaret som ETT av:
   - "knows": svaret visar konkret, korrekt kunskap om just det här företaget — inte en generisk gissning.
   - "doesNotKnow": svaret säger uttryckligen att det saknar information, är för vagt/generiskt för att räknas som kunskap, eller beskriver ett annat/okänt företag.
   - "wrongFacts": svaret gör ett eller flera konkreta sakpåståenden om företaget (t.ex. plats, stad, bransch) som MOTSÄGER de kända fakta ovan.

2. Faktagranska: lista varje konkret, kontrollerbart sakpåstående i svaret om PLATS, STAD eller BRANSCH/NISCH (ignorera vaga omdömen som "populär" eller "bra"). För varje påstående:
   - "claim": kort svensk beskrivning av vad AI:t påstår (t.ex. "Ligger i Haga")
   - "verdict": "correct" om det stämmer mot fakta ovan, "wrong" om det motsäger fakta ovan, "unverifiable" om det inte går att kontrollera mot fakta ovan
   - "correctFact": ENDAST vid "wrong" — den korrekta uppgiften enligt fakta ovan (t.ex. "Kungsportsavenyen 27"). Annars null.

Hitta inte på påståenden som inte finns i AI-svaret. Om AI-svaret inte gör några konkreta påståenden om plats/stad/bransch: returnera en tom factChecks-lista.

Returnera EXAKT detta JSON-format, inget annat:
{
  "classification": "knows" | "doesNotKnow" | "wrongFacts",
  "factChecks": [
    { "claim": "...", "verdict": "correct" | "wrong" | "unverifiable", "correctFact": "..." | null }
  ]
}`
}

/** Exporterad separat för tester — kastar vid ogiltig/oanvändbar klassificering. */
export function validateClassification(raw: unknown): EntityClassificationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Klassificeringssvaret var inte ett JSON-objekt')
  }
  const obj = raw as Record<string, unknown>

  const validClassifications = new Set(['knows', 'doesNotKnow', 'wrongFacts'])
  if (!validClassifications.has(obj.classification as string)) {
    throw new Error(`Ogiltig klassificering i AI-svaret: ${String(obj.classification)}`)
  }
  const classification = obj.classification as EntityClassification

  const validVerdicts = new Set(['correct', 'wrong', 'unverifiable'])
  const factChecksRaw = Array.isArray(obj.factChecks) ? obj.factChecks : []
  const factChecks: FactCheckClaim[] = factChecksRaw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter((c) => typeof c.claim === 'string' && c.claim.trim().length > 0 && validVerdicts.has(c.verdict as string))
    .map((c) => ({
      claim: (c.claim as string).trim(),
      verdict: c.verdict as FactCheckClaim['verdict'],
      correctFact:
        c.verdict === 'wrong' && typeof c.correctFact === 'string' && c.correctFact.trim().length > 0
          ? (c.correctFact as string).trim()
          : null,
    }))
    .slice(0, 10)

  return { classification, factChecks }
}

/**
 * Klassificerar AI:ns svar om företaget mot kända fakta (Flash, JSON-läge, med retry
 * — samma mönster som reviewInsights.ts/reportWriter.ts). Kastar vid permanent fel
 * eller trasigt/ogiltigt svar efter retry — checkAIMentions() fångar det och mappar
 * hela checken till notMeasured (aldrig 'bad'), se Task 9-mönstret.
 */
async function classifyEntityResponse(
  companyName: string,
  city: string,
  bransch: string,
  address: string | null,
  entityResponse: string,
  call: CallOpenRouterFn,
): Promise<EntityClassificationResult> {
  const prompt = buildClassificationPrompt(companyName, city, bransch, address, entityResponse)
  const systemPrompt = 'Du är en svensk AI-sökningsanalytiker. Svara ENDAST i giltig JSON. Ingen markdown, ingen text utanför JSON.'
  // Valideringen körs INNANFÖR försöket (samma mönster som JSON-parsningen i
  // callOpenRouterOnce/route.ts) — en syntaktiskt giltig men semantiskt oanvändbar
  // klassificering (fel enum-värde) ger då ett nytt Flash-anrop i stället för att
  // direkt falla till notMeasured.
  return withRetry(
    async () => {
      const raw = await call(FLASH_MODEL, systemPrompt, prompt, 20000, false, 1200, ASSESSMENT_TEMPERATURE)
      return validateClassification(raw)
    },
    { attempts: 2, baseDelayMs: 1000, isRetryable: (err) => !(err as { permanent?: boolean })?.permanent },
  )
}

export async function checkAIMentions(
  companyName: string,
  city: string,
  bransch: string,
  apiKey: string,
  call: CallOpenRouterFn,
  placesTypes?: string[],
  address?: string | null,
): Promise<AIMentionResult> {
  try {
    return await runAIMentionCheck(companyName, city, bransch, apiKey, call, placesTypes, address ?? null)
  } catch (err: any) {
    // A real API/network error — either the entity/category GPT call, or the Flash
    // classification (Audit #4) — never let this collapse into a 'bad' verdict.
    // checkBuilder.ts maps errored:true to status 'notMeasured' regardless of the
    // fields below.
    console.error(`[AI Mention] checkAIMentions failed: ${err.message}`)
    return {
      entityQuery: '',
      entityResponse: '',
      entityKnows: false,
      entityClassification: 'doesNotKnow',
      entitySentiment: 'unknown',
      factChecks: [],
      extractedNiche: bransch,
      categoryQuery: '',
      categoryResponse: '',
      categoryMentioned: false,
      status: 'bad',
      finding: '',
      fix: '',
      errored: true,
    }
  }
}

async function runAIMentionCheck(
  companyName: string,
  city: string,
  bransch: string,
  apiKey: string,
  call: CallOpenRouterFn,
  placesTypes: string[] | undefined,
  address: string | null,
): Promise<AIMentionResult> {
  // Step 1: Entity query — what does AI know about this company?
  const entityQuery = `Vad vet du om "${companyName}" i ${city || 'Sverige'}? Berätta vad du känner till om företaget.`
  const entityResponse = await callGPT(apiKey, entityQuery)

  // Step 1b (Audit #4): classify the answer + fact-check its concrete claims against
  // known GBP data, instead of a length/keyword heuristic.
  const { classification, factChecks } = await classifyEntityResponse(
    companyName, city, bransch, address, entityResponse, call
  )
  const entityKnows = classification === 'knows'

  const entitySentiment = entityKnows ? detectEntitySentiment(entityResponse) : 'unknown'

  // Step 2: Extract specific niche from entity response (if company is known)
  // Falls back to generic bransch if company unknown or extraction fails
  const extractedNiche = entityKnows
    ? await extractNiche(apiKey, companyName, entityResponse, bransch, placesTypes)
    : bransch

  // Step 3: Fresh category query — only run if we have a specific city (never use "Sverige")
  const categoryQuery = city
    ? `Var hittar jag bra ${extractedNiche.toLowerCase()} i ${city}?`
    : ''
  const categoryResponse = city
    ? await callGPT(apiKey, categoryQuery)
    : ''

  const categoryMentioned = categoryResponse
    ? mentionedInResponse(companyName, categoryResponse)
    : false

  let status: 'ok' | 'warning' | 'bad'
  let finding: string
  let fix: string

  if (classification === 'wrongFacts') {
    // Audit #4: aktiv felinformation är värre än att inte synas alls — AI:t kan skicka
    // kunder till fel adress eller beskriva fel bransch. Alltid 'bad', oavsett
    // categoryMentioned.
    status = 'bad'
    const wrongClaims = factChecks.filter((c) => c.verdict === 'wrong')
    finding = wrongClaims.length > 0
      ? `AI ger felaktig information om företaget: ${wrongClaims
          .map((c) => `tror att "${c.claim}"${c.correctFact ? ` — men rätt uppgift är "${c.correctFact}"` : ''}`)
          .join('; ')}.`
      : 'AI ger felaktig information om företaget som motsäger verifierade uppgifter.'
    fix = 'Rätta bilden AI har av er: se till att adress, stad och bransch är konsekventa och tydligt strukturerade i Google Business Profile, schema-markup (LocalBusiness) och kataloger som Eniro/Hitta — AI-modeller tränas delvis på den typen av data.'
  } else if (entityKnows && categoryMentioned) {
    status = 'ok'
    finding = `AI känner till företaget och nämner det i nischsökningar ("${extractedNiche}"). Stark entitetsprofil.`
    fix = ''
  } else if (entityKnows && !categoryMentioned) {
    status = 'warning'
    finding = city
      ? `AI har information om företaget men nämner det inte spontant vid sökning på "${extractedNiche}" i ${city}.`
      : `AI har information om företaget men kategoritest kunde inte köras (ingen stad identifierad).`
    fix = 'Stärk lokala signaler: fler kataloger, lokalt innehåll på sajten, fler recensioner med ortnamnet nämnda.'
  } else if (!entityKnows && categoryMentioned) {
    status = 'warning'
    finding = `AI nämner företaget i nischsökningar men har begränsad företagsspecifik information.`
    fix = 'Stärk E-A-T: mer om-oss-innehåll, namngivna medarbetare, organisationsnummer synligt, branschorganisationer.'
  } else {
    status = 'bad'
    finding = `AI (GPT-4o) känner inte till företaget och nämner det inte i nischsökningar.`
    fix = 'Prioritera: (1) Registrera på Eniro och Hitta — AI tränas på katalogdata. (2) Skapa/optimera Google Business Profile. (3) Bygg FAQ-innehåll och schema-markup som AI kan indexera och citera.'
  }

  return {
    entityQuery,
    entityResponse,
    entityKnows,
    entityClassification: classification,
    entitySentiment,
    factChecks,
    extractedNiche,
    categoryQuery,
    categoryResponse,
    categoryMentioned,
    status,
    finding,
    fix,
    errored: false,
  }
}
