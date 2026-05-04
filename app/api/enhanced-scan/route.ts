import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeWebsite } from '@/app/lib/scraper'
import { scrapeEnhanced } from '@/app/lib/enhancedScraper'
import { findBusinessByUrl, getPlaceDetails } from '@/app/lib/places'
import { checkSwedishDirectories } from '@/app/lib/directoryChecker'
import { checkAIMentions } from '@/app/lib/aiMentionChecker'
import { buildCheckResults } from '@/app/lib/checkBuilder'
import { calculateScores, ScanResultSchema } from '@/app/lib/scanResult'
import type { ScanResult } from '@/app/lib/scanResult'
import { enrichChecksWithReportWriter } from '@/app/lib/reportWriter'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

const FLASH_MODEL = 'google/gemini-2.0-flash-001'
const PRO_MODEL = 'google/gemini-2.5-pro-preview-03-25'

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

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown = false,
  maxTokensOverride?: number,
  _isRetry = false
): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://analyze.pipod.net',
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
      if (!_isRetry && (res.status === 429 || res.status === 504)) {
        clearTimeout(timeout)
        const waitMs = res.status === 429 ? 3000 : 1000
        console.warn(`[callOpenRouter] ${model} got ${res.status}, retrying in ${waitMs}ms...`)
        await new Promise(r => setTimeout(r, waitMs))
        return callOpenRouter(model, systemPrompt, userPrompt, timeoutMs, expectMarkdown, maxTokensOverride, true)
      }
      throw new Error(`OpenRouter ${res.status}: ${text}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content.trim()) throw new Error('Tomt AI-svar')

    if (expectMarkdown) return content
    return extractJson(content)
  } finally {
    clearTimeout(timeout)
  }
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

function analyzeReviewReplies(reviews: any[], totalReviewCount?: number): {
  total: number
  withReply: number
  responseRate: number
  status: 'ok' | 'warning' | 'bad'
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
    ? `OBS: Baserat på ett stickprov av ${reviews.length} recensioner av totalt ${knownTotal}. Det faktiska svarsfrekvensen kan vara högre.`
    : reviews.length > 0 && knownTotal !== null && knownTotal > 0
    ? `Baserat på ${reviews.length} av ${knownTotal} recensioner.`
    : ''

  if (!reviews || reviews.length === 0) {
    return {
      total: 0, withReply: 0, responseRate: 0,
      status: 'warning',
      finding: 'Inga recensioner tillgängliga för analys.',
      fix: 'Be kunder lämna recensioner och svara alltid på dem.',
      sampleNote,
    }
  }
  const withReply = reviews.filter(r => r.reviewReply?.text).length
  const responseRate = Math.round((withReply / reviews.length) * 100)

  let status: 'ok' | 'warning' | 'bad'
  let finding: string
  let fix: string

  if (responseRate >= 70) {
    status = 'ok'
    finding = `Svarar på ${responseRate}% av recensioner i stickprovet (${withReply}/${reviews.length}). AI-motorer ser ett aktivt engagerat företag.`
    fix = ''
  } else if (responseRate >= 30) {
    status = 'warning'
    const unanswered = reviews.length - withReply
    finding = `Svarar på ${responseRate}% av recensioner i stickprovet. ${unanswered} saknar svar.`
    fix = `Svara på de ${unanswered} obesvarade recensionerna. AI-motorer som Google AI Overviews inkluderar företagssvar i sin analys — personliga svar signalerar engagemang.`
  } else {
    const unanswered = reviews.length - withReply
    status = 'bad'
    finding = `Svarar på bara ${responseRate}% av recensioner i stickprovet (${withReply}/${reviews.length}). ${unanswered} recensioner utan svar.`
    fix = `Svara på obesvarade recensioner snarast. Sätt upp rutin att svara inom 48h. Google AI Overviews visar företagssvar direkt — detta är AI-synlighet du missar varje dag.`
  }

  return { total: reviews.length, withReply, responseRate, status, finding, fix, sampleNote }
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
  aiMentionResult: any
): string {
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

Returnera ett JSON-objekt med exakt dessa 4 nycklar:

{
  "actionPlan": "Markdown-formaterad prioriterad åtgärdsplan. Använd ### Kritiskt, ### Viktigt, ### Bra att ha. Numrerade åtgärder med konkreta steg. Inkludera kodexempel där relevant.",
  "competitorNote": "Markdown-text om branschlandskapet. VIKTIGT: Du har INGEN verifierad data om specifika konkurrenter. Skriv ALDRIG konkreta företagsnamn. Beskriv istället vad typiska konkurrenter i branschen tenderar att göra bra/dåligt gällande AI-synlighet.",
  "reviewAnalysis": "Markdown-text med recensionsanalys: betyg, svarsfrekvens, teman, styrkor/svagheter. null om ingen recensionsdata finns.",
  "summary": "3-5 meningar sammanfattning av sajtens AI-beredskap och viktigaste nästa steg."
}

REGLER:
- Returnera ENBART giltig JSON — inga markdown-kodblock, ingen text utanför JSON
- actionPlan MÅSTE börja med "### Kritiskt" (inte ##)
- actionPlan: inga tidsramar ("denna vecka", "denna månad", "inom X dagar" etc.)
- competitorNote: ALDRIG specifika företagsnamn — bara branschinsikter
- reviewAnalysis: null om reviewReplyResult visar 0 recensioner
- summary: max 5 meningar, konkret och handlingsbar
- Alla texter på svenska
- Var konkret — ge färdig kod, exakta steg, specifika verktyg
- Prioritera det som har störst påverkan på AI-sökningar (ChatGPT, Perplexity, Google AI Overview)
- Lyft fram AI-omnämnanden som en nyckelinsikt`
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

  try {
    const { url, city: cityInput } = await req.json()
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400, headers: corsHeaders })
    }

    console.log(`[Enhanced Scan] Startar för ${url}${cityInput ? ` (stad: ${cityInput})` : ''}`)

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

    // Derive bransch from Places types (most accurate) or page title
    const PLACES_TYPE_MAP: Record<string, string> = {
      restaurant: 'restaurang', food: 'restaurang', bar: 'bar',
      real_estate_agency: 'mäklare', lodging: 'hotell',
      plumber: 'rörmokare', electrician: 'elektriker',
      general_contractor: 'hantverkare', painter: 'målare',
      dentist: 'tandläkare', doctor: 'läkare', hospital: 'sjukhus',
      lawyer: 'advokatbyrå', accounting: 'redovisning',
      car_repair: 'bilverkstad', car_dealer: 'bilhandlare',
      beauty_salon: 'skönhetssalong', hair_care: 'frisör',
      gym: 'gym', school: 'skola',
      supermarket: 'matbutik', grocery_or_supermarket: 'matbutik',
      clothing_store: 'klädbutik', electronics_store: 'elektronikbutik',
    }
    const placeTypes: string[] = placeForAnalysis?.types || []
    const mappedType = placeTypes.map((t: string) => PLACES_TYPE_MAP[t]).find(Boolean)
    const bransch = mappedType || mainPage?.title?.split(/\s*[\|–\-]\s*/)[0]?.trim() || 'okänd'

    // Extract company name and city for new checks
    const companyName = placeForAnalysis?.displayName?.text || mainPage?.title?.split(/\s*[\|–\-]\s*/)[0]?.trim() || ''

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

    const [technicalResult, faqResult, eatResult, directoryResult, aiMentionResult] = await Promise.all([
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
      checkAIMentions(companyName, city, bransch, OPENROUTER_API_KEY!, placeTypes).catch((err) => {
        console.error('[Enhanced Scan] AI mention check failed:', err.message)
        return null
      }),
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
      aiMentionResult
    )

    const SynthesisResponseSchema = z.object({
      actionPlan: z.string().min(1),
      competitorNote: z.string().min(1),
      reviewAnalysis: z.string().nullable(),
      summary: z.string().min(1),
    })

    const reportWriterMeta = {
      companyName,
      bransch,
      city: city || null,
      url,
      domain,
      phone: placeForAnalysis?.nationalPhoneNumber || mainPage?.phones?.[0] || undefined,
    }

    const [synthesisRaw, richData] = await Promise.all([
      callOpenRouter(
        PRO_MODEL,
        'Du är en senior svensk AI-sökningsstrateg. Returnera ENBART giltig JSON med nycklarna: actionPlan, competitorNote, reviewAnalysis, summary. Ingen text utanför JSON.',
        synthesisPrompt,
        90000,
        false, // JSON mode — callOpenRouter will parse via extractJson()
        12000 // synthesis needs more tokens than default 6000 (JSON-wrapped markdown)
      ).catch((err) => {
        console.error('[Enhanced Scan] Pro synthesis failed:', err.message)
        return {
          actionPlan: '### Syntesfel\n\nKunde inte generera åtgärdsplan. Individuella analyser finns tillgängliga.',
          competitorNote: 'Kunde inte generera branschanalys.',
          reviewAnalysis: null,
          summary: 'Syntesen misslyckades — se individuella kontroller.',
        }
      }),
      enrichChecksWithReportWriter(checks, reportWriterMeta, callOpenRouter).catch((err) => {
        console.error('[Enhanced Scan] Report Writer failed:', err.message)
        return {} as Record<string, any>
      }),
    ])

    // Merge rich data back into checks
    for (const check of checks) {
      const rich = richData[check.key]
      if (rich) {
        check.richRelevance = rich.richRelevance
        check.richSteps = rich.richSteps
        check.richCodeExample = rich.richCodeExample
      }
    }

    // Validate synthesis with Zod, fallback gracefully
    let synthesis: { actionPlan: string; competitorNote: string; reviewAnalysis: string | null; summary: string }

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

    console.log(`[Enhanced Scan] Klar för ${url}`)

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
        withReply: reviewReplyResult.withReply,
        replyRate: reviewReplyResult.responseRate,
        status: reviewReplyResult.status,
        finding: reviewReplyResult.finding,
        fix: reviewReplyResult.fix,
        sampleNote: reviewReplyResult.sampleNote,
      },
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
    console.error('[Enhanced Scan] Error:', err)
    return NextResponse.json(
      { error: 'Enhanced scan misslyckades', detail: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
