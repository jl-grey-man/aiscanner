import { ScrapedData } from './scraper'

export function buildFreePrompt(data: ScrapedData): string {
  const main = data.pages[0]
  const extras = data.pages.slice(1)

  const pagesText = data.pages.map((p, i) => `
SIDA ${i + 1}: ${p.url}
TITEL: ${p.title}
H1: ${p.h1 || '(saknas)'}
H2: ${p.h2s.join(' | ') || '(saknas)'}
SCHEMA_TYPER: ${p.schemaTypes.length > 0 ? p.schemaTypes.join(', ') : 'Inga'}
LOCALBUSINESS_EXAKT: ${p.hasLocalBusinessSchema ? 'Ja' : 'Nej'}
LOCALBUSINESS_SUBTYP: ${p.hasAnyLocalBusinessSchema ? 'Ja' : 'Nej'}
RESTAURANT_SCHEMA: ${p.hasRestaurantSchema ? 'Ja' : 'Nej'}
CANONICAL: ${p.canonical || '(saknas)'}
GOOGLE_MAPS: ${p.hasGoogleMaps ? 'Ja' : 'Nej'}
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

Returnera exakt detta JSON-schema. UTVÄRDERA EXAKT alla checks nedan. Varje check MÅSTE finnas med i svaret:

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
        {"title": "HTTPS/SSL", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Robots.txt", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Sitemap.xml", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "LLMS.TXT", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Sidhastighet / Core Web Vitals", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Canonical tags", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."}
      ]
    },
    {
      "id": "local",
      "label": "Lokal synlighet",
      "checks": [
        {"title": "NAP (Name, Address, Phone) på hemsidan", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Telefonnummer synligt", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Ort / stad nämns på sidan", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Google Maps embed eller länk", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "LocalBusiness schema", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Öppettider på hemsidan", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."}
      ]
    },
    {
      "id": "aireadiness",
      "label": "AI-beredskap",
      "checks": [
        {"title": "Schema markup (någon typ)", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "LocalBusiness eller Restaurant schema", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "JSON-LD format", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "AI-optimerad meta-beskrivning", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Semantisk HTML-struktur", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."}
      ]
    },
    {
      "id": "content",
      "label": "Innehåll",
      "checks": [
        {"title": "H1-tagg (finns och är unik per sida)", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Title-tagg (optimal längd)", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Meta description", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Alt-texter på bilder", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Internlänkning", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."},
        {"title": "Språk (svenska vs engelska)", "status": "good|warning|bad", "finding": "...", "what": "...", "why": "...", "fix": "..."}
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

VIKTIGA REGLER för phases:
- EXAKT 4 phases: technical, local, aireadiness, content
- EXAKT 23 checks totalt: technical=6, local=6, aireadiness=5, content=6
- ALLA checks MÅSTE finnas med — inga får uteslutas
- status 'good' = kriteriet är uppfyllt, inget att åtgärda
- status 'warning' = delvis uppfyllt, kan förbättras
- status 'bad' = saknas eller bristfälligt, påverkar AI-synlighet
- finding ska vara max 1 mening om vad du hittade
- what/why/fix är valfria men ska vara korta och konkreta när de finns
- Om en check inte kan bedömas från tillgänglig data, sätt 'warning' och förklara varför

Regler:
- Om flera språkversioner finns (t.ex. /en/ + svensk), bedöm om svenska sidor är tillräckliga
- **Schema LocalBusiness**: LOCALBUSINESS_EXAKT=Ja ELLER LOCALBUSINESS_SUBTYP=Ja = LocalBusiness-schema finns (subtypes räknas, t.ex. Plumber/RealEstateAgent/Restaurant är LocalBusiness). Ge INTE 'bad' om subtyp finns. Saknas båda → ge färdig JSON-LD i codeExample.
- **Schema typer**: Använd SCHEMA_TYPER för att rapportera exakt vilka typer som hittades (t.ex. "RealEstateAgent, Organization"). Skriv alltid detta i finding.
- **Canonical**: CANONICAL=(saknas) → 'warning'. CANONICAL=url → 'good'. Använd den faktiska URL:en i finding.
- **Google Maps**: GOOGLE_MAPS=Ja → 'good'. GOOGLE_MAPS=Nej → 'warning' eller 'bad' beroende på om det är ett fysiskt företag.
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
