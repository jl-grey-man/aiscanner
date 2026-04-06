import json
from typing import AsyncGenerator
from api.scrapers.fetcher import fetch_page
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.meta import check_meta
from api.scrapers.schema import check_schema
from api.ai.client import ask_sonnet
from api.ai.prompts import entity_clarity_prompt


async def run_checks(url: str) -> AsyncGenerator[dict, None]:
    page = await fetch_page(url)

    if page["error"]:
        yield {"event": "error", "data": {"message": f"Kunde inte hämta sidan: {page['error']}"}}
        return

    soup = page["soup"]
    headers = page["headers"]
    results = []

    # 1. HTTPS
    card = _check_https(url)
    results.append(card)
    yield {"event": "card", "data": card}

    # 2. Language declaration
    meta = check_meta(soup, headers)
    card = _check_language(meta)
    results.append(card)
    yield {"event": "card", "data": card}

    # 3. robots.txt
    robots = await check_robots(url)
    card = _check_robots_card(robots)
    results.append(card)
    yield {"event": "card", "data": card}

    # 4. llms.txt
    llms = await check_llms_txt(url)
    card = _check_llms_card(llms)
    results.append(card)
    yield {"event": "card", "data": card}

    # 5. Meta tags
    card = _check_meta_tags(meta)
    results.append(card)
    yield {"event": "card", "data": card}

    # 6. Heading hierarchy
    card = _check_headings(meta)
    results.append(card)
    yield {"event": "card", "data": card}

    # 7. Schema markup
    schema = check_schema(soup)
    card = _check_schema_card(schema)
    results.append(card)
    yield {"event": "card", "data": card}

    # 8. Content freshness
    card = _check_freshness(meta, headers)
    results.append(card)
    yield {"event": "card", "data": card}

    # 9. Entity clarity (Sonnet)
    text = soup.get_text(separator=" ", strip=True)
    try:
        entity_response = await ask_sonnet(entity_clarity_prompt(text))
        # Claude may wrap JSON in markdown code blocks — strip them
        clean = entity_response.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        entity_data = json.loads(clean.strip())
    except Exception:
        entity_data = {"clear": False, "recommendation": "Kunde inte analysera entitetstydlighet."}
    card = _check_entity_card(entity_data)
    results.append(card)
    yield {"event": "card", "data": card}

    # 10. FAQ sections
    faq_elements = soup.find_all(["details", "summary"]) or []
    has_faq_page = schema.get("has_faq", False)
    card = _check_faq_card(has_faq_page, len(faq_elements))
    results.append(card)
    yield {"event": "card", "data": card}

    # Summary
    good = sum(1 for r in results if r["status"] == "good")
    warning = sum(1 for r in results if r["status"] == "warning")
    bad = sum(1 for r in results if r["status"] == "bad")
    score = round((good * 10 + warning * 5) / (len(results) * 10) * 100)
    yield {"event": "summary", "data": {"score": score, "good": good, "warning": warning, "bad": bad}}
    yield {"event": "done", "data": {}}


def _check_https(url: str) -> dict:
    is_https = url.startswith("https://")
    return {
        "id": 1, "title": "HTTPS-säkerhet",
        "status": "good" if is_https else "bad",
        "finding": "Sidan använder HTTPS." if is_https else "Sidan använder inte HTTPS.",
        "fix": "" if is_https else "Aktivera SSL/TLS-certifikat via Let's Encrypt. Alla moderna webbhotell erbjuder detta gratis.",
    }


def _check_language(meta: dict) -> dict:
    lang = meta.get("lang", "")
    if lang:
        return {"id": 2, "title": "Språkdeklaration", "status": "good",
                "finding": f"Sidan har korrekt språkdeklaration: lang=\"{lang}\".", "fix": ""}
    return {"id": 2, "title": "Språkdeklaration", "status": "bad",
            "finding": "Sidan saknar språkdeklaration i HTML-taggen.",
            "fix": "Lägg till lang-attribut på din HTML-tagg: <html lang=\"sv\"> (eller en för engelska)."}


def _check_robots_card(robots: dict) -> dict:
    if not robots.get("exists"):
        return {"id": 3, "title": "AI-crawler åtkomst", "status": "warning",
                "finding": "Ingen robots.txt hittades. AI-sökmotorer kan crawla sidan men det är bäst att vara explicit.",
                "fix": "Skapa en /robots.txt och tillåt AI-crawlers explicit:\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /"}
    blocked = robots.get("blocked_bots", [])
    if blocked:
        bots_str = ", ".join(blocked)
        return {"id": 3, "title": "AI-crawler åtkomst", "status": "bad",
                "finding": f"Dessa AI-crawlers blockeras i robots.txt: {bots_str}.",
                "fix": f"Ta bort eller ändra Disallow-reglerna för: {bots_str} i din robots.txt."}
    return {"id": 3, "title": "AI-crawler åtkomst", "status": "good",
            "finding": "robots.txt tillåter AI-crawlers att indexera sidan.", "fix": ""}


def _check_llms_card(llms: dict) -> dict:
    if llms.get("exists"):
        return {"id": 4, "title": "llms.txt", "status": "good",
                "finding": "llms.txt finns och är korrekt placerad.", "fix": ""}
    return {"id": 4, "title": "llms.txt", "status": "bad",
            "finding": "Ingen llms.txt hittades. Det är den nya standarden för att hjälpa AI att förstå din sida.",
            "fix": "Skapa /llms.txt med en beskrivning av din sida:\n# Företagsnamn\n\n> Vad ni gör på en rad\n\n## Om oss\nLängre beskrivning...\n\n## Tjänster\n- Tjänst 1\n- Tjänst 2"}


def _check_meta_tags(meta: dict) -> dict:
    issues = []
    if not meta["title"]:
        issues.append("Ingen title-tagg")
    elif meta["title_length"] < 30 or meta["title_length"] > 60:
        issues.append(f"Title är {meta['title_length']} tecken (optimal: 30-60)")
    if not meta["description"]:
        issues.append("Ingen meta description")
    elif meta["description_length"] < 100 or meta["description_length"] > 160:
        issues.append(f"Description är {meta['description_length']} tecken (optimal: 100-160)")
    if not issues:
        return {"id": 5, "title": "Meta-taggar", "status": "good",
                "finding": "Title och meta description är välformaterade.", "fix": ""}
    status = "bad" if len(issues) > 1 else "warning"
    return {"id": 5, "title": "Meta-taggar", "status": status,
            "finding": "Problem: " + ". ".join(issues) + ".",
            "fix": "Optimera title (30-60 tecken) och meta description (100-160 tecken) för varje sida."}


def _check_headings(meta: dict) -> dict:
    h1 = meta.get("h1", [])
    if len(h1) == 1:
        return {"id": 6, "title": "Rubrikstruktur", "status": "good",
                "finding": f"Sidan har en H1-rubrik: \"{h1[0][:60]}\".", "fix": ""}
    if len(h1) == 0:
        return {"id": 6, "title": "Rubrikstruktur", "status": "bad",
                "finding": "Sidan saknar H1-rubrik.",
                "fix": "Lägg till en H1-tagg som tydligt beskriver sidans huvudämne: <h1>Din viktigaste rubrik</h1>"}
    return {"id": 6, "title": "Rubrikstruktur", "status": "warning",
            "finding": f"Sidan har {len(h1)} H1-rubriker. Det bör bara finnas en.",
            "fix": "Behåll en H1 som huvudrubrik och gör resten till H2."}


def _check_schema_card(schema: dict) -> dict:
    types = schema.get("types", [])
    if not types:
        return {"id": 7, "title": "Strukturerad data (Schema)", "status": "bad",
                "finding": "Ingen strukturerad data (JSON-LD) hittades.",
                "fix": "Lägg till Organization-schema i din HTML:\n<script type=\"application/ld+json\">\n{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"Ditt Företag\",\"url\":\"https://example.com\",\"description\":\"Vad ni gör\"}\n</script>"}
    return {"id": 7, "title": "Strukturerad data (Schema)", "status": "good",
            "finding": f"Sidan har strukturerad data av typen: {', '.join(types)}.", "fix": ""}


def _check_freshness(meta: dict, headers: dict) -> dict:
    last_modified = headers.get("last-modified", "")
    if last_modified:
        return {"id": 8, "title": "Innehållsfräschhet", "status": "good",
                "finding": f"Servern rapporterar senaste uppdatering: {last_modified}.", "fix": ""}
    return {"id": 8, "title": "Innehållsfräschhet", "status": "warning",
            "finding": "Servern skickar ingen Last-Modified header. AI-sökmotorer kan inte avgöra hur aktuellt innehållet är.",
            "fix": "Konfigurera din server att skicka Last-Modified header, eller lägg till publiceringsdatum i sidans innehåll."}


def _check_entity_card(entity_data: dict) -> dict:
    if entity_data.get("clear"):
        return {"id": 9, "title": "Entitetstydlighet", "status": "good",
                "finding": f"Det är tydligt vad sidan handlar om: {entity_data.get('what_they_do', '')}.", "fix": ""}
    return {"id": 9, "title": "Entitetstydlighet", "status": "bad",
            "finding": "AI har svårt att förstå vad företaget erbjuder och till vem.",
            "fix": entity_data.get("recommendation", "Lägg till en tydlig beskrivning av vad ni gör, för vem, och varför ni är relevanta.")}


def _check_faq_card(has_schema_faq: bool, faq_elements: int) -> dict:
    if has_schema_faq:
        return {"id": 10, "title": "FAQ-innehåll", "status": "good",
                "finding": "Sidan har FAQ-schema markup. AI-sökmotorer kan citera dessa direkt.", "fix": ""}
    if faq_elements > 0:
        return {"id": 10, "title": "FAQ-innehåll", "status": "warning",
                "finding": "Sidan verkar ha FAQ-innehåll men saknar FAQPage-schema markup.",
                "fix": "Lägg till FAQPage JSON-LD schema för att AI ska kunna extrahera och citera dina frågor och svar."}
    return {"id": 10, "title": "FAQ-innehåll", "status": "bad",
            "finding": "Ingen FAQ-sektion hittades. FAQ-innehåll ökar chansen att AI citerar din sida med 40%.",
            "fix": "Lägg till en FAQ-sektion med vanliga frågor om din tjänst/produkt. Inkludera FAQPage JSON-LD schema."}
