import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeWebsite } from '@/app/lib/scraper'
import { scrapeEnhanced } from '@/app/lib/enhancedScraper'
import { findBusinessByUrl, getPlaceDetails, findNearbyCompetitors } from '@/app/lib/places'
import type { NearbyCompetitor } from '@/app/lib/places'
import { checkSwedishDirectories } from '@/app/lib/directoryChecker'
import { checkAIMentions } from '@/app/lib/aiMentionChecker'
import { getCwvMetrics } from '@/app/lib/pageSpeed'
import { buildCheckResults } from '@/app/lib/checkBuilder'
import { calculateScores, ScanResultSchema, CHECK_REGISTRY } from '@/app/lib/scanResult'
import type { ScanResult, CheckResult } from '@/app/lib/scanResult'
import { enrichChecksWithReportWriter, applyRichData } from '@/app/lib/reportWriter'
import { APP_URL } from '@/app/lib/config'
import { assertPublicUrl } from '@/app/lib/safeFetch'
import { checkLimit, getClientIp } from '@/app/lib/rateLimit'
import { withRetry } from '@/app/lib/retry'
import { buildVerifiedFacts, formatFactsForPrompt, GROUNDING_RULES, groundReport } from '@/app/lib/factGuard'
import type { VerifiedFacts } from '@/app/lib/factGuard'
import { deriveBransch } from '@/app/lib/bransch'
import { analyzeReviewInsights } from '@/app/lib/reviewInsights'
import type { ReviewInsightsData } from '@/app/lib/scanResult'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

const FLASH_MODEL = 'google/gemini-2.5-flash'
const PRO_MODEL = 'google/gemini-2.5-pro'

function rateLimitResponse(retryAfterSec: number, headers: Record<string, string>) {
  return NextResponse.json(
    { error: 'För många förfrågningar — försök igen om en stund.' },
    { status: 429, headers: { ...headers, 'Retry-After': String(retryAfterSec) } },
  )
}

function extractJson(text: string): any {
  const trimmed = text.trim()

  try { return JSON.parse(trimmed) } catch { /* continue */ }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()) } catch { /* continue */ }
  }

  let depth = 0
  let start = -1
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{' || trimmed[i] === '[') {
      if (depth === 0) start = i
      depth++
    } else if (trimmed[i] === '}' || trimmed[i] === ']') {
      depth--
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(trimmed.slice(start, i + 1)) } catch { /* continue */ }
      }
    }
  }

  const greedy = trimmed.match(/\{[\s\S]*\}/)
  if (greedy) {
    try { return JSON.parse(greedy[0]) } catch { /* continue */ }
  }

  throw new Error('Kunde inte tolka AI-svaret som JSON')
}

/** En enda försök: fetch + (för JSON-svar) parsning. Kastar vid nätverksfel, icke-2xx eller trasig JSON. */
async function callOpenRouterOnce(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown: boolean,
  maxTokensOverride?: number,
): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'AI Search Scanner Enhanced',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokensOverride ?? (expectMarkdown ? 12000 : 6000),
        ...(expectMarkdown ? {} : { response_format: { type: 'json_object' } }),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      const err = new Error(`OpenRouter ${res.status}: ${text}`)
      // Permanenta klientfel (4xx utom 429) ska inte retryas — bara transienta fel
      // (429 rate limit, 5xx, nätverksfel, trasig JSON) är värda ett nytt försök.
      if (res.status !== 429 && res.status < 500) {
        ;(err as any).permanent = true
      }
      throw err
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content.trim()) throw new Error('Tomt AI-svar')

    if (expectMarkdown) return content
    // JSON-parsning sker HÄR, innanför försöket — en trasig generation ger ett
    // nytt LLM-anrop (via withRetry i callOpenRouter) i stället för notMeasured.
    return extractJson(content)
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown = false,
  maxTokensOverride?: number,
): Promise<any> {
  return withRetry(
    () => callOpenRouterOnce(model, systemPrompt, userPrompt, timeoutMs, expectMarkdown, maxTokensOverride),
    {
      attempts: 3,
      baseDelayMs: 1000,
      isRetryable: (err) => !(err as any)?.permanent,
    }
  )
}

function buildTechnicalPrompt(data: {
  robotsTxt: string
  aiCrawlersBlocked: string[]
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  socialLinks: string[]
  sameAsLinks: string[]
  hreflangTags: string[]
  isHttps: boolean
  llmsTxt: string | null
  canonical: string | null
  hasGoogleMaps: boolean
  menuSummary: string
}): string {
  const allSocialLinks = [...new Set([...data.socialLinks, ...data.sameAsLinks])]
  return `Analysera dessa tekniska SEO-signaler för en svensk webbplats. Svara ENDAST i JSON.

HTTPS: ${data.isHttps ? 'Ja (https://)' : 'Nej (http://)'}

ROBOTS.TXT (första 1500 tecken):
${data.robotsTxt || '(saknas)'}

AI-CRAWLERS SOM BLOCKERAS: ${data.aiCrawlersBlocked.length > 0 ? data.aiCrawlersBlocked.join(', ') : 'Inga blockerade'}

OPEN GRAPH:
- og:title: ${data.ogTitle || '(saknas)'}
- og:description: ${data.ogDescription || '(saknas)'}
- og:image: ${data.ogImage || '(saknas)'}

SOCIALA LÄNKAR HITTADE: ${allSocialLinks.length > 0 ? allSocialLinks.join(', ') : 'Inga'}

HREFLANG-TAGGAR: ${data.hreflangTags.length > 0 ? data.hreflangTags.join(', ') : 'Inga'}

LLMS.TXT (första 1000 tecken):
${data.llmsTxt ? data.llmsTxt.slice(0, 1000) : '(saknas)'}

CANONICAL-TAGG: ${data.canonical || '(saknas)'}

GOOGLE MAPS-INBÄDDNING: ${data.hasGoogleMaps ? 'Ja' : 'Nej'}

MENY-SAMMANFATTNING: ${data.menuSummary || '(saknas)'}

Returnera exakt detta JSON-format:
{
  "https": {
    "status": "ok|bad",
    "exists": true|false,
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd om det behövs"
  },
  "aiCrawlers": {
    "status": "ok|warning|bad",
    "blocked": ["lista av blockerade crawlers"],
    "finding": "kort beskrivning av vad som hittades",
    "fix": "konkret åtgärd om det behövs"
  },
  "ogTags": {
    "status": "ok|warning|bad",
    "missing": ["lista av saknade OG-taggar"],
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd",
    "codeExample": "färdig HTML-kod för saknade OG-taggar"
  },
  "socialPresence": {
    "status": "ok|warning|bad",
    "found": ["lista av hittade plattformar"],
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd"
  },
  "hreflang": {
    "status": "ok|warning|bad|notApplicable",
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd om det behövs"
  },
  "llmsTxt": {
    "status": "ok|warning|bad",
    "exists": true|false,
    "finding": "kort beskrivning av vad filen innehåller eller varför den saknas",
    "fix": "konkret åtgärd om det behövs"
  }
}

REGLER:
- https: "ok" = webbplatsen använder https, "bad" = http (säkerhetsrisk, påverkar ranking)
- aiCrawlers: "ok" = inga AI-crawlers blockerade (bra för AI-synlighet), "bad" = viktiga crawlers blockerade
- ogTags: "ok" = alla tre finns, "warning" = någon saknas, "bad" = alla saknas
- socialPresence: "ok" = 3+ plattformar, "warning" = 1-2, "bad" = inga
- hreflang: "notApplicable" om sajten bara har ett språk, annars bedöm om implementationen är korrekt
- llmsTxt: "ok" = filen finns och är välstrukturerad, "warning" = finns men saknar viktigt innehåll, "bad" = saknas helt
- Alla texter på svenska`
}

function buildFAQContentPrompt(data: {
  hasFAQSchema: boolean
  faqQuestions: string[]
  hasFAQContent: boolean
  sitemapPageCount: number
  hasBlogOrGuide: boolean
  blogPaths: string[]
  hasServiceSchema: boolean
  hasMenuSchema: boolean
  serviceSchemaTypes: string[]
  bransch: string
}): string {
  return `Analysera FAQ och innehållsdjup för en svensk webbplats i branschen "${data.bransch}". Svara ENDAST i JSON.

FAQ-SCHEMA (FAQPage JSON-LD): ${data.hasFAQSchema ? 'Ja' : 'Nej'}
FAQ-FRÅGOR HITTADE: ${data.faqQuestions.length > 0 ? data.faqQuestions.join(' | ') : 'Inga'}
FAQ-INNEHÅLL I HTML (dl/dt/dd, details/summary, faq-element): ${data.hasFAQContent ? 'Ja' : 'Nej'}

SITEMAP:
- Antal sidor: ${data.sitemapPageCount || 'Okänt (sitemap saknas)'}
- Blogg/Guide-innehåll: ${data.hasBlogOrGuide ? 'Ja' : 'Nej'}
- Blog-sökvägar: ${data.blogPaths.slice(0, 10).join(', ') || 'Inga'}

SERVICE/PRODUKT-SCHEMA:
- Service-schema: ${data.hasServiceSchema ? 'Ja' : 'Nej'}
- Menu-schema: ${data.hasMenuSchema ? 'Ja' : 'Nej'}
- Schema-typer: ${data.serviceSchemaTypes.join(', ') || 'Inga'}

Returnera exakt detta JSON-format:
{
  "faqSchema": {
    "status": "ok|warning|bad",
    "questionsFound": ["befintliga frågor om de finns"],
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd",
    "codeExample": "Färdig FAQPage JSON-LD med 3 relevanta frågor för branschen ${data.bransch}. Skriv frågorna på svenska."
  },
  "contentDepth": {
    "status": "ok|warning|bad",
    "pageCount": ${data.sitemapPageCount},
    "hasBlog": ${data.hasBlogOrGuide},
    "finding": "kort beskrivning av innehållsdjupet",
    "fix": "konkret åtgärd för att förbättra"
  },
  "serviceSchema": {
    "status": "ok|warning|bad",
    "typesFound": ["hittade schema-typer"],
    "finding": "kort beskrivning",
    "fix": "konkret åtgärd",
    "codeExample": "Färdig Service JSON-LD om det saknas, anpassad för branschen"
  }
}

REGLER:
- faqSchema: "ok" = FAQPage-schema finns med frågor, "warning" = FAQ-innehåll finns men schema saknas, "bad" = inget FAQ alls
- contentDepth: "ok" = 50+ sidor + blogg, "warning" = 10-50 sidor eller blogg utan schema, "bad" = <10 sidor utan blogg
- serviceSchema: "ok" = Service/Product-schema finns, "warning" = delvis, "bad" = saknas helt
- codeExample för faqSchema ska ALLTID vara komplett och giltig JSON-LD med @context, @type, mainEntity
- Frågorna i codeExample ska vara branschanpassade och relevanta för svenska sökare
- Alla codeExample MÅSTE innehålla kommentaren "<!-- ANPASSA: Byt ut exempelfrågorna mot era faktiska vanliga frågor -->" i början
- codeExample ska vara komplett och giltig JSON-LD
- Alla texter på svenska`
}

function buildEATPrompt(data: {
  hasAboutPage: boolean
  orgNumberFound: string | null
  certificationKeywords: string[]
  hasPersonSchema: boolean
  namedPersons: string[]
  bransch: string
}): string {
  return `Analysera E-A-T-signaler (Experience, Authoritativeness, Trustworthiness) för en svensk webbplats i branschen "${data.bransch}". Svara ENDAST i JSON.

OM OSS-SIDA: ${data.hasAboutPage ? 'Finns' : 'Saknas'}
ORGANISATIONSNUMMER: ${data.orgNumberFound || 'Inte hittat'}
CERTIFIERINGS-NYCKELORD HITTADE: ${data.certificationKeywords.length > 0 ? data.certificationKeywords.join(', ') : 'Inga'}
PERSON-SCHEMA: ${data.hasPersonSchema ? 'Ja' : 'Nej'}
NAMNGIVNA PERSONER: ${data.namedPersons.length > 0 ? data.namedPersons.join(', ') : 'Inga'}

Returnera exakt detta JSON-format:
{
  "eatSignals": {
    "status": "ok|warning|bad",
    "found": ["lista av hittade E-A-T-signaler"],
    "missing": ["lista av saknade viktiga signaler"],
    "finding": "kort sammanfattning",
    "fix": "konkreta åtgärder för att stärka E-A-T"
  },
  "orgNumber": {
    "status": "ok|warning|bad",
    "finding": "vad som hittades eller saknas"
  },
  "certifications": {
    "status": "ok|warning|bad",
    "found": ["hittade certifieringsord"],
    "finding": "kort beskrivning",
    "fix": "förslag på vad som kan läggas till"
  }
}

REGLER:
- eatSignals: "ok" = Om oss-sida + org.nr + minst en certifiering/person, "warning" = delvis, "bad" = mycket svaga signaler
- orgNumber: "ok" = hittat och korrekt format (XXXXXX-XXXX), "warning" = inte synligt men kan finnas på undersida, "bad" = saknas helt
- orgNumber: "ok" bara om formatet XXXXXX-XXXX bekräftats, aldrig gissa
- certifications: "ok" = relevanta certifieringar för branschen visas, "warning" = generiska, "bad" = inga alls
- certifications: basera ENBART på de nyckelord som listades ovan — hitta inte på certifieringar som inte nämndes i datan
- För branschen "${data.bransch}", bedöm vilka certifieringar som är mest relevanta
- Alla texter på svenska`
}

/**
 * Audit #3: Google Places API (New) Review-objektet har INGET fält för ägarsvar
 * (verifierat mot officiell dokumentation:
 * https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#Review
 * — Review har name/text/originalText/rating/authorAttribution/publishTime/
 * flagContentUri/googleMapsUri/visitDate/relativePublishTimeDescription, inget
 * "reviewReply"/"ownerResponse"). En svarsfrekvens går därför ALDRIG att mäta via
 * detta API — checken blir alltid notMeasured, aldrig ett påstått 0 %.
 */
function analyzeReviewReplies(reviews: any[], totalReviewCount?: number): {
  total: number
  status: 'notMeasured'
  finding: string
  fix: string
  sampleNote: string
} {
  // Sanity-check: if knownTotal < reviews.length the reported total is unreliable — never
  // emit "X av totalt Y" where Y < X, as that is self-contradictory.
  const knownTotal = (totalReviewCount != null && totalReviewCount >= reviews.length)
    ? totalReviewCount
    : null
  const sampleNote = reviews.length > 0 && knownTotal !== null && knownTotal > reviews.length
    ? `Baserat på ett stickprov av ${reviews.length} recensioner av totalt ${knownTotal} (Google Places API-gränsen).`
    : ''

  if (!reviews || reviews.length === 0) {
    return {
      total: 0,
      status: 'notMeasured',
      finding: 'Inga recensioner tillgängliga för analys.',
      fix: 'Be kunder lämna recensioner på Google.',
      sampleNote,
    }
  }

  return {
    total: reviews.length,
    status: 'notMeasured',
    finding: 'Google tillhandahåller inte ägarsvar via API:t — kontrollera i Google Business Profile.',
    fix: 'Logga in på Google Business Profile (business.google.com) och se där hur stor andel av recensionerna som fått svar.',
    sampleNote,
  }
}

function buildSynthesisPrompt(
  technicalResult: any,
  faqResult: any,
  eatResult: any,
  placeData: any,
  pageSummary: any,
  url: string,
  directoryResult: any,
  reviewReplyResult: any,
  aiMentionResult: any,
  competitorList: NearbyCompetitor[] | null,
  cwvMetrics: any,
  verifiedFacts: VerifiedFacts
): string {
  const competitorBlock = competitorList && competitorList.length > 0
    ? `NÄRLIGGANDE KONKURRENTER (Google Places, ≤1,5 km — VERIFIERAD data):
${JSON.stringify(competitorList.map(c => ({
        namn: c.name,
        betyg: c.rating,
        antalRecensioner: c.userRatingCount,
        avstandMeter: c.distanceMeters,
      })), null, 2)}`
    : 'NÄRLIGGANDE KONKURRENTER: Ingen verifierad data tillgänglig.'

  const cwvBlock = cwvMetrics
    ? `SIDHASTIGHET (PageSpeed Insights):
${JSON.stringify({
        status: cwvMetrics.status,
        lcp: cwvMetrics.lcp,
        cls: cwvMetrics.cls,
        inp: cwvMetrics.inp,
        performanceScore: cwvMetrics.performanceScore,
        källa: cwvMetrics.source,
        finding: cwvMetrics.finding,
      }, null, 2)}`
    : 'SIDHASTIGHET: Ej mätt.'

  return `Du är en senior svensk AI-sökningsstrateg. Skapa en prioriterad åtgärdsplan baserad på alla analyser.

WEBBPLATS: ${url}

TEKNISK ANALYS:
${JSON.stringify(technicalResult, null, 2)}

FAQ & INNEHÅLL:
${JSON.stringify(faqResult, null, 2)}

E-A-T ANALYS:
${JSON.stringify(eatResult, null, 2)}

SVENSKA KATALOGER (Eniro/Hitta/Gulasidorna):
${JSON.stringify({
  hittades: directoryResult?.directories?.filter((d: any) => d.found).map((d: any) => d.name),
  saknas: directoryResult?.directories?.filter((d: any) => !d.found).map((d: any) => d.name),
  napKonsistens: directoryResult?.napConsistency?.checked
    ? {
        konsekvent: directoryResult.napConsistency.consistent,
        telefon: directoryResult.napConsistency.phone.values,
        adress: directoryResult.napConsistency.address.values,
        finding: directoryResult.napConsistency.finding,
      }
    : 'Kunde inte kontrollera (för få datapunkter)',
  status: directoryResult?.status,
  finding: directoryResult?.finding,
  fix: directoryResult?.fix,
}, null, 2)}

RECENSIONSSVAR:
${JSON.stringify(reviewReplyResult, null, 2)}

AI-OMNÄMNANDEN (GPT-4o-mini testad med faktiska användarfrågor):
${JSON.stringify({
  entityFråga: aiMentionResult?.entityQuery,
  aiKännerTillFöretaget: aiMentionResult?.entityKnows,
  entitySentiment: aiMentionResult?.entitySentiment,
  nämnsVidBranschsökning: aiMentionResult?.categoryMentioned,
  status: aiMentionResult?.status,
  finding: aiMentionResult?.finding,
}, null, 2)}

${competitorBlock}

${cwvBlock}

GOOGLE BUSINESS PROFILE:
${placeData ? JSON.stringify({
    namn: placeData.displayName?.text,
    adress: placeData.formattedAddress,
    telefon: placeData.nationalPhoneNumber,
    betyg: placeData.rating,
    antalRecensioner: placeData.userRatingCount,
    kategorier: placeData.types,
    öppettider: placeData.regularOpeningHours?.weekdayDescriptions,
    verifierad: placeData._domainMatch,
  }, null, 2) : 'Ingen GBP-data tillgänglig'}

SIDSAMMANFATTNING:
- Titel: ${pageSummary?.title || 'Okänd'}
- H1: ${pageSummary?.h1 || 'Saknas'}
- Schema-typer: ${pageSummary?.schemaTypes?.join(', ') || 'Inga'}
- LocalBusiness: ${pageSummary?.hasAnyLocalBusinessSchema ? 'Ja' : 'Nej'}
- Kontaktinfo: ${pageSummary?.hasContactInfo ? 'Ja' : 'Nej'}
- Orter: ${pageSummary?.cities?.join(', ') || 'Inga'}

${formatFactsForPrompt(verifiedFacts)}

Returnera ett JSON-objekt med exakt dessa 4 nycklar:

{
  "actionPlan": "Markdown-formaterad prioriterad åtgärdsplan. Använd ### Kritiskt, ### Viktigt, ### Bra att ha. Numrerade åtgärder med konkreta steg. Inkludera kodexempel där relevant.",
  "competitorNote": "Markdown-text om konkurrenslandskapet. Om NÄRLIGGANDE KONKURRENTER ovan listar verifierade företagsnamn — använd EXAKT de namnen (skriv aldrig om dem, hitta inte på andra). Kommentera betyg/recensionsantal och vad det säger om marknadspositionen. Om listan är tom: beskriv branschtypiska konkurrentmönster utan att hitta på företagsnamn.",
  "reviewAnalysis": "Markdown-text med recensionsanalys: betyg, svarsfrekvens, teman, styrkor/svagheter. null om ingen recensionsdata finns.",
  "summary": "3-5 meningar sammanfattning av sajtens AI-beredskap och viktigaste nästa steg."
}

REGLER:
- Returnera ENBART giltig JSON — inga markdown-kodblock, ingen text utanför JSON
- actionPlan MÅSTE börja med "### Kritiskt" (inte ##)
- actionPlan: inga tidsramar ("denna vecka", "denna månad", "inom X dagar" etc.)
- competitorNote: använd ENDAST företagsnamn som finns i NÄRLIGGANDE KONKURRENTER-listan ovan. Hitta ALDRIG på namn. Om listan är tom — skriv branschinsikter utan namn.
- reviewAnalysis: null om reviewReplyResult visar 0 recensioner
- reviewAnalysis: nämn ALDRIG en svarsfrekvens i procent för recensionssvar (t.ex. "svarar på X%") — Google Places API tillhandahåller inte ägarsvarsdata, se RECENSIONSSVAR ovan
- summary: max 5 meningar, konkret och handlingsbar
- Alla texter på svenska
- Var konkret — exakta steg, specifika verktyg och färdig kod som BARA innehåller verifierade värden
${GROUNDING_RULES}
- Prioritera det som har störst påverkan på AI-sökningar (ChatGPT, Perplexity, Google AI Overview)
- Lyft fram AI-omnämnanden som en nyckelinsikt`
}

/**
 * Deterministisk åtgärdsplan för free-tier — ingen Pro-modell.
 * Bygger personlig markdown från check.finding-texterna (som redan är
 * genererade av Flash + scraper-data, så de är specifika per företag).
 */
function buildFreeSynthesis(checks: CheckResult[]): {
  actionPlan: string
  competitorNote: string
  reviewAnalysis: string | null
  summary: string
} {
  const labelByKey = new Map<string, string>(
    CHECK_REGISTRY.map(e => [e.key, e.label])
  )

  // Only free-tier checks contribute to free synthesis
  const freeChecks = checks.filter(c => c.tier === 'free')
  const critical = freeChecks.filter(c => c.priority === 'critical')
  const important = freeChecks.filter(c => c.priority === 'important')

  const lines: string[] = []
  if (critical.length > 0) {
    lines.push('### Kritiskt')
    lines.push('')
    critical.forEach((c, i) => {
      const label = labelByKey.get(c.key) ?? c.key
      lines.push(`${i + 1}. **${label}** — ${c.finding}`)
    })
    lines.push('')
  }
  if (important.length > 0) {
    lines.push('### Viktigt')
    lines.push('')
    important.forEach((c, i) => {
      const label = labelByKey.get(c.key) ?? c.key
      lines.push(`${i + 1}. **${label}** — ${c.finding}`)
    })
    lines.push('')
  }
  if (lines.length === 0) {
    lines.push('### Bra jobbat!')
    lines.push('')
    lines.push('Inga kritiska eller viktiga problem hittades i gratisanalysen. Köp en fullständig rapport för djupare analys av AI-omnämnande, recensionssvar och konkurrentintelligens.')
  }

  return {
    actionPlan: lines.join('\n'),
    competitorNote: 'Detaljerad konkurrentjämförelse med betyg och AI-synlighetspoäng ingår i den fullständiga rapporten.',
    reviewAnalysis: null,
    summary: critical.length > 0
      ? `Vi hittade ${critical.length} kritiska och ${important.length} viktiga åtgärder. Fixa de kritiska först — de har störst påverkan på er AI-synlighet.`
      : important.length > 0
        ? `Vi hittade ${important.length} viktiga åtgärder. De flesta är tekniska och kan fixas på några timmar.`
        : 'Er sajt har en stark grund för AI-sökmotorer. Den fullständiga rapporten visar hur ni ligger till mot konkurrenter och om AI faktiskt känner till er.',
  }
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders })
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('[Enhanced Scan] OPENROUTER_API_KEY saknas — avbryter')
    return NextResponse.json(
      { error: 'Servern är felkonfigurerad', errorId: 'no-api-key' },
      { status: 503, headers: corsHeaders },
    )
  }

  try {
    const { url, city: cityInput, tier: tierInput } = await req.json()

    const internalToken = req.headers.get('x-internal-scan-token')
    const tokenOk = !!process.env.INTERNAL_SCAN_TOKEN && internalToken === process.env.INTERNAL_SCAN_TOKEN

    // Rate limiting — internal-token calls (server-to-server, e.g. checkout finalize
    // reusing a cached free scan) are exempt from all of it. Per-IP limits count EVERY
    // call, including invalid URLs, so junk requests can't dodge the quota.
    if (!tokenOk) {
      const ip = getClientIp(req)
      const perIp10min = checkLimit(`scan:ip10m:${ip}`, 5, 10 * 60 * 1000)
      if (!perIp10min.ok) return rateLimitResponse(perIp10min.retryAfterSec, corsHeaders)
      const perIpDay = checkLimit(`scan:ip1d:${ip}`, 20, 24 * 60 * 60 * 1000)
      if (!perIpDay.ok) return rateLimitResponse(perIpDay.retryAfterSec, corsHeaders)
    }

    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400, headers: corsHeaders })
    }
    try { await assertPublicUrl(url) } catch {
      return NextResponse.json({ error: 'Ogiltig eller blockerad URL' }, { status: 400, headers: corsHeaders })
    }

    // Global limit only counts requests that passed URL validation — otherwise a flood
    // of junk requests could exhaust the shared quota and DoS legitimate scans.
    if (!tokenOk) {
      const global = checkLimit('scan:global1h', 60, 60 * 60 * 1000)
      if (!global.ok) return rateLimitResponse(global.retryAfterSec, corsHeaders)
    }

    const tier: 'free' | 'paid' = tierInput === 'paid' && tokenOk ? 'paid' : 'free'

    console.log(`[Enhanced Scan] Startar för ${url}${cityInput ? ` (stad: ${cityInput})` : ''} [tier=${tier}]`)

    // Run enhanced scrape + normal scrape + places lookup in parallel
    const [enhancedData, scrapedData] = await Promise.all([
      scrapeEnhanced(url),
      scrapeWebsite(url),
    ])

    const mainPage = scrapedData.pages[0]

    // Get places data — use user-supplied city first, then scraped city
    const cityHint = cityInput || mainPage?.cities?.[0] || undefined
    const place = await findBusinessByUrl(url, cityHint).catch(() => null)
    let placeDetails = null
    if (place?.id) {
      placeDetails = await getPlaceDetails(place.id).catch(() => null)
      if (placeDetails) {
        placeDetails = { ...placeDetails, _domainMatch: place._domainMatch, _warning: place._warning }
      }
    }
    const placeForAnalysis = placeDetails || place

    // Extract company name first — deriveBransch needs it to guard against ever
    // landing on the same value (Audit #10).
    const companyName = placeForAnalysis?.displayName?.text || mainPage?.title?.split(/\s*[\|–\-]\s*/)[0]?.trim() || ''

    const placeTypes: string[] = placeForAnalysis?.types || []
    const bransch = deriveBransch({
      primaryType: placeForAnalysis?.primaryType ?? null,
      types: placeTypes,
      title: mainPage?.title ?? null,
      companyName,
    })

    // City priority: 1) user input, 2) Places address, 3) scraped — never use 'Sverige'
    const cityFromPlace = placeForAnalysis?.formattedAddress
      ? (() => {
          const m = placeForAnalysis.formattedAddress.match(/\d{5}\s+([A-ZÅÄÖ][a-zåäö]+)/)
          return m ? m[1] : null
        })()
      : null
    const city = cityInput || cityFromPlace || mainPage?.cities?.[0] || ''

    console.log(`[Enhanced Scan] Scraping klar. Startar Flash-anrop + katalog + AI-test...`)

    // Task 1.5: HTTPS check — derived early from URL before any other analysis
    const isHttps = url.startsWith('https://')

    // Review reply analysis (from place details) — pass total count for disclaimer
    const reviews = placeDetails?.reviews || []
    const reviewReplyResult = analyzeReviewReplies(reviews, placeDetails?.userRatingCount)

    // Run 3 Flash calls + directory check + AI mention check in parallel
    const flashSystem = 'Du är en svensk AI-sökningsanalytiker. Svara ENDAST i giltig JSON. Ingen markdown, ingen text utanför JSON.'

    const [technicalResult, faqResult, eatResult, directoryResult, aiMentionResult, cwvMetrics, competitorList] = await Promise.all([
      callOpenRouter(
        FLASH_MODEL,
        flashSystem,
        buildTechnicalPrompt({
          robotsTxt: enhancedData.robotsTxt,
          aiCrawlersBlocked: enhancedData.aiCrawlersBlocked,
          ogTitle: enhancedData.ogTitle,
          ogDescription: enhancedData.ogDescription,
          ogImage: enhancedData.ogImage,
          socialLinks: enhancedData.socialLinks,
          sameAsLinks: enhancedData.sameAsLinks,
          hreflangTags: enhancedData.hreflangTags,
          isHttps,
          llmsTxt: scrapedData.llmsTxt,
          canonical: mainPage?.canonical ?? null,
          hasGoogleMaps: mainPage?.hasGoogleMaps ?? false,
          menuSummary: mainPage?.menuSummary ?? '',
        }),
        45000
      ).catch((err) => {
        console.error('[Enhanced Scan] Technical Flash failed:', err.message)
        return {
          https: { status: isHttps ? 'ok' : 'bad', exists: isHttps, finding: isHttps ? 'Webbplatsen använder HTTPS.' : 'Webbplatsen använder HTTP.', fix: isHttps ? '' : 'Aktivera HTTPS via SSL-certifikat (t.ex. Let\'s Encrypt).' },
          aiCrawlers: { status: 'unknown', blocked: [], finding: 'Kunde inte analyseras', fix: '' },
          ogTags: { status: 'unknown', missing: [], finding: 'Kunde inte analyseras', fix: '', codeExample: '' },
          socialPresence: { status: 'unknown', found: [], finding: 'Kunde inte analyseras', fix: '' },
          hreflang: { status: 'unknown', finding: 'Kunde inte analyseras', fix: '' },
          llmsTxt: { status: 'unknown', exists: !!scrapedData.llmsTxt, finding: 'Kunde inte analyseras', fix: '' },
        }
      }),
      callOpenRouter(
        FLASH_MODEL,
        flashSystem,
        buildFAQContentPrompt({
          hasFAQSchema: enhancedData.hasFAQSchema,
          faqQuestions: enhancedData.faqQuestions,
          hasFAQContent: enhancedData.hasFAQContent,
          sitemapPageCount: enhancedData.sitemapPageCount,
          hasBlogOrGuide: enhancedData.hasBlogOrGuide,
          blogPaths: enhancedData.blogPaths,
          hasServiceSchema: enhancedData.hasServiceSchema,
          hasMenuSchema: enhancedData.hasMenuSchema,
          serviceSchemaTypes: enhancedData.serviceSchemaTypes,
          bransch,
        }),
        45000
      ).catch((err) => {
        console.error('[Enhanced Scan] FAQ Flash failed:', err.message)
        return {
          faqSchema: { status: 'unknown', questionsFound: [], finding: 'Kunde inte analyseras', fix: '', codeExample: '' },
          contentDepth: { status: 'unknown', pageCount: 0, hasBlog: false, finding: 'Kunde inte analyseras', fix: '' },
          serviceSchema: { status: 'unknown', typesFound: [], finding: 'Kunde inte analyseras', fix: '', codeExample: '' },
        }
      }),
      callOpenRouter(
        FLASH_MODEL,
        flashSystem,
        buildEATPrompt({
          hasAboutPage: enhancedData.hasAboutPage,
          orgNumberFound: enhancedData.orgNumberFound,
          certificationKeywords: enhancedData.certificationKeywords,
          hasPersonSchema: enhancedData.hasPersonSchema,
          namedPersons: enhancedData.namedPersons,
          bransch,
        }),
        45000
      ).catch((err) => {
        console.error('[Enhanced Scan] EAT Flash failed:', err.message)
        return {
          eatSignals: { status: 'unknown', found: [], missing: [], finding: 'Kunde inte analyseras', fix: '' },
          orgNumber: { status: 'unknown', finding: 'Kunde inte analyseras' },
          certifications: { status: 'unknown', found: [], finding: 'Kunde inte analyseras', fix: '' },
        }
      }),
      checkSwedishDirectories(companyName, city, enhancedData.sameAsLinks).catch((err) => {
        console.error('[Enhanced Scan] Directory check failed:', err.message)
        return {
          foundInSameAs: [],
          directories: [],
          foundCount: 0,
          totalChecked: 0,
          napConsistency: {
            checked: false,
            consistent: null,
            phone: { values: [], consistent: false },
            address: { values: [], consistent: false },
            finding: 'Kunde inte kontrollera.',
            fix: '',
          },
          status: 'warning' as const,
          finding: 'Katalogkontroll kunde inte genomföras.',
          fix: '',
        }
      }),
      checkAIMentions(companyName, city, bransch, OPENROUTER_API_KEY!, callOpenRouterOnce, placeTypes, placeForAnalysis?.formattedAddress ?? null).catch((err) => {
        console.error('[Enhanced Scan] AI mention check failed:', err.message)
        return null
      }),
      getCwvMetrics(url).catch((err) => {
        console.error('[Enhanced Scan] PSI failed:', err.message)
        return null
      }),
      (async (): Promise<NearbyCompetitor[]> => {
        const lat = placeForAnalysis?.location?.latitude
        const lng = placeForAnalysis?.location?.longitude
        const ptype = placeForAnalysis?.primaryType
        if (typeof lat !== 'number' || typeof lng !== 'number' || !ptype || !placeForAnalysis?.id) return []
        return findNearbyCompetitors(lat, lng, ptype, placeForAnalysis.id).catch((err) => {
          console.error('[Enhanced Scan] Nearby competitors failed:', err.message)
          return []
        })
      })(),
    ])

    console.log(`[Enhanced Scan] Alla anrop klara. Startar Pro-syntes + Report Writer...`)

    // ---- Build checks BEFORE synthesis so Report Writer can run in parallel ----
    const domain = new URL(url).hostname.replace(/^www\./, '')
    const checks = buildCheckResults({
      scraperData: scrapedData,
      enhancedData,
      technicalResult,
      faqResult,
      eatResult,
      directoryResult,
      aiMentionResult,
      reviewReplyResult,
      placeData: placeForAnalysis,
      url,
      isHttps,
      cwvMetrics,
      competitorList,
    })

    // Audit #6: verifierade fakta till prompterna + efterkontrollen (factGuard.ts)
    const verifiedFacts = buildVerifiedFacts({
      url,
      pages: scrapedData.pages,
      sitemapXml: scrapedData.sitemapXml,
      placePhone: placeForAnalysis?.nationalPhoneNumber ?? null,
      weekdayHours: placeForAnalysis?.regularOpeningHours?.weekdayDescriptions ?? null,
      openingPeriods: placeForAnalysis?.regularOpeningHours?.periods ?? null,
      schemaHours: enhancedData.openingHoursFromSchema,
      faqQuestions: enhancedData.faqQuestions,
      extraUrls: [enhancedData.ogImage, placeForAnalysis?.websiteUri, ...enhancedData.blogPaths],
    })

    // Run Pro synthesis + Report Writer in parallel
    const synthesisPrompt = buildSynthesisPrompt(
      technicalResult,
      faqResult,
      eatResult,
      placeForAnalysis,
      mainPage,
      url,
      directoryResult,
      reviewReplyResult,
      aiMentionResult,
      competitorList,
      cwvMetrics,
      verifiedFacts
    )

    const SynthesisResponseSchema = z.object({
      actionPlan: z.string().min(1),
      competitorNote: z.string().min(1),
      reviewAnalysis: z.string().nullable(),
      summary: z.string().min(1),
    })

    // Extrahera postnummer och gatuadress ur Places formattedAddress (svenskt format)
    // "Gatuadress 12, 411 36 Göteborg" → streetAddress="Gatuadress 12", postalCode="411 36"
    const formattedAddress: string | undefined = placeForAnalysis?.formattedAddress
    const addrMatch = formattedAddress?.match(/^(.+?),\s*(\d{3}\s?\d{2})\s+/)
    const streetAddress = addrMatch?.[1]?.trim() || null
    const postalCode = addrMatch?.[2]?.trim() || null

    // Försök hitta e-post i scrapad bodyText
    const emailMatch = mainPage?.bodyText?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    const email = emailMatch?.[0] || null

    const reportWriterMeta = {
      companyName,
      bransch,
      city: city || null,
      url,
      domain,
      phone: placeForAnalysis?.nationalPhoneNumber || mainPage?.phones?.[0] || undefined,
      // Utökad data så Pro kan generera komplett kod utan ANPASSA-kommentarer
      streetAddress,
      postalCode,
      formattedAddress: formattedAddress || null,
      email,
      latitude: placeForAnalysis?.location?.latitude ?? null,
      longitude: placeForAnalysis?.location?.longitude ?? null,
      placeId: placeForAnalysis?.id ?? null,
      primaryType: placeForAnalysis?.primaryType ?? null,
      googleRating: placeForAnalysis?.rating ?? null,
      reviewCount: placeForAnalysis?.userRatingCount ?? null,
      weekdayHours: placeForAnalysis?.regularOpeningHours?.weekdayDescriptions ?? null,
      // Strukturerade perioder → deterministisk openingHoursSpecification i huvudschemat
      openingPeriods: placeForAnalysis?.regularOpeningHours?.periods ?? null,
      schemaTypes: mainPage?.schemaTypes ?? [],
      socialLinks: enhancedData.sameAsLinks ?? [],
      title: mainPage?.title ?? null,
      h1: mainPage?.h1 ?? null,
      verifiedFacts,
    }

    let synthesis: { actionPlan: string; competitorNote: string; reviewAnalysis: string | null; summary: string }
    // Audit #9 (recensionsdelen): grundade recensionsteman/beröm/klagomål, paid-only.
    // Förblir null i free-tier (ingen LLM-analys körs) och om det inte finns
    // recensionstexter eller inget citat gick att verifiera ordagrant.
    let reviewInsights: ReviewInsightsData | null = null

    if (tier === 'paid') {
      // PAID flow — full Pro pipeline (synthesis + Report Writer in parallel).
      // Synthesis uses parallel race: Pro is primary, Flash is always-ready backup.
      // If Pro succeeds → use Pro. If Pro times out/fails → use Flash (already ~10s old).
      // Both running in parallel adds ~$0.0015 per scan but guarantees real synthesis.
      const synthesisSystemPrompt = 'Du är en senior svensk AI-sökningsstrateg. Returnera ENBART giltig JSON med nycklarna: actionPlan, competitorNote, reviewAnalysis, summary. Ingen text utanför JSON.'

      const proPromise = callOpenRouter(
        PRO_MODEL,
        synthesisSystemPrompt,
        synthesisPrompt,
        120000, // bumped from 90s → 120s
        false,
        12000
      )
      const flashFallbackPromise = callOpenRouter(
        FLASH_MODEL,
        synthesisSystemPrompt,
        synthesisPrompt,
        45000,
        false,
        8000
      ).catch((err) => {
        console.warn('[Synthesis] Flash backup failed:', err.message)
        return null
      })

      const [synthesisRaw, richData, reviewInsightsResult] = await Promise.all([
        proPromise
          .catch(async (err) => {
            console.warn(`[Synthesis] Pro failed (${err.message}) — using Flash fallback`)
            const flashResult = await flashFallbackPromise
            if (flashResult) {
              console.log('[Synthesis] Flash fallback succeeded')
              return flashResult
            }
            console.error('[Synthesis] BOTH Pro and Flash failed')
            return {
              actionPlan: '### Syntesfel\n\nKunde inte generera åtgärdsplan. Individuella analyser finns tillgängliga.',
              competitorNote: 'Kunde inte generera branschanalys.',
              reviewAnalysis: null,
              summary: 'Syntesen misslyckades — se individuella kontroller.',
            }
          }),
        // Report Writer sköter retry + Flash-reserv själv → ge den ENKELANROPET
        // (callOpenRouter har egen withRetry; det skulle ge nästlade retries).
        enrichChecksWithReportWriter(checks, reportWriterMeta, callOpenRouterOnce).catch((err) => {
          console.error('[Enhanced Scan] Report Writer failed:', err.message)
          return {}
        }),
        // Audit #9: skickar de faktiska recensionstexterna (max 5) till Flash i
        // JSON-läge — analyzeReviewInsights fångar sina egna fel och kastar aldrig.
        analyzeReviewInsights(reviews, { companyName, bransch }, callOpenRouterOnce),
      ])
      reviewInsights = reviewInsightsResult

      // Merge rich data back into checks. Varje bad/warning-check får richStatus;
      // checks utan komplett rikt innehåll markeras 'missing' och loggas.
      const richMissing = applyRichData(checks, richData)
      if (richMissing.length > 0) {
        console.error(`[Enhanced Scan] ${richMissing.length} checks saknar rikt innehåll: ${richMissing.join(', ')}`)
      }

      // Validate synthesis with Zod, fallback gracefully
      try {
        synthesis = SynthesisResponseSchema.parse(synthesisRaw)

        // Validate actionPlan has at least one heading
        if (!synthesis.actionPlan.includes('###')) {
          console.warn('[Enhanced Scan] actionPlan missing ### headings, adding structure')
          synthesis.actionPlan = '### Kritiskt\n\n' + synthesis.actionPlan
        }
      } catch (parseErr) {
        console.error('[Enhanced Scan] Synthesis parse failed:', parseErr)
        // If the raw response is a string (old format), wrap it
        if (typeof synthesisRaw === 'string') {
          const cleaned = synthesisRaw.replace(/^[\s\S]*?(###?\s)/m, '$1').trim()
          synthesis = {
            actionPlan: cleaned || '### Syntesfel\n\nKunde inte generera åtgärdsplan.',
            competitorNote: 'Branschanalys kunde inte genereras.',
            reviewAnalysis: null,
            summary: 'Analys delvis genomförd — se individuella kontroller ovan.',
          }
        } else {
          synthesis = {
            actionPlan: '### Syntesfel\n\nKunde inte generera åtgärdsplan.',
            competitorNote: 'Branschanalys kunde inte genereras.',
            reviewAnalysis: null,
            summary: 'Analys delvis genomförd — se individuella kontroller ovan.',
          }
        }
      }

      // Audit #6: efterkontroll — rättar/tar bort öppettider, telefon, interna URL:er,
      // menyrätter och priser som inte stämmer med verifierade fakta. Loggar varje ändring.
      groundReport(checks, synthesis, verifiedFacts)
    } else {
      // FREE flow — no Pro calls. Build a deterministic action plan from check findings.
      synthesis = buildFreeSynthesis(checks)
    }

    console.log(`[Enhanced Scan] Klar för ${url} [tier=${tier}]`)

    // ---- Phase 2.8: Assemble ScanResult ----
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const scores = calculateScores(checks)

    const scanResult: ScanResult = {
      meta: {
        url,
        domain,
        city: city || null,
        bransch,
        companyName,
        scanDate: new Date().toISOString(),
        scanId,
      },
      scores: {
        free: scores.free,
        full: scores.full,
        google: placeForAnalysis?.rating ?? null,
        googleCount: placeForAnalysis?.userRatingCount ?? null,
      },
      checks,
      synthesis,
      gbp: placeForAnalysis ? {
        name: placeForAnalysis.displayName?.text,
        rating: placeForAnalysis.rating ?? null,
        userRatingCount: placeForAnalysis.userRatingCount ?? null,
        address: placeForAnalysis.formattedAddress ?? null,
        phone: placeForAnalysis.nationalPhoneNumber ?? null,
        websiteUri: placeForAnalysis.websiteUri ?? null,
        weekdayDescriptions: placeForAnalysis.regularOpeningHours?.weekdayDescriptions,
        types: placeForAnalysis.types,
        _domainMatch: placeForAnalysis._domainMatch,
      } : null,
      directories: directoryResult,
      aiMentions: aiMentionResult,
      reviewReplies: {
        total: reviewReplyResult.total,
        status: reviewReplyResult.status,
        finding: reviewReplyResult.finding,
        fix: reviewReplyResult.fix,
        sampleNote: reviewReplyResult.sampleNote,
      },
      reviewInsights,
    }

    // Validate with Zod — log and continue even if validation fails
    const parseResult = ScanResultSchema.safeParse(scanResult)
    if (!parseResult.success) {
      console.error('[Enhanced Scan] ScanResult Zod validation failed:',
        JSON.stringify(parseResult.error.issues.slice(0, 5), null, 2))
      // Don't fail the request — return the data anyway, the structure is close enough
    }

    return NextResponse.json(scanResult, { headers: corsHeaders })

  } catch (err: any) {
    const errorId = crypto.randomUUID().slice(0, 8)
    console.error(`[Enhanced Scan] Error [${errorId}]:`, err)
    return NextResponse.json(
      { error: 'Internt fel', errorId },
      { status: 500, headers: corsHeaders }
    )
  }
}
