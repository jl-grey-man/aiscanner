def _format_extra_page(page: dict) -> str:
    return f"""
EXTRA SIDA: {page['url']}
- Titel: {page['title']}
- H1: {page['h1']}
- Telefon: {', '.join(page['nap_hints']['phones']) or 'Inga'}
- Orter: {', '.join(page['nap_hints']['cities']) or 'Inga'}
- Text (första 2000 tecken): {page['body_text'][:2000]}
"""


def build_free_prompt(data: dict) -> str:
    """Build prompt for free Gemini Flash 2.0 analysis."""
    return f"""Du är en svensk AI-sökningsanalytiker. Analysera hemsidan nedan.
Svara ENDAST i JSON. Ingen markdown, ingen förklaring utanför JSON.

VIKTIGAST: Returnera ALLTID fältet "phases" med exakt 4 faser. Varje fas måste ha 4-6 checks. Detta får INTE saknas.

URL: {data['url']}
TITEL: {data['title']}
META DESCRIPTION: {data['meta_description']}
ROBOTS META: {data['robots_meta'] or 'Saknas'}
H1: {data['h1']}
H2: {' | '.join(data['h2s'])}
ROBOTS.TXT: {'Finns' if data['robots_txt'] else 'Saknas'}
SITEMAP: {f"Finns, {data['sitemap_url_count']} URL:er" if data['sitemap_xml'] else 'Saknas'}
LLMS.TXT: {'Finns' if data['llms_txt'] else 'Saknas'}
LOCALBUSINESS SCHEMA: {'Ja' if data['has_local_business_schema'] else 'Nej'}
RESTAURANT/FOODESTABLISHMENT SCHEMA: {'Ja' if data.get('has_restaurant_schema') else 'Nej'}
SCHEMA-SKRIPT: {chr(10).join(data['schema_scripts']).strip()[:3000]}
TELEFON HITTADE: {', '.join(data['nap_hints']['phones']) or 'Inga'}
ORTER HITTADE: {', '.join(data['nap_hints']['cities']) or 'Inga'}
BODY TEXT (första 3000 tecken): {data['body_text'][:3000]}

{''.join(_format_extra_page(p) for p in data.get('extra_pages', []))}

GOOGLE BUSINESS PROFILE: {'Hittad: ' + data['_gbp_data']['name'] + ' (' + str(data['_gbp_data'].get('rating', '?')) + ' stjärnor, ' + str(data['_gbp_data'].get('review_count', 0)) + ' recensioner) på ' + data['_gbp_data'].get('address', '') if data.get('_gbp_data') else 'Saknas — inget GBP hittades via Google Places API'}

Returnera exakt detta JSON:
{{
  "score": 0-100,
  "summary": "2-3 meningar på svenska",
  "phases": [
    {{
      "id": "technical",
      "label": "Teknisk grund",
      "checks": [
        {{"title": "HTTPS-säkerhet", "status": "good|warning|bad", "finding": "...", "what": "vad detta kontrollerar", "why": "varför det spelar roll för AI-synlighet", "fix": ""}},
        {{"title": "Robots.txt", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Sitemap.xml", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Språkdeklaration", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Serverhuvuden", "status": "good|warning|bad", "finding": "...", "fix": ""}}
      ]
    }},
    {{
      "id": "local",
      "label": "Lokal synlighet",
      "checks": [
        {{"title": "NAP-data", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Ort i titel & H1", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "LocalBusiness Schema", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Google Business Profile", "status": "good|warning|bad", "finding": "...", "fix": ""}}
      ]
    }},
    {{
      "id": "aireadiness",
      "label": "AI-beredskap",
      "checks": [
        {{"title": "llms.txt", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "AI-crawler tillåtelse", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Strukturerad data (Schema.org)", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Meta-taggar & Open Graph", "status": "good|warning|bad", "finding": "...", "fix": ""}}
      ]
    }},
    {{
      "id": "content",
      "label": "Innehåll",
      "checks": [
        {{"title": "Rubrikstruktur (H1-H3)", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Title & meta description", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Entitetstydlighet", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "Innehållsfräschhet", "status": "good|warning|bad", "finding": "...", "fix": ""}},
        {{"title": "FAQ-innehåll", "status": "good|warning|bad", "finding": "...", "fix": ""}}
      ]
    }}
  ],
  "categories": {{
    "technical": {{"score": 0-10, "label": "Teknisk grund"}},
    "local": {{"score": 0-10, "label": "Lokal synlighet"}},
    "aireadiness": {{"score": 0-10, "label": "AI-beredskap"}},
    "content": {{"score": 0-10, "label": "Innehåll"}}
  }},
  "criticalIssues": [
    {{"severity": "high|medium|low", "category": "technical|local|aireadiness|content", "title": "...", "description": "...", "fix": "...", "codeExample": "null"}}
  ],
  "quickWins": [
    {{"title": "...", "fix": "...", "effort": "small"}}
  ],
  "localSignals": {{
    "napFound": boolean,
    "cityFound": boolean,
    "cityName": "string eller null",
    "hasLocalBusinessSchema": boolean,
    "schemaType": "string eller null"
  }}
}}

Regler:
- "phases" är OBLIGATORISKT och får aldrig saknas. Varje fas måste ha checks.
- Sätt status "good" när något är korrekt. Var generös med "good".
- Sätt "warning" för saker som kan förbättras.
- Sätt "bad" bara för allvarliga brister.
- För VARJE check med status "warning" eller "bad", skriv ALLTID tydliga "what" och "why":
  - "what": 1 mening som förklarar VAD detta är (t.ex. "HTTPS är ett krypteringsprotokoll som säkrar trafiken mellan besökare och server.")
  - "why": 1 mening som förklarar VARFÖR det spelar roll (t.ex. "AI-sökmotorer prioriterar säkra sidor och användare lämnar osäkra sidor snabbare.")
- "what" och "why" ska vara på svenska, konkreta och max 1 mening vardera.
- Om LocalBusiness-schema saknas, ge färdig JSON-LD i codeExample.
- Om ort saknas i titel/H1, föreslå exakt ny titel.
- Var konkret, inga generiska råd.
"""


def build_premium_prompt(free_report: dict, place_data: dict | None, reviews: list) -> str:
    """Build prompt for premium Gemini 2.5 Pro analysis."""
    reviews_text = "\n".join(
        f"- {r.get('rating', '?')} stjärnor: {r.get('text', 'Ingen text')}" 
        for r in reviews[:10]
    ) if reviews else "Inga recensioner hittade."

    place_name = place_data.get('displayName', {}).get('text', 'Saknas') if place_data else 'Saknas'
    place_address = place_data.get('formattedAddress', 'Saknas') if place_data else 'Saknas'
    place_phone = place_data.get('nationalPhoneNumber', 'Saknas') if place_data else 'Saknas'
    place_types = ', '.join(place_data.get('types', [])) if place_data else 'Saknas'
    place_rating = place_data.get('rating', 'Saknas') if place_data else 'Saknas'
    place_count = place_data.get('userRatingCount', 0) if place_data else 0
    place_hours = place_data.get('regularOpeningHours', {}).get('weekdayDescriptions', 'Saknas') if place_data else 'Saknas'
    place_summary = place_data.get('editorialSummary', {}).get('text', 'Saknas') if place_data else 'Saknas'

    return f"""Du är en svensk lokal AI-sökningsstrateg. Du har grundrapporten och extern data.
Svara ENDAST i JSON.

GRUNDRAPPORT: {str(free_report)}

GOOGLE BUSINESS PROFILE:
- Namn: {place_name}
- Adress: {place_address}
- Telefon: {place_phone}
- Kategorier: {place_types}
- Betyg: {place_rating} ({place_count} recensioner)
- Öppettider: {place_hours}
- Beskrivning: {place_summary}

RECENSIONER (senaste 10):
{reviews_text}

Returnera exakt detta JSON:
{{
  "score": 0-100,
  "summary": "2-3 meningar på svenska",
  "napConsistency": {{
    "score": 0-10,
    "websiteNap": {{"name": "...", "address": "...", "phone": "..."}},
    "googleNap": {{"name": "...", "address": "...", "phone": "..."}},
    "issues": ["..."]
  }},
  "gbpAnalysis": {{
    "score": 0-10,
    "strengths": ["..."],
    "weaknesses": ["..."]
  }},
  "reviewAnalysis": {{
    "score": 0-10,
    "totalReviews": 0,
    "avgRating": 0,
    "sentiment": "positivt|blandat|negativt",
    "keywords": ["..."],
    "divergenceWarning": "string eller null"
  }},
  "competitorComparison": [
    {{
      "name": "Exempelkonkurrent",
      "score": 75,
      "whyTheyWin": "...",
      "yourGap": "..."
    }}
  ],
  "tailoredFixes": [
    {{
      "priority": 1,
      "title": "...",
      "action": "...",
      "code": "färdig kod om relevant",
      "expectedImpact": "Hög|Medium|Låg"
    }}
  ]
}}

Regler:
- Om GBP-data saknas, fokusera på vad som behövs för att skapa/optimera den
- Ge färdig JSON-LD LocalBusiness-schema med korrekt data från GBP
- Föreslå alltid 2-3 konkurrenter baserat på bransch och ort
- tailoredFixes ska vara rankad efter ROI för lokal AI-synlighet
"""
