SYSTEM = """Du är en expert på AI-sökoptimering (GEO/AEO).
Skriv på svenska, tydligt och direkt. Inga buzzwords. Ingen jargong.
Anta att läsaren är smart men inte tekniker.
Var konkret och specifik. Max 3 meningar per svar om inget annat anges."""

def entity_clarity_prompt(html_text: str) -> str:
    truncated = html_text[:4000]
    return f"""{SYSTEM}

Analysera denna webbsidetext och bedöm hur tydligt det framgår vad företaget/organisationen gör,
vem de riktar sig till, och vad de heter.

Text:
{truncated}

Svara med JSON:
{{
  "clear": true/false,
  "company_name_found": true/false,
  "what_they_do": "en mening om vad de gör, eller null",
  "missing": ["vad som saknas"],
  "recommendation": "en konkret förbättring"
}}"""

def faq_quality_prompt(faq_content: str) -> str:
    return f"""{SYSTEM}

Analysera dessa FAQ-frågor och bedöm om de är formulerade på ett sätt som AI-sökmotorer
kan använda för att svara på användarfrågor:

{faq_content[:2000]}

Svara med JSON:
{{
  "quality": "bra|medel|dålig",
  "count": antal_fragor,
  "issues": ["problem 1", "problem 2"],
  "recommendation": "konkret förbättring"
}}"""

def fix_recommendation_prompt(check_name: str, finding: str) -> str:
    return f"""{SYSTEM}

En hemsida har följande problem med sin AI-sökoptimering:
Check: {check_name}
Fynd: {finding}

Skriv en konkret fix-instruktion på svenska. Max 3-4 meningar.
Om det finns kod att skriva, visa exakt kod. Var specifik."""
