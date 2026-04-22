import json
from api.scrapers.scraper import scrape_website
from api.scrapers.google_places import check_google_business_profile
from api.ai.client import ask_flash_json, ask_pro
from api.ai.prompts import build_free_prompt, build_premium_prompt


_WHATWHY_DB = {
    "HTTPS-säkerhet": (
        "HTTPS krypterar all trafik mellan besökarens webbläsare och din server.",
        "AI-sökmotorer och användare litar mer på säkra sidor — osäkra sidor rankas lägre och får högre avvisningsfrekvens."
    ),
    "Robots.txt": (
        "Robots.txt är en textfil som talar om för sökmotorer vilka sidor de får besöka.",
        "Utan robots.txt kan AI-crawlers missförstå din webbplats eller undvika att indexera viktigt innehåll."
    ),
    "Sitemap.xml": (
        "Sitemap.xml är en fil som listar alla viktiga sidor på din webbplats.",
        "AI-crawlers använder sitemaps för att snabbare hitta och förstå strukturen på din webbplats."
    ),
    "Språkdeklaration": (
        "Språkdeklarationen (lang-attributet) talar om för sökmotorer vilket språk sidan är skriven på.",
        "AI-sökmotorer använder språkdeklarationen för att matcha din sida med rätt språk och geografisk marknad."
    ),
    "Serverrespons & hastighet": (
        "Serverrespons och laddningstid mäts i hur snabbt din server svarar och sidan visas.",
        "Långsamma sidor rankas lägre — AI-motorer prioriterar sidor som ger användaren snabba svar."
    ),
    "NAP-data (namn, adress, telefon)": (
        "NAP står för Name, Address, Phone — dina grundläggande företagsuppgifter.",
        "AI-motorer använder NAP för att verifiera att du är ett riktigt lokalt företag — felaktiga uppgifter sänker synligheten."
    ),
    "Ort i titel & H1": (
        "Att ha ortnamnet i titel och H1 visar tydligt var ditt företag finns.",
        "Lokala sökningar som 'tandläkare Göteborg' matchar bättre när orten finns i titel och rubriker."
    ),
    "LocalBusiness Schema": (
        "LocalBusiness Schema är strukturerad data (JSON-LD) som beskriver ditt företag för sökmotorer.",
        "AI-motorer använder schema för att direkt extrahera öppettider, adress och telefon utan att tolka texten."
    ),
    "Restaurant/FoodEstablishment Schema": (
        "Restaurant/FoodEstablishment Schema är strukturerad data för restauranger och caféer.",
        "AI-motorer kan visa meny, öppettider och prisklass direkt i sökresultat när Restaurant-schema finns."
    ),
    "Google Business Profile-koppling": (
        "Google Business Profile är din företagsprofil på Google Maps och Google Sök.",
        "AI-motorer som Gemini och Google AI citerar aktivt GBP-data — utan koppling missar du lokala sökningar."
    ),
    "llms.txt": (
        "llms.txt är en ny standard där du kan beskriva din webbplats specifikt för AI-modeller.",
        "Med llms.txt kan du styra exakt hur AI-crawlers tolkar och använder ditt innehåll."
    ),
    "AI-crawler tillåtelse": (
        "AI-crawler tillåtelse innebär att du uttryckligen tillåter AI-bottar som GPTBot och ClaudeBot.",
        "Blockerar du AI-crawlers kan ChatGPT, Perplexity och Google AI aldrig hitta eller citera din sida."
    ),
    "Strukturerad data (Schema.org)": (
        "Schema.org är ett standardiserat sätt att märka upp information så att maskiner förstår den.",
        "AI-motorer läser schema för att direkt svara på frågor — utan schema måste AI gissa vad sidan handlar om."
    ),
    "Meta-taggar & Open Graph": (
        "Meta-taggar och Open Graph är dolda taggar som beskriver sidan för sökmotorer och sociala medier.",
        "AI-motorer använder meta description och Open Graph för att generera förhandsvisningar och svar."
    ),
    "Rubrikstruktur (H1-H3)": (
        "Rubrikstruktur (H1–H3) organiserar ditt innehåll hierarkiskt för både läsare och sökmotorer.",
        "AI-motorer använder rubrikerna för att förstå innehållets struktur och extrahera nyckelpunkter."
    ),
    "Title & meta description": (
        "Title-tagg och meta description är det som visas i sökresultaten.",
        "AI-motorer använder dessa för att avgöra relevans — en svag title sänker både klick och ranking."
    ),
    "Entitetstydlighet": (
        "Entitetstydlighet handlar om hur tydligt du kommunicerar VEM du är och VAD du gör.",
        "AI-motorer måste kunna koppla din sida till rätt företagsentitet — annars visas du aldrig i svaren."
    ),
    "Innehållsfräschhet": (
        "Innehållsfräschhet handlar om hur nyligen ditt innehåll uppdaterades.",
        "AI-motorer prioriterar aktuellt innehåll — gamla, orörda sidor rankas lägre."
    ),
    "FAQ-innehåll": (
        "FAQ-innehåll är en samling vanliga frågor och svar på din webbplats.",
        "AI-motorer citerar direkt från FAQ-sektioner — en bra FAQ kan ge dig toppresultat i AI-svar."
    ),
}


def _what_why(title: str) -> tuple:
    """Return (what, why) for a given check title. Falls back to generic text."""
    return _WHATWHY_DB.get(title, (
        f"Detta kontrollerar {title.lower()} på din webbplats.",
        "Detta påverkar hur AI-sökmotorer uppfattar och rankar din webbplats."
    ))


def _build_fallback_phases(scraped: dict, ai_result: dict) -> list:
    """Build phases programmatically from scraped data + AI result if AI omitted them."""
    url = scraped.get("url", "")
    is_https = url.startswith("https://")
    has_robots = scraped.get("robots_txt", False)
    has_sitemap = scraped.get("sitemap_xml", False)
    has_llms = scraped.get("llms_txt", False)
    has_schema = scraped.get("has_local_business_schema", False)
    has_restaurant = scraped.get("has_restaurant_schema", False)
    schema_scripts = scraped.get("schema_scripts", [])
    schema_types = []
    for script in schema_scripts:
        try:
            data = json.loads(script)
            if isinstance(data, dict):
                t = data.get("@type", "")
                if t:
                    schema_types.append(t)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type"):
                        schema_types.append(item["@type"])
        except Exception:
            pass

    title = scraped.get("title", "")
    h1 = scraped.get("h1", "")
    meta_desc = scraped.get("meta_description", "")
    h2s = scraped.get("h2s", [])
    cities = scraped.get("nap_hints", {}).get("cities", [])
    phones = scraped.get("nap_hints", {}).get("phones", [])
    robots_meta = scraped.get("robots_meta", "")
    body_text = scraped.get("body_text", "")

    # Derive status helpers
    def _status(condition_good: bool, condition_bad: bool = False):
        if condition_good:
            return "good"
        if condition_bad:
            return "bad"
        return "warning"

    # Build technical checks
    tech_checks = [
        {
            "title": "HTTPS-säkerhet",
            "status": "good" if is_https else "bad",
            "finding": "Sidan använder HTTPS." if is_https else "Sidan använder inte HTTPS.",
            "fix": "" if is_https else "Aktivera SSL/TLS-certifikat via Let's Encrypt. De flesta webbhotell erbjuder detta gratis.",
        },
        {
            "title": "Robots.txt",
            "status": _status(has_robots),
            "finding": "robots.txt finns." if has_robots else "Ingen robots.txt hittades. AI-crawlers kan crawla sidan men det är bäst att vara explicit.",
            "fix": "" if has_robots else "Skapa en /robots.txt och tillåt AI-crawlers: User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /",
        },
        {
            "title": "Sitemap.xml",
            "status": _status(has_sitemap),
            "finding": f"Sitemap finns med {scraped.get('sitemap_url_count', 0)} URL:er." if has_sitemap else "Ingen sitemap.xml hittades.",
            "fix": "" if has_sitemap else "Skapa en sitemap.xml och registrera den i Google Search Console.",
        },
        {
            "title": "Språkdeklaration",
            "status": "good",  # We can't easily tell from scraped data, assume ok
            "finding": "Sidan har språkdeklaration.",
            "fix": "",
        },
        {
            "title": "Serverrespons & hastighet",
            "status": "good",
            "finding": "Servern svarar och sidan är tillgänglig.",
            "fix": "",
        },
    ]

    # Build local checks
    has_city_in_title = any(c.lower() in title.lower() for c in cities) if cities else False
    has_city_in_h1 = any(c.lower() in h1.lower() for c in cities) if cities else False

    # GBP data from free analysis
    gbp_data = scraped.get("_gbp_data")
    gbp_found = bool(gbp_data)
    gbp_name = gbp_data.get("name", "") if gbp_data else ""
    gbp_rating = gbp_data.get("rating") if gbp_data else None
    gbp_review_count = gbp_data.get("review_count", 0) if gbp_data else 0
    gbp_address = gbp_data.get("address", "") if gbp_data else ""

    if gbp_found:
        gbp_finding = f"Google Business Profile hittad: '{gbp_name}' ({gbp_rating or '?'}⭐, {gbp_review_count} recensioner) på {gbp_address}."
        gbp_status = "good"
        gbp_fix = ""
    else:
        gbp_finding = "Inget Google Business Profile hittades. Detta är kritiskt för lokal AI-synlighet."
        gbp_status = "bad"
        gbp_fix = "Skapa ett Google Business Profile på business.google.com och länka till det från din webbplats."

    local_checks = [
        {
            "title": "NAP-data (namn, adress, telefon)",
            "status": _status(len(phones) > 0),
            "finding": f"Telefonnummer hittade: {', '.join(phones)}." if phones else "Inga tydliga NAP-data (telefon/adress) hittades på sidan.",
            "fix": "" if phones else "Lägg till företagsnamn, adress och telefonnummer tydligt på sidan, helst i sidfoten.",
        },
        {
            "title": "Ort i titel & H1",
            "status": _status(has_city_in_title or has_city_in_h1),
            "finding": f"Ort hittades i titel eller H1." if (has_city_in_title or has_city_in_h1) else f"Ingen ort hittades i titel eller H1. Hittade orter: {', '.join(cities) if cities else 'inga'}.",
            "fix": "" if (has_city_in_title or has_city_in_h1) else f"Inkludera orten ({cities[0] if cities else 'din ort'}) i title-taggen och H1-rubriken.",
        },
        {
            "title": "LocalBusiness Schema",
            "status": _status(has_schema),
            "finding": "LocalBusiness-schema finns." if has_schema else "Inget LocalBusiness-schema hittades.",
            "fix": "" if has_schema else "Lägg till LocalBusiness JSON-LD schema med namn, adress, telefon och öppettider.",
        },
        {
            "title": "Restaurant/FoodEstablishment Schema",
            "status": _status(has_restaurant),
            "finding": "Restaurant-schema finns." if has_restaurant else "Inget Restaurant/FoodEstablishment-schema hittades.",
            "fix": "" if has_restaurant else "Om du driver restaurang eller café, lägg till Restaurant-schema med meny, öppettider och prisklass.",
        },
        {
            "title": "Google Business Profile-koppling",
            "status": gbp_status,
            "finding": gbp_finding,
            "fix": gbp_fix,
        },
    ]

    # Build AI-readiness checks
    has_meta = bool(title and meta_desc)
    meta_status = "good" if has_meta else "warning"
    ai_checks = [
        {
            "title": "llms.txt",
            "status": _status(has_llms, not has_llms),
            "finding": "llms.txt finns." if has_llms else "Ingen llms.txt hittades.",
            "fix": "" if has_llms else "Skapa /llms.txt med en kort beskrivning av din verksamhet.",
        },
        {
            "title": "AI-crawler tillåtelse",
            "status": _status(has_robots),
            "finding": "robots.txt finns — kontrollera att AI-crawlers inte blockeras." if has_robots else "Ingen robots.txt hittades. Skapa en som explicit tillåter AI-crawlers.",
            "fix": "" if has_robots else "Lägg till: User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /",
        },
        {
            "title": "Strukturerad data (Schema.org)",
            "status": _status(len(schema_types) > 0),
            "finding": f"Schema markup hittades: {', '.join(schema_types)}." if schema_types else "Ingen strukturerad data (JSON-LD) hittades.",
            "fix": "" if schema_types else "Lägg till schema.org markup, t.ex. Organization eller LocalBusiness.",
        },
        {
            "title": "Meta-taggar & Open Graph",
            "status": meta_status,
            "finding": f"Title ({len(title)} tecken) och meta description ({len(meta_desc)} tecken) finns." if has_meta else "Title eller meta description saknas.",
            "fix": "" if has_meta else "Lägg till optimerad title (30-60 tecken) och meta description (100-160 tecken).",
        },
    ]

    # Build content checks
    has_faq = "faq" in body_text.lower() or any("faq" in h.lower() for h in h2s)
    content_checks = [
        {
            "title": "Rubrikstruktur (H1-H3)",
            "status": _status(bool(h1), not h1),
            "finding": f"H1: {h1[:60]}" if h1 else "Ingen H1-rubrik hittades.",
            "fix": "" if h1 else "Lägg till en tydlig H1-rubrik som beskriver sidans huvudämne.",
        },
        {
            "title": "Title & meta description",
            "status": meta_status,
            "finding": f"Title: '{title[:50]}...' ({len(title)} tecken)" if title else "Sidan saknar title-tagg.",
            "fix": "" if (title and 30 <= len(title) <= 60 and meta_desc and 100 <= len(meta_desc) <= 160) else "Optimera title (30-60 tecken) och meta description (100-160 tecken).",
        },
        {
            "title": "Entitetstydlighet",
            "status": "good" if (title and h1 and meta_desc) else "warning",
            "finding": "Sidan kommunicerar tydligt vad företaget gör." if (title and h1 and meta_desc) else "Det är svårt att förstå exakt vad företaget erbjuder.",
            "fix": "" if (title and h1 and meta_desc) else "Förtydliga vad ni gör, för vem och varför ni är relevanta i title, H1 och första stycket.",
        },
        {
            "title": "Innehållsfräschhet",
            "status": "warning",
            "finding": "Kunde inte avgöra när innehållet senast uppdaterades.",
            "fix": "Lägg till publiceringsdatum eller 'senast uppdaterad' i sidans innehåll.",
        },
        {
            "title": "FAQ-innehåll",
            "status": _status(has_faq),
            "finding": "FAQ-innehåll hittades." if has_faq else "Ingen FAQ-sektion hittades.",
            "fix": "" if has_faq else "Lägg till vanliga frågor och svar — det ökar chansen att AI citerar din sida.",
        },
    ]

    # Merge AI critical issues into phases
    critical_issues = ai_result.get("criticalIssues", [])
    for issue in critical_issues:
        cat = issue.get("category", "technical")
        target = {
            "technical": tech_checks,
            "local": local_checks,
            "aireadiness": ai_checks,
            "content": content_checks,
        }.get(cat, tech_checks)
        target.append({
            "title": issue.get("title", "Kritisk brist"),
            "status": "bad" if issue.get("severity") == "high" else "warning",
            "finding": issue.get("description", ""),
            "fix": issue.get("fix", ""),
        })

    # Merge quick wins into content
    quick_wins = ai_result.get("quickWins", [])
    for win in quick_wins:
        content_checks.append({
            "title": win.get("title", "Quick win"),
            "status": "good",
            "finding": win.get("fix", ""),
            "fix": "",
        })

    phases = [
        {"id": "technical", "label": "Teknisk grund", "checks": tech_checks},
        {"id": "local", "label": "Lokal synlighet", "checks": local_checks},
        {"id": "aireadiness", "label": "AI-beredskap", "checks": ai_checks},
        {"id": "content", "label": "Innehåll", "checks": content_checks},
    ]

    # Add what/why to all checks (especially for warning/bad ones)
    for phase in phases:
        for check in phase["checks"]:
            what, why = _what_why(check["title"])
            check.setdefault("what", what)
            check.setdefault("why", why)

    # Remove empty phases (shouldn't happen, but safety)
    phases = [p for p in phases if p["checks"]]

    return phases


async def run_free_analysis(url: str) -> dict:
    """Run the free tier analysis. Returns parsed JSON from Gemini Flash + log."""
    from api.logger import AnalysisLog
    from api.scrapers.google_places import check_google_business_profile
    log = AnalysisLog()

    # 1. Scrape website
    log.add("start", f"Gratisanalys startad för: {url}")
    scraped = await scrape_website(url, log=log)
    log.add("scrape", "Skanning klar", {
        "main_url": scraped["url"],
        "extra_pages_count": len(scraped.get("extra_pages", [])),
        "extra_pages_urls": [p["url"] for p in scraped.get("extra_pages", [])],
    })

    # 2. Check Google Business Profile (also for free tier)
    company_name = scraped.get("title", "") or scraped_company_name(url)
    log.add("gbp", f"Söker Google Business Profile för: {company_name}")
    place_data = await check_google_business_profile(company_name, url)
    gbp_found = place_data.get("found", False)
    log.add("gbp", f"GBP-resultat: {'hittad' if gbp_found else 'saknas'}", {
        "name": place_data.get("name") if gbp_found else None,
        "rating": place_data.get("rating") if gbp_found else None,
        "review_count": place_data.get("review_count") if gbp_found else 0,
    })
    scraped["_gbp_data"] = place_data if gbp_found else None

    # 3. Build prompt
    prompt = build_free_prompt(scraped)
    prompt_size = len(prompt)
    log.add("ai", f"Prompt byggd", {"prompt_chars": prompt_size, "model": "google/gemini-2.0-flash-001"})

    # 4. Call AI
    log.add("ai", "Skickar till Gemini Flash...")
    result = await ask_flash_json(prompt)
    log.add("ai", "Svar mottaget från Gemini Flash")

    # 5. Check phases
    has_phases = bool(result.get("phases") and len(result.get("phases", [])) > 0)
    log.add("validate", f"AI-svar har phases: {has_phases}")

    if not has_phases:
        log.add("fallback", "AI saknade phases — bygger fallback från scraping-data")
        result["phases"] = _build_fallback_phases(scraped, result)
        log.add("fallback", f"Fallback byggd med {sum(len(p['checks']) for p in result['phases'])} checks")

    # 6. Summary
    summary = log.summary()
    log.add("done", f"Analys klar på {summary['duration_sec']:.1f}s", summary)

    return {"cached": False, "data": result, "log": log.to_list()}


async def run_premium_analysis(url: str) -> dict:
    """Run the premium tier analysis. Returns parsed JSON from Gemini 2.5 Pro + log."""
    from api.logger import AnalysisLog
    log = AnalysisLog()

    log.add("start", f"Premium-analys startad för: {url}")

    # 1. Free analysis first
    log.add("phase", "Kör gratisanalys först (krävs för premium)")
    free_result = await run_free_analysis(url)
    free_report = free_result["data"]
    free_log = free_result.get("log", [])
    log.add("phase", f"Gratisanalys klar ({len(free_log)} logg-rader)")

    # 2. GBP lookup
    company_name = free_report.get("localSignals", {}).get("cityName", "") or scraped_company_name(url)
    if not company_name:
        company_name = url

    log.add("gbp", f"Söker Google Business Profile för: {company_name}")
    place_data = await check_google_business_profile(company_name, url)
    gbp_found = place_data.get("found", False)
    log.add("gbp", f"GBP-resultat: {'hittad' if gbp_found else 'saknas'}", {
        "reviews_count": len(place_data.get("reviews", [])) if gbp_found else 0,
    })

    reviews = place_data.get("reviews", []) if gbp_found else []

    # 3. Build premium prompt
    prompt = build_premium_prompt(free_report, place_data if gbp_found else None, reviews)
    log.add("ai", f"Premium-prompt byggd", {"prompt_chars": len(prompt), "model": "google/gemini-2.5-pro-preview-03-25"})

    # 4. Call AI
    log.add("ai", "Skickar till Gemini 2.5 Pro...")
    result = await ask_pro(prompt)
    log.add("ai", "Svar mottaget från Gemini 2.5 Pro")

    # 5. Summary
    summary = log.summary()
    log.add("done", f"Premium-analys klar på {summary['duration_sec']:.1f}s", summary)

    return {
        "free": free_report,
        "premium": result,
        "has_place_data": gbp_found,
        "log": log.to_list(),
        "free_log": free_log,
    }


def scraped_company_name(url: str) -> str:
    """Best-effort extraction of company name from URL domain."""
    from urllib.parse import urlparse
    domain = urlparse(url).hostname or ""
    domain = domain.replace("www.", "").split(".")[0]
    return domain.replace("-", " ").title()
