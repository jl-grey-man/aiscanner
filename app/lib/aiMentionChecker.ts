const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// GPT-4o-mini: cheap, has broad web training data — good for simulating ChatGPT user queries
const AI_MENTION_MODEL = 'openai/gpt-4o-mini'

export interface AIMentionResult {
  entityQuery: string
  entityResponse: string
  entityKnows: boolean
  entitySentiment: 'positive' | 'neutral' | 'negative' | 'unknown'

  extractedNiche: string   // niche extracted from entity response
  categoryQuery: string
  categoryResponse: string
  categoryMentioned: boolean

  status: 'ok' | 'warning' | 'bad'
  finding: string
  fix: string
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
        'HTTP-Referer': 'https://analyze.pipod.net',
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

export async function checkAIMentions(
  companyName: string,
  city: string,
  bransch: string,
  apiKey: string,
  placesTypes?: string[]
): Promise<AIMentionResult> {
  // Step 1: Entity query — what does AI know about this company?
  const entityQuery = `Vad vet du om "${companyName}" i ${city || 'Sverige'}? Berätta vad du känner till om företaget.`
  const entityResponse = await callGPT(apiKey, entityQuery).catch(() => '')

  const entityKnows = entityResponse.length > 80
    && !entityResponse.toLowerCase().includes('har ingen information')
    && !entityResponse.toLowerCase().includes('känner inte till')
    && !entityResponse.toLowerCase().includes('vet inte')

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
    ? await callGPT(apiKey, categoryQuery).catch(() => '')
    : ''

  const categoryMentioned = categoryResponse
    ? mentionedInResponse(companyName, categoryResponse)
    : false

  let status: 'ok' | 'warning' | 'bad'
  let finding: string
  let fix: string

  if (entityKnows && categoryMentioned) {
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
    entitySentiment,
    extractedNiche,
    categoryQuery,
    categoryResponse,
    categoryMentioned,
    status,
    finding,
    fix,
  }
}
