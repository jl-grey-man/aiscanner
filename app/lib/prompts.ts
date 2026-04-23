import { ScrapedData } from './scraper'

export function buildFreePrompt(data: ScrapedData): string {
  const main = data.pages[0]
  const extras = data.pages.slice(1)

  const pagesText = data.pages.map((p, i) => `
SIDA ${i + 1}: ${p.url}
TITEL: ${p.title}
H1: ${p.h1 || '(saknas)'}
H2: ${p.h2s.join(' | ') || '(saknas)'}
SCHEMA: ${p.schemaScripts.length > 0 ? 'Finns' : 'Saknas'}
LOCALBUSINESS: ${p.hasLocalBusinessSchema ? 'Ja' : 'Nej'}
RESTAURANT: ${p.hasRestaurantSchema ? 'Ja' : 'Nej'}
TELEFON: ${p.phones.join(', ') || 'Ingen'}
ORTER: ${p.cities.join(', ') || 'Ingen'}
MENY: ${p.menuSummary}
KONTAKTINFO: ${p.hasContactInfo ? 'Ja' : 'Nej'}
TEXT: ${p.bodyText}
`).join('\n---\n')

  return `
Du är en svensk AI-sökningsanalytiker. Analysera följande sidor för lokal AI-synlighet.
Svara ENDAST i JSON. Ingen markdown, ingen förklaring utanför JSON.

HEMSIDA: ${data.url}
ROBOTS.TXT: ${data.robotsTxt ? 'Finns' : 'Saknas'}
SITEMAP: ${data.sitemapXml ? `Finns, ${data.sitemapUrlCount} URL:er` : 'Saknas'}
LLMS.TXT: ${data.llmsTxt ? 'Finns' : 'Saknas'}
ANTAL SIDOR SKANNADE: ${data.pages.length}

${pagesText}

Returnera exakt detta JSON-schema:
{
  "score": 0-100,
  "summary": "2-3 meningar på svenska om läget",
  "categories": {
    "technical": {"score": 0-10, "label": "Teknisk grund"},
    "local": {"score": 0-10, "label": "Lokal synlighet"},
    "aireadiness": {"score": 0-10, "label": "AI-beredskap"},
    "content": {"score": 0-10, "label": "Innehåll"}
  },
  "phases": [
    {
      "id": "technical",
      "label": "Teknisk grund",
      "checks": [
        {"title": "Robots.txt", "status": "good|warning|bad", "finding": "1 mening", "what": "Vad", "why": "Varför", "fix": "Åtgärd"}
      ]
    },
    {
      "id": "local",
      "label": "Lokal synlighet",
      "checks": [
        {"title": "NAP på hemsidan", "status": "good|warning|bad", "finding": "1 mening", "what": "Vad", "why": "Varför", "fix": "Åtgärd"}
      ]
    },
    {
      "id": "aireadiness",
      "label": "AI-beredskap",
      "checks": [
        {"title": "Schema markup", "status": "good|warning|bad", "finding": "1 mening", "what": "Vad", "why": "Varför", "fix": "Åtgärd"}
      ]
    },
    {
      "id": "content",
      "label": "Innehåll",
      "checks": [
        {"title": "H1-tagg", "status": "good|warning|bad", "finding": "1 mening", "what": "Vad", "why": "Varför", "fix": "Åtgärd"}
      ]
    }
  ],
  "criticalIssues": [
    {
      "severity": "high|medium|low",
      "category": "technical|local|aireadiness|content",
      "title": "Svensk titel",
      "description": "Förklaring på svenska",
      "fix": "Exakt vad de ska göra",
      "codeExample": "null eller färdig kod"
    }
  ],
  "quickWins": [
    {"title": "...", "fix": "...", "effort": "small"}
  ],
  "localSignals": {
    "napFound": boolean,
    "cityFound": boolean,
    "cityName": "string eller null",
    "hasLocalBusinessSchema": boolean,
    "hasRestaurantSchema": boolean,
    "schemaType": "string eller null",
    "languageWarning": "string eller null",
    "pagesScanned": number
  }
}

Regler för phases:
- Skapa EXAKT 4 phases: technical, local, aireadiness, content
- Varje phase ska ha 3-5 checks baserat på vad du faktiskt hittat
- status 'good' = detta är bra och behöver inte åtgärdas
- status 'warning' = kan förbättras, inte kritisk
- status 'bad' = allvarlig brist som påverkar AI-synlighet
- finding ska vara max 1 mening om vad du hittade
- what/why/fix är valfria, men ska vara korta och konkreta när de finns

Regler:
- Om flera språkversioner finns (t.ex. /en/ + svensk), bedöm om svenska sidor är tillräckliga
- Om LocalBusiness-schema saknas på ALLA sidor, ge färdig JSON-LD i codeExample
- Om det är en restaurang/café och Restaurant-schema saknas, flagga högt
- Om sidor verkar vara på engelska men företaget är svenskt, flagga i languageWarning
- Om H1 saknas på alla sidor, flagga som kritisk brist
- Om robots.txt och sitemap.xml saknas, flagga som medium brist
- score ska vara hård: <50 allvarligt, 50-75 okej, >75 bra
- Var konkret. Ge exakt kod när det gäller schema.
- Prioritera lokala signaler högt.
`
}

export function buildPremiumPrompt(
  freeReport: any,
  placeData: any,
  reviews: any[]
): string {
  const isVerified = placeData?._domainMatch === true
  const warning = placeData?._warning || null

  return `
Du är en svensk lokal AI-sökningsstrateg. Du har grundrapporten och extern data.
Svara ENDAST i JSON.

GRUNDRAPPORT: ${JSON.stringify(freeReport, null, 2)}

GOOGLE BUSINESS PROFILE:
- Namn: ${placeData?.displayName?.text || 'Saknas'}
- Adress: ${placeData?.formattedAddress || 'Saknas'}
- Telefon: ${placeData?.nationalPhoneNumber || 'Saknas'}
- Kategorier: ${placeData?.types?.join(', ') || 'Saknas'}
- Betyg: ${placeData?.rating || 'Saknas'} (${placeData?.userRatingCount || 0} recensioner)
- Öppettider: ${JSON.stringify(placeData?.regularOpeningHours?.weekdayDescriptions) || 'Saknas'}
- Beskrivning: ${placeData?.editorialSummary?.text || 'Saknas'}
- VERIFIERAD: ${isVerified ? 'Ja' : 'Nej'}
${warning ? `- VARNING: ${warning}` : ''}

RECENSIONER (senaste 10):
${reviews.slice(0, 10).map((r: any) => `- ${r.rating} stjärnor: ${r.text?.text || 'Ingen text'}`).join('\n')}

Returnera exakt detta JSON:
{
  "score": 0-100,
  "summary": "2-3 meningar på svenska",
  "napConsistency": {
    "score": 0-10,
    "websiteNap": {"name": "...", "address": "...", "phone": "..."},
    "googleNap": {"name": "...", "address": "...", "phone": "..."},
    "issues": ["..."]
  },
  "gbpAnalysis": {
    "score": 0-10,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "verified": boolean,
    "warning": "string eller null"
  },
  "reviewAnalysis": {
    "score": 0-10,
    "totalReviews": 0,
    "avgRating": 0,
    "sentiment": "positivt|blandat|negativt",
    "keywords": ["..."],
    "divergenceWarning": "string eller null"
  },
  "competitorComparison": [
    {
      "name": "Exempelkonkurrent",
      "score": 75,
      "whyTheyWin": "...",
      "yourGap": "..."
    }
  ],
  "tailoredFixes": [
    {
      "priority": 1,
      "title": "...",
      "action": "...",
      "code": "färdig kod om relevant",
      "expectedImpact": "Hög|Medium|Låg"
    }
  ]
}

Regler:
- Om GBP inte är verifierad (VERIFIERAD: false), nämn detta i summary och gbpAnalysis.warning
- Om GBP-data saknas, fokusera på vad som behövs för att skapa/optimera den
- Ge färdig JSON-LD LocalBusiness-schema med korrekt data från GBP
- Föreslå alltid 2-3 konkurrenter baserat på bransch och ort
- tailoredFixes ska vara rankad efter ROI för lokal AI-synlighet
`
}
