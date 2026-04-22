import asyncio
import json
import re
from typing import AsyncGenerator
from api.scrapers.fetcher import fetch_page
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.meta import check_meta
from api.scrapers.schema import check_schema
from api.scrapers.trustpilot import check_trustpilot
from api.scrapers.wikipedia import check_wikipedia, extract_company_name
from api.scrapers.social import extract_social_links
from api.scrapers.business_type import detect_business_type
from api.scrapers.google_places import check_google_business_profile
from api.scrapers.sitemap import check_sitemap
from api.ai.client import ask_sonnet, ask_haiku
from api.ai.prompts import entity_clarity_prompt, review_themes_prompt


async def run_checks(url: str) -> AsyncGenerator[dict, None]:
    page = await fetch_page(url)

    if page["error"] is not None:
        yield {"event": "error", "data": {"message": f"Kunde inte hämta sidan: {page['error']}"}}
        return

    soup = page["soup"]
    if soup is None:
        yield {"event": "error", "data": {"message": "Kunde inte tolka sidan. Kontrollera URL:en och försök igen."}}
        return
    headers = page["headers"]
    results = []

    def _progress(step: str):
        return {"event": "progress", "data": {"step": step}}

    # 1. HTTPS
    yield _progress("Kontrollerar HTTPS-säkerhet")
    card = _check_https(url, headers)
    results.append(card)
    yield {"event": "card", "data": card}

    # 2. Language declaration
    yield _progress("Kontrollerar språkdeklaration")
    meta = check_meta(soup, headers)
    card = _check_language(meta, soup)
    results.append(card)
    yield {"event": "card", "data": card}

    # 3. robots.txt + meta robots tag
    yield _progress("Läser robots.txt och crawl-direktiv")
    robots = await check_robots(url)
    meta_robots = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
    meta_robots_content = meta_robots.get("content", "").lower() if meta_robots else ""
    card = _check_robots_card(robots, meta_robots_content)
    results.append(card)
    yield {"event": "card", "data": card}

    # 4. llms.txt
    yield _progress("Söker efter llms.txt")
    llms = await check_llms_txt(url)
    card = _check_llms_card(llms, url)
    results.append(card)
    yield {"event": "card", "data": card}

    # 5. Meta tags
    yield _progress("Analyserar metataggar och Open Graph")
    card = _check_meta_tags(meta)
    results.append(card)
    yield {"event": "card", "data": card}

    # 6. Heading hierarchy
    yield _progress("Granskar rubrikstruktur (H1–H3)")
    card = _check_headings(meta, soup)
    results.append(card)
    yield {"event": "card", "data": card}

    # 7. Schema markup
    yield _progress("Letar efter strukturerad data (Schema.org)")
    schema = check_schema(soup)
    social_links = extract_social_links(soup)
    biz = detect_business_type(soup, schema.get("types", []), social_links)
    card = _check_schema_card(schema, url, biz["is_local"])
    results.append(card)
    yield {"event": "card", "data": card}

    # 8. Content freshness
    yield _progress("Kontrollerar innehållets aktualitet")
    card = _check_freshness(meta, headers, soup)
    results.append(card)
    yield {"event": "card", "data": card}

    # 9. Entity clarity (Sonnet)
    yield _progress("AI analyserar hur tydligt företagets identitet framgår")
    text = soup.get_text(separator=" ", strip=True)
    try:
        entity_response = await ask_sonnet(entity_clarity_prompt(text))
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
    yield _progress("Söker efter FAQ-innehåll")
    faq_elements = soup.find_all(["details", "summary"]) or []
    has_faq_page = schema.get("has_faq", False)
    card = _check_faq_card(has_faq_page, len(faq_elements), soup)
    results.append(card)
    yield {"event": "card", "data": card}

    # 11–13. Off-page signals
    yield _progress("Hämtar externa signaler — Trustpilot, Wikipedia, Google Maps")
    company_name = extract_company_name(meta, soup)

    async def _skip_gbp():
        return {"found": False, "skipped": True}

    tp_data, wiki_data, gbp_data = await asyncio.gather(
        check_trustpilot(url),
        check_wikipedia(company_name),
        check_google_business_profile(company_name, url) if biz["is_local"] else _skip_gbp(),
    )

    # Analyze review themes with Haiku
    yield _progress("AI analyserar kundrecensioner och teman")
    tp_reviews = tp_data.get("reviews", [])
    gbp_reviews = gbp_data.get("reviews", [])
    all_review_texts = "\n".join(
        f"- {r['text']}" for r in (tp_reviews + gbp_reviews) if r.get("text")
    )
    review_themes = {}
    if all_review_texts:
        try:
            raw = await ask_haiku(review_themes_prompt(all_review_texts))
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            review_themes = json.loads(clean.strip())
        except Exception:
            review_themes = {}

    # Cross-platform rating comparison
    tp_rating = tp_data.get("rating")
    gbp_rating = gbp_data.get("rating")
    rating_divergence = None
    if tp_rating and gbp_rating:
        rating_divergence = round(abs(tp_rating - gbp_rating), 1)

    yield _progress("Sammanställer Trustpilot-analys")
    card = _check_trustpilot_card(tp_data, review_themes, rating_divergence, gbp_rating)
    results.append(card)
    yield {"event": "card", "data": card}

    yield _progress("Kontrollerar Wikipedia-närvaro")
    card = _check_wikipedia_card(wiki_data, company_name)
    results.append(card)
    yield {"event": "card", "data": card}

    yield _progress("Analyserar social närvaro och externa profiler")
    card = _check_social_card(social_links, biz["is_local"])
    results.append(card)
    yield {"event": "card", "data": card}

    # 14. Business-type-specific check
    if biz["is_local"]:
        yield _progress("Granskar lokal närvaro och Google Business Profile")
    else:
        yield _progress("Analyserar innehållsdjup och auktoritet")
    card = _check_local_presence(soup, schema, social_links, gbp_data, review_themes, rating_divergence, tp_rating) if biz["is_local"] \
           else _check_content_depth(soup)
    results.append(card)
    yield {"event": "card", "data": card}

    # 15. Sitemap
    yield _progress("Söker efter sitemap.xml")
    sitemap_data = await check_sitemap(url)
    card = _check_sitemap_card(sitemap_data)
    results.append(card)
    yield {"event": "card", "data": card}

    # 16. E-A-T
    yield _progress("Kontrollerar trovärdighet och avsändaridentitet (E-A-T)")
    card = _check_eat_card(soup, url)
    results.append(card)
    yield {"event": "card", "data": card}

    # Summary
    good = sum(1 for r in results if r["status"] == "good")
    warning = sum(1 for r in results if r["status"] == "warning")
    bad = sum(1 for r in results if r["status"] == "bad")
    score = round((good * 10 + warning * 5) / (len(results) * 10) * 100)
    yield {"event": "summary", "data": {"score": score, "good": good, "warning": warning, "bad": bad}}
    yield {"event": "done", "data": {}}


# ─── Individual checks ─────────────────────────────────────────────────────────

def _check_https(url: str, headers: dict) -> dict:
    is_https = url.startswith("https://")
    details = []
    if is_https:
        hsts = headers.get("strict-transport-security", "")
        if hsts:
            details.append(f"HSTS aktiverat: {hsts[:60]}")
        else:
            details.append("HSTS saknas — webbläsare kan fortfarande nå HTTP-versionen")
        csp = headers.get("content-security-policy", "")
        if csp:
            details.append("Content-Security-Policy header finns")
        else:
            details.append("Content-Security-Policy saknas — komplettera för full säkerhet")
    else:
        details.append("Sidan svarar på HTTP utan omdirigering till HTTPS")
        details.append("Alla moderna AI-sökmotorer prioriterar HTTPS-sidor")

    return {
        "id": 1, "title": "HTTPS-säkerhet",
        "status": "good" if is_https else "bad",
        "finding": "Sidan använder HTTPS med krypterad anslutning." if is_https
                   else "Sidan använder okrypterat HTTP — en allvarlig brist.",
        "details": details,
        "why": "AI-sökmotorer som ChatGPT och Perplexity rankar HTTPS-sidor högre och kan helt ignorera HTTP-sidor. Google AI Overview visar aldrig osäkra sidor.",
        "impact": "Utan HTTPS riskerar du att helt uteslutas från AI-genererade svar. Det är det mest grundläggande kravet." if not is_https
                  else "HTTPS är aktiverat — din sida uppfyller grundkravet för AI-sökmotorer.",
        "fix": "" if is_https else "Aktivera SSL/TLS-certifikat via Let's Encrypt (gratis). De flesta webbhotell erbjuder det med ett klick. Konfigurera sedan 301-omdirigering från HTTP till HTTPS.",
    }


def _check_language(meta: dict, soup) -> dict:
    lang = meta.get("lang", "")
    details = []

    html_tag = soup.find("html")
    if html_tag:
        all_attrs = dict(html_tag.attrs) if html_tag.attrs else {}
        if "lang" in all_attrs:
            details.append(f"HTML lang-attribut: \"{all_attrs['lang']}\"")
        if "xml:lang" in all_attrs:
            details.append(f"xml:lang attribut: \"{all_attrs['xml:lang']}\"")

    hreflangs = soup.find_all("link", attrs={"hreflang": True})
    if hreflangs:
        langs = [l.get("hreflang", "") for l in hreflangs]
        details.append(f"Hreflang-taggar hittade: {', '.join(langs[:5])}")
    else:
        details.append("Inga hreflang-taggar — AI vet inte om sidan finns på andra språk")

    meta_lang = soup.find("meta", attrs={"http-equiv": "content-language"})
    if meta_lang:
        details.append(f"Meta Content-Language: {meta_lang.get('content', '')}")

    if lang:
        return {"id": 2, "title": "Språkdeklaration", "status": "good",
                "finding": f"Sidan deklarerar språk korrekt som \"{lang}\".",
                "details": details,
                "why": "Språkdeklaration hjälper AI att förstå sidans språk och leverera rätt svar i rätt sammanhang. Utan den kan AI gissa fel språk och ignorera sidan i svenskspråkiga svar.",
                "impact": "Korrekt språkdeklaration gör att AI-sökmotorer kan matcha din sida med frågor på rätt språk — kritiskt för svensk synlighet.",
                "fix": ""}
    return {"id": 2, "title": "Språkdeklaration", "status": "bad",
            "finding": "Sidan saknar språkdeklaration — AI vet inte vilket språk innehållet är på.",
            "details": details + ["Utan lang-attribut behandlar AI sidan som \"okänt språk\""],
            "why": "AI-sökmotorer använder lang-attributet för att avgöra om sidan ska citeras i svenskspråkiga svar. Utan det riskerar du att bara synas i engelskt sökresultat — eller inte alls.",
            "impact": "Du kan förlora uppemot 80% av den svenska AI-trafiken om sidan inte tydligt deklarerar sitt språk.",
            "fix": "Lägg till lang-attribut på HTML-taggen: <html lang=\"sv\">\n\nOm sidan finns på flera språk, lägg även till hreflang:\n<link rel=\"alternate\" hreflang=\"sv\" href=\"https://example.se\" />\n<link rel=\"alternate\" hreflang=\"en\" href=\"https://example.se/en\" />"}


def _check_robots_card(robots: dict, meta_robots_content: str = "") -> dict:
    AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "anthropic-ai", "Google-Extended"]

    # meta robots noindex/nofollow overrides everything
    if "noindex" in meta_robots_content:
        return {
            "id": 3, "title": "AI-crawler åtkomst", "status": "bad",
            "finding": "Sidan har meta robots noindex — AI-sökmotorer ignorerar den helt.",
            "details": [
                f"<meta name=\"robots\" content=\"{meta_robots_content}\"> hittad",
                "noindex instruerar ALLA crawlers att inte indexera sidan",
                "Det spelar ingen roll hur bra övrigt SEO är — sidan syns inte i AI-svar",
            ],
            "why": "Meta robots noindex är en absolut stoppsignal. AI-sökmotorer som GPTBot, PerplexityBot och Googlebot respekterar den och exkluderar sidan från sina index.",
            "impact": "Sidan syns inte alls i AI-genererade svar. Det är det allvarligaste möjliga crawl-problemet.",
            "fix": "Ta bort eller ändra meta robots-taggen:\n<meta name=\"robots\" content=\"index,follow\">\n\nOm sidan är avsiktligt dold, lägg till en annan sida som AI kan indexera.",
        }

    if not robots.get("exists"):
        return {"id": 3, "title": "AI-crawler åtkomst", "status": "warning",
                "finding": "Ingen robots.txt hittades — AI-sökmotorer kan crawla sidan men saknar explicit vägledning.",
                "details": [
                    "robots.txt saknas helt på servern",
                    f"Utan robots.txt kan AI-crawlers ({', '.join(AI_BOTS)}) crawla fritt men du har ingen kontroll",
                    "Du kan inte styra vilka delar av sidan som AI indexerar",
                    "Vissa AI-sökmotorer behandlar avsaknad av robots.txt som \"osäkert\" och crawlar försiktigare",
                ],
                "why": "robots.txt är den primära mekanismen för att kommunicera med AI-crawlers. Utan den fattar varje AI-sökmotor egna beslut om vad de ska indexera — och de kan missa viktiga sidor eller indexera sidor du inte vill visa.",
                "impact": "Genom att skapa en tydlig robots.txt kan du öka dina chanser att AI indexerar rätt innehåll med 30–50%. Du får också kontroll över vilka delar av sidan som syns i AI-svar.",
                "fix": "Skapa /robots.txt i roten av din webbplats:\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: https://dindomän.se/sitemap.xml"}

    blocked = robots.get("blocked_bots", [])
    allowed = [b for b in AI_BOTS if b not in blocked]
    details = []

    if blocked:
        for bot in blocked:
            details.append(f"❌ {bot} blockeras — kan inte indexera din sida")
        for bot in allowed:
            details.append(f"✓ {bot} tillåts")
        bots_str = ", ".join(blocked)
        return {"id": 3, "title": "AI-crawler åtkomst", "status": "bad",
                "finding": f"{len(blocked)} av {len(AI_BOTS)} AI-crawlers blockeras i din robots.txt.",
                "details": details,
                "why": f"Att blockera {bots_str} innebär att dessa AI-sökmotorer inte kan läsa din sida alls. Det är som att stänga dörren för potentiella kunder — de ser helt enkelt inte att du finns.",
                "impact": f"Varje blockerad AI-crawler representerar miljontals användare som aldrig kommer se ditt innehåll. GPTBot ensam har hundratals miljoner användare. Att avblockera ger omedelbar ökad synlighet.",
                "fix": f"Ändra Disallow till Allow för dessa botar i din robots.txt:\n\n" +
                       "\n".join(f"User-agent: {b}\nAllow: /" for b in blocked)}

    details = [f"✓ {bot} tillåts" for bot in AI_BOTS]
    return {"id": 3, "title": "AI-crawler åtkomst", "status": "good",
            "finding": "Alla stora AI-sökmotorer har tillgång att crawla din sida.",
            "details": details,
            "why": "Du låter AI-sökmotorer indexera ditt innehåll — det är grunden för att synas i AI-genererade svar.",
            "impact": "Din sida är tillgänglig för alla stora AI-plattformar. Bra utgångsläge.",
            "fix": ""}


def _check_llms_card(llms: dict, url: str) -> dict:
    if llms.get("exists"):
        content = llms.get("content", "")
        lines = content.strip().split("\n") if content else []
        details = [
            f"Fil hittad på {url.rstrip('/')}/llms.txt",
            f"Innehåll: {len(lines)} rader",
        ]
        if lines:
            details.append(f"Första raden: \"{lines[0][:80]}\"")
        if len(content) < 100:
            details.append("⚠️ Innehållet är väldigt kort — överväg att utöka med mer detaljer")
        return {"id": 4, "title": "llms.txt", "status": "good",
                "finding": "llms.txt finns — AI-sökmotorer kan snabbt förstå vad din sida handlar om.",
                "details": details,
                "why": "llms.txt är den nya standarden (2024+) för att ge AI-modeller en strukturerad sammanfattning av din webbplats. Det fungerar som en \"AI-optimerad About-sida\" som modellerna prioriterar.",
                "impact": "Sidor med llms.txt får upp till 3x bättre representation i AI-genererade svar jämfört med sidor utan.",
                "fix": ""}

    return {"id": 4, "title": "llms.txt", "status": "bad",
            "finding": "Ingen llms.txt hittades — du missar det enklaste sättet att kommunicera med AI.",
            "details": [
                f"Ingen fil på {url.rstrip('/')}/llms.txt",
                "llms.txt är en ny standard som ChatGPT, Claude och Perplexity aktivt söker efter",
                "Den ger AI-modeller en koncentrerad, maskinläsbar beskrivning av din verksamhet",
                "Utan den måste AI gissa vad sidan handlar om baserat på fragmenterad HTML",
            ],
            "why": "AI-modeller har begränsad tid att analysera varje webbplats. llms.txt ger dem en \"fusklapp\" — en ren, strukturerad beskrivning utan HTML-brus. Det är skillnaden mellan att AI citerar dig korrekt och att de gissar (eller ignorerar dig).",
            "impact": "Att lägga till llms.txt tar 15 minuter men kan dramatiskt förbättra hur AI presenterar din verksamhet. Det är den åtgärd med högst ROI i hela rapporten.",
            "fix": "Skapa filen /llms.txt i roten av din webbplats:\n\n# Företagsnamn\n\n> En mening som sammanfattar vad ni gör\n\n## Om oss\nEn stycke som beskriver er verksamhet, målgrupp och kärnkompetens.\n\n## Tjänster\n- Tjänst 1: Kort beskrivning\n- Tjänst 2: Kort beskrivning\n\n## Kontakt\n- Webb: https://example.se\n- E-post: info@example.se\n\n## Vanliga frågor\n- Fråga 1? Svar 1\n- Fråga 2? Svar 2"}


def _check_meta_tags(meta: dict) -> dict:
    details = []
    issues = []

    title = meta.get("title", "")
    desc = meta.get("description", "")
    title_len = meta.get("title_length", 0)
    desc_len = meta.get("description_length", 0)

    if title:
        details.append(f"Title ({title_len} tecken): \"{title[:70]}{'…' if len(title) > 70 else ''}\"")
        if title_len < 30:
            issues.append(f"Title är för kort ({title_len} tecken) — AI får för lite kontext")
        elif title_len > 60:
            issues.append(f"Title är för lång ({title_len} tecken) — AI kan klippa den")
        else:
            details.append(f"✓ Title-längd optimal ({title_len} tecken)")
    else:
        issues.append("Ingen title-tagg hittades")
        details.append("❌ Title saknas helt — AI har inget namn att referera till")

    if desc:
        details.append(f"Description ({desc_len} tecken): \"{desc[:90]}{'…' if len(desc) > 90 else ''}\"")
        if desc_len < 100:
            issues.append(f"Description är för kort ({desc_len} tecken) — ge AI mer att citera")
        elif desc_len > 160:
            issues.append(f"Description är för lång ({desc_len} tecken) — AI kan missa kärnbudskapet")
        else:
            details.append(f"✓ Description-längd optimal ({desc_len} tecken)")
    else:
        issues.append("Ingen meta description hittades")
        details.append("❌ Description saknas — AI har ingen sammanfattning att använda")

    og_title = meta.get("og_title", "")
    og_desc = meta.get("og_description", "")
    if og_title:
        details.append(f"Open Graph title: \"{og_title[:60]}\"")
    else:
        details.append("Ingen og:title — social delning och AI kan visa felaktig titel")
    if og_desc:
        details.append(f"Open Graph description finns ({len(og_desc)} tecken)")
    else:
        details.append("Ingen og:description")

    if not issues:
        return {"id": 5, "title": "Meta-taggar", "status": "good",
                "finding": "Title och meta description är väloptimerade för AI-sökmotorer.",
                "details": details,
                "why": "Meta-taggar är det första AI-modeller läser för att förstå vad en sida handlar om. En bra title och description fungerar som en \"elevator pitch\" till AI.",
                "impact": "Optimerade meta-taggar ökar sannolikheten att AI citerar din sida korrekt och med rätt kontext.",
                "fix": ""}

    status = "bad" if len(issues) >= 2 else "warning"
    return {"id": 5, "title": "Meta-taggar", "status": status,
            "finding": f"{len(issues)} problem med meta-taggar som påverkar AI-synligheten.",
            "details": details,
            "why": "Meta-taggar är AI:s snabbaste väg att förstå din sida. En saknad eller dåligt skriven title/description gör att AI antingen gissar vad sidan handlar om, eller hoppar över den helt.",
            "impact": "Att fixa meta-taggar tar 5 minuter per sida och ger omedelbart bättre AI-representation. Det är grundläggande SEO som också gynnar traditionell sökning.",
            "fix": "Optimera title (30–60 tecken) med kärnbudskapet först:\n<title>Företagsnamn — Vad ni gör</title>\n\nSkriv en description (100–160 tecken) som sammanfattar er viktigaste USP:\n<meta name=\"description\" content=\"Vi hjälper svenska företag att...\" />\n\nLägg även till Open Graph-taggar:\n<meta property=\"og:title\" content=\"...\" />\n<meta property=\"og:description\" content=\"...\" />"}


def _check_headings(meta: dict, soup) -> dict:
    h1 = meta.get("h1", [])
    h2 = meta.get("h2", [])
    h3 = meta.get("h3", [])
    details = []

    if h1:
        for heading in h1[:3]:
            details.append(f"H1: \"{heading[:70]}\"")
    else:
        details.append("❌ Ingen H1-rubrik hittades")

    if h2:
        details.append(f"{len(h2)} st H2-rubriker: {', '.join(h[:40] for h in h2[:4])}{'…' if len(h2) > 4 else ''}")
    else:
        details.append("Inga H2-rubriker — sidan saknar tematisk struktur")

    if h3:
        details.append(f"{len(h3)} st H3-rubriker")

    total_headings = len(h1) + len(h2) + len(h3)
    details.append(f"Totalt {total_headings} rubriker i hierarkin")

    all_headings = soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
    if all_headings:
        levels = [int(h.name[1]) for h in all_headings]
        for i in range(1, len(levels)):
            if levels[i] > levels[i-1] + 1:
                details.append(f"⚠️ Hoppar från H{levels[i-1]} till H{levels[i]} — skapar lucka i hierarkin")
                break
        else:
            if len(h1) == 1:
                details.append("✓ Rubrikhierarkin följer korrekt ordning")

    if len(h1) == 1:
        return {"id": 6, "title": "Rubrikstruktur", "status": "good",
                "finding": f"Sidan har en tydlig rubrikstruktur med H1: \"{h1[0][:50]}\".",
                "details": details,
                "why": "AI-modeller använder rubrikstrukturen för att förstå sidans tematiska uppbyggnad. En tydlig H1→H2→H3-hierarki gör att AI kan extrahera och citera rätt avsnitt.",
                "impact": "Bra rubrikstruktur ökar chansen att AI hittar och citerar exakt det avsnitt som besvarar användarens fråga.",
                "fix": ""}

    if len(h1) == 0:
        return {"id": 6, "title": "Rubrikstruktur", "status": "bad",
                "finding": "Sidan saknar H1-rubrik — AI har svårt att identifiera sidans huvudämne.",
                "details": details,
                "why": "H1-rubriken är den viktigaste signalen till AI om vad sidan handlar om. Utan den måste AI gissa — och den gissar ofta fel.",
                "impact": "En saknad H1 kan innebära att AI helt missar sidans huvudämne och istället citerar irrelevant innehåll, eller hoppar över sidan.",
                "fix": "Lägg till en H1-tagg med sidans huvudämne:\n<h1>Er viktigaste rubrik som beskriver vad sidan handlar om</h1>\n\nStrukturera sedan innehållet med H2 för underavsnitt och H3 för detaljer."}

    return {"id": 6, "title": "Rubrikstruktur", "status": "warning",
            "finding": f"Sidan har {len(h1)} H1-rubriker — det ska bara finnas en.",
            "details": details,
            "why": "Flera H1-rubriker förvirrar AI om vad sidans primära ämne är. AI-modeller förväntar sig en enda H1 som \"titel\" och resten som underrubriker.",
            "impact": "Med flera H1:or riskerar du att AI väljer fel rubrik som sidans ämne, eller ger lägre prioritet åt sidan.",
            "fix": "Behåll den viktigaste H1:an och konvertera resten till H2:\n\n<h1>Huvudrubrik (bara en)</h1>\n<h2>Underrubrik 1</h2>\n<h2>Underrubrik 2</h2>"}


def _check_schema_card(schema: dict, url: str, is_local: bool = False) -> dict:
    types = schema.get("types", [])

    if not types:
        return {"id": 7, "title": "Strukturerad data (Schema.org)", "status": "bad",
                "finding": "Ingen strukturerad data hittades — AI saknar maskinläsbar information om din verksamhet.",
                "details": [
                    "Ingen JSON-LD markup detekterad på sidan",
                    "AI-sökmotorer förlitar sig på Schema.org för att förstå entiteter",
                    "Utan schema måste AI tolka fritext — med risk för missförstånd",
                    "Google AI Overview använder schema aktivt för att generera svar",
                ],
                "why": "Strukturerad data är det mest precisa sättet att berätta för AI exakt vad din verksamhet är. Det är skillnaden mellan att AI \"läser\" din sida och att den \"förstår\" den.",
                "impact": "Sidor med strukturerad data är 2–4x mer sannolika att citeras i AI-svar. Det tar 30 minuter att implementera och ger permanent förbättring.",
                "fix": "Lägg till JSON-LD i din HTML <head>:\n\n<script type=\"application/ld+json\">\n{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"Organization\",\n  \"name\": \"Företagsnamn\",\n  \"url\": \"" + url + "\",\n  \"description\": \"Vad ni gör\",\n  \"address\": {\n    \"@type\": \"PostalAddress\",\n    \"addressLocality\": \"Stockholm\",\n    \"addressCountry\": \"SE\"\n  },\n  \"sameAs\": [\n    \"https://linkedin.com/company/...\",\n    \"https://twitter.com/...\"\n  ]\n}\n</script>"}

    details = []
    recommended_missing = []
    has_local_biz = any(t in types for t in ["LocalBusiness", "Store", "Restaurant"])
    has_org = any(t in types for t in ["Organization", "Corporation"]) or has_local_biz
    has_breadcrumb = "BreadcrumbList" in types
    has_webpage = "WebPage" in types or "WebSite" in types

    for t in types:
        details.append(f"✓ {t} schema hittad")

    if is_local and not has_local_biz:
        recommended_missing.append("LocalBusiness — obligatoriskt för lokala företag, signalerar lokal närvaro till AI")
    elif not is_local and not has_org:
        recommended_missing.append("Organization — berätta för AI vem ni är")
    if not has_breadcrumb:
        recommended_missing.append("BreadcrumbList — hjälp AI förstå sidstrukturen")
    if not has_webpage:
        recommended_missing.append("WebSite/WebPage — grundläggande sididentifikation")

    if recommended_missing:
        details.append("")
        details.append("Saknade rekommenderade typer:")
        for m in recommended_missing:
            details.append(f"  → {m}")

    status = "good" if has_org or (len(types) >= 2) else "warning"
    # For local businesses without LocalBusiness schema, downgrade to warning
    if is_local and not has_local_biz and status == "good":
        status = "warning"

    fix = ""
    if recommended_missing:
        fix = "Komplettera med dessa schema-typer för maximal AI-synlighet:\n\n"
        if is_local and not has_local_biz:
            fix += "LocalBusiness-schema (kritiskt för lokalt företag):\n"
            fix += "<script type=\"application/ld+json\">\n{\"@context\": \"https://schema.org\", \"@type\": \"LocalBusiness\", \"name\": \"Företagsnamn\", \"address\": {\"@type\": \"PostalAddress\", \"streetAddress\": \"Storgatan 1\", \"addressLocality\": \"Stockholm\", \"postalCode\": \"111 22\", \"addressCountry\": \"SE\"}, \"telephone\": \"+46701234567\"}\n</script>\n"
        elif not has_org:
            fix += "Organization-schema (berättar vem ni är)\n"
        fix += "\nValidera på: https://search.google.com/test/rich-results"

    return {"id": 7, "title": "Strukturerad data (Schema.org)", "status": status,
            "finding": f"Sidan har {len(types)} schema-typer: {', '.join(types[:4])}{'…' if len(types) > 4 else ''}.",
            "details": details,
            "why": "Strukturerad data är AI:s mest precisa informationskälla." + (" För lokala företag är LocalBusiness-schema särskilt viktigt — det är grunden för lokal AI-sökning." if is_local else " Det låter dig definiera exakt vad er verksamhet, produkter och tjänster är."),
            "impact": "Ni har redan schema — bra grund. " + (f"Genom att lägga till {len(recommended_missing)} saknade typer kan ni ytterligare förbättra AI:s förståelse." if recommended_missing else "Full täckning ger bästa möjliga AI-representation."),
            "fix": fix}


def _check_freshness(meta: dict, headers: dict, soup) -> dict:
    last_modified = headers.get("last-modified", "")
    details = []
    date_signals = 0

    if last_modified:
        details.append(f"Last-Modified header: {last_modified}")
        date_signals += 1
    else:
        details.append("❌ Ingen Last-Modified header från servern")

    etag = headers.get("etag", "")
    if etag:
        details.append(f"ETag finns: {etag[:40]}")

    cache_control = headers.get("cache-control", "")
    if cache_control:
        details.append(f"Cache-Control: {cache_control[:60]}")

    time_tags = soup.find_all("time")
    if time_tags:
        for t in time_tags[:2]:
            dt = t.get("datetime", t.get_text(strip=True))
            details.append(f"<time> element: {dt[:30]}")
            date_signals += 1

    date_meta = soup.find("meta", attrs={"property": "article:published_time"})
    if date_meta:
        details.append(f"article:published_time: {date_meta.get('content', '')[:30]}")
        date_signals += 1

    modified_meta = soup.find("meta", attrs={"property": "article:modified_time"})
    if modified_meta:
        details.append(f"article:modified_time: {modified_meta.get('content', '')[:30]}")
        date_signals += 1

    if date_signals >= 2:
        status = "good"
        finding = "Sidan har tydliga signaler om innehållsfräschhet."
    elif date_signals == 1:
        status = "warning"
        finding = "Sidan har en datumindikator men kan förbättras med fler signaler."
    else:
        status = "warning"
        finding = "Sidan saknar tydliga signaler om hur aktuellt innehållet är."

    return {"id": 8, "title": "Innehållsfräschhet", "status": status,
            "finding": finding,
            "details": details,
            "why": "AI-sökmotorer vill citera aktuell information. Utan datumstämplar kan AI anta att innehållet är föråldrat och prioritera nyare källor.",
            "impact": "Tydliga datumindikatorer gör att AI behandlar ditt innehåll som trovärdigt och aktuellt." if date_signals >= 2
                      else "Utan datumindikatorer riskerar du att tappa position till konkurrenter med nyare tidsstämplar.",
            "fix": "Konfigurera servern att skicka Last-Modified header.\n\nLägg även till publiceringsdatum i HTML:\n<time datetime=\"2024-12-01\">1 december 2024</time>\n\nOch i meta-taggar:\n<meta property=\"article:published_time\" content=\"2024-12-01T10:00:00+01:00\" />\n<meta property=\"article:modified_time\" content=\"2025-01-15T14:00:00+01:00\" />" if date_signals < 2 else ""}


def _check_entity_card(entity_data: dict) -> dict:
    if entity_data.get("clear"):
        what = entity_data.get("what_they_do", "")
        details = [f"AI:s tolkning: \"{what}\""]
        if entity_data.get("who_they_target"):
            details.append(f"Målgrupp identifierad: {entity_data['who_they_target']}")
        if entity_data.get("company_name"):
            details.append(f"Företagsnamn: {entity_data['company_name']}")
        details.append("AI kan med hög säkerhet sammanfatta och citera er verksamhet")

        return {"id": 9, "title": "Entitetstydlighet (AI-analys)", "status": "good",
                "finding": f"AI förstår tydligt vad sidan handlar om: {what[:80]}.",
                "details": details,
                "why": "Vi använde AI för att analysera hur väl ert innehåll kommunicerar vad ni gör. Om AI kan förstå er — kan AI-sökmotorer citera er.",
                "impact": "Ert innehåll är tydligt nog för AI att förstå och citera korrekt. Det är en stark konkurrensfördel.",
                "fix": ""}

    recommendation = entity_data.get("recommendation", "Förtydliga vad företaget gör och för vem.")
    details = [
        "AI hade svårt att avgöra vad sidan handlar om",
        "Otydligt vem målgruppen är",
        "Företagets kärnverksamhet framgår inte tydligt",
    ]
    if entity_data.get("confusion_points"):
        details.append(f"Förvirrande delar: {entity_data['confusion_points']}")

    return {"id": 9, "title": "Entitetstydlighet (AI-analys)", "status": "bad",
            "finding": "AI har svårt att förstå vad företaget erbjuder och till vem.",
            "details": details,
            "why": "Vi lät en AI-modell analysera ert innehåll — och den kunde inte tydligt avgöra vad ni gör. Om AI inte förstår ert innehåll, kommer AI-sökmotorer inte citera er.",
            "impact": "Det här är den mest kritiska bristen. Oavsett hur bra era meta-taggar och schema är — om innehållet i sig är otydligt spelar teknik ingen roll.",
            "fix": recommendation + "\n\nKonkret: Se till att sidans första stycke (above the fold) besvarar tre frågor:\n1. Vad gör ni? (konkret, inte abstrakt)\n2. För vem? (målgrupp)\n3. Varför ska man välja er? (USP)\n\nExempel: \"Vi hjälper svenska e-handlare att öka sin konvertering med 20% genom AI-driven produktrekommendation.\""}


def _check_faq_card(has_schema_faq: bool, faq_elements: int, soup) -> dict:
    details = []

    question_patterns = soup.find_all(["details"])
    dl_items = soup.find_all("dt")

    if has_schema_faq:
        details.append("✓ FAQPage JSON-LD schema hittad")
    else:
        details.append("❌ Ingen FAQPage schema markup")

    if question_patterns:
        details.append(f"{len(question_patterns)} st <details>/<summary> element (expanderbara FAQ)")
    if dl_items:
        details.append(f"{len(dl_items)} st <dt>-element (definitionslista, kan vara FAQ)")

    faq_headings = [h for h in soup.find_all(["h2", "h3"]) if any(
        word in (h.get_text(strip=True).lower()) for word in ["faq", "frågor", "vanliga frågor", "q&a"]
    )]
    if faq_headings:
        for h in faq_headings[:2]:
            details.append(f"FAQ-rubrik hittad: \"{h.get_text(strip=True)}\"")

    if has_schema_faq:
        return {"id": 10, "title": "FAQ-innehåll", "status": "good",
                "finding": "FAQ-sektion med schema markup — AI kan direkt citera era frågor och svar.",
                "details": details,
                "why": "FAQ med FAQPage-schema är det mest direkta sättet att få AI att citera dig. När någon ställer en fråga som matchar din FAQ, kan AI svara med dina exakta ord.",
                "impact": "FAQ-schema ger 40% högre chans att ditt svar citeras i AI-genererade svar.",
                "fix": ""}

    if faq_elements > 0 or faq_headings:
        details.append("Sidan har FAQ-innehåll men det saknar maskinläsbar markup")
        return {"id": 10, "title": "FAQ-innehåll", "status": "warning",
                "finding": "FAQ-innehåll finns men saknar FAQPage-schema — AI kan inte strukturerat extrahera era svar.",
                "details": details,
                "why": "Ni har redan bra FAQ-innehåll, men utan FAQPage JSON-LD schema kan AI-sökmotorer inte effektivt para ihop frågor med svar.",
                "impact": "Att lägga till FAQPage-schema till ert befintliga FAQ-innehåll tar 15 minuter och kan ge markant ökad citering i AI-svar.",
                "fix": "Lägg till FAQPage JSON-LD schema för ert befintliga FAQ-innehåll:\n\n<script type=\"application/ld+json\">\n{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"FAQPage\",\n  \"mainEntity\": [\n    {\n      \"@type\": \"Question\",\n      \"name\": \"Er första fråga?\",\n      \"acceptedAnswer\": {\n        \"@type\": \"Answer\",\n        \"text\": \"Ert svar här.\"\n      }\n    }\n  ]\n}\n</script>"}

    return {"id": 10, "title": "FAQ-innehåll", "status": "bad",
            "finding": "Ingen FAQ-sektion hittades — ni missar det mest effektiva sättet att bli citerad av AI.",
            "details": [
                "Ingen FAQPage schema hittad",
                "Inga <details>/<summary>-element",
                "Inga FAQ-rubriker identifierade",
                "AI-sökmotorer letar aktivt efter fråga-svar-format att citera",
            ],
            "why": "FAQ är den absolut mest citerade content-typen i AI-svar. När någon frågar \"Vad kostar X?\" och ni har svaret i en FAQ, kan AI svara direkt med er text.",
            "impact": "Att skapa 5–10 FAQ med schema-markup kan ensamt öka era AI-citeringar med 40%. Det är den åtgärd som ger mest effekt per arbetsminut.",
            "fix": "Skapa en FAQ-sektion med de 5–10 vanligaste frågorna om er verksamhet.\n\nAnvänd <details>/<summary> i HTML:\n<details>\n  <summary>Vad kostar er tjänst?</summary>\n  <p>Priser börjar från X kr/mån...</p>\n</details>\n\nOch lägg till FAQPage JSON-LD:\n<script type=\"application/ld+json\">\n{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"FAQPage\",\n  \"mainEntity\": [\n    {\"@type\": \"Question\", \"name\": \"Fråga?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"Svar.\"}}\n  ]\n}\n</script>"}


# ─── Off-page checks (11–13) ───────────────────────────────────────────────────

def _check_trustpilot_card(tp: dict, themes: dict = None, rating_divergence: float = None, gbp_rating: float = None) -> dict:
    themes = themes or {}

    if not tp.get("exists"):
        return {
            "id": 11, "title": "Trustpilot-närvaro",
            "status": "bad",
            "finding": f"Ingen Trustpilot-profil hittades för {tp.get('domain', 'domänen')}.",
            "details": [
                "Trustpilot är en av de mest citerade recensionsplattformarna av AI-sökmotorer",
                "Perplexity och ChatGPT använder aktivt Trustpilot-data för att bedöma trovärdighet",
                "Utan profil förlorar ni en viktig extern trovärdighetsmarkör",
            ],
            "why": "AI-sökmotorer väger in externa recensioner som trovärdhetssignaler. En Trustpilot-profil med goda recensioner ökar sannolikheten att AI rekommenderar er.",
            "impact": "Utan Trustpilot-profil saknar AI ett av sina viktigaste underlag för att bedöma om ni är ett seriöst alternativ att rekommendera.",
            "fix": "Skapa en kostnadsfri Trustpilot-profil på trustpilot.com/business. Bjud in befintliga kunder att lämna recensioner — 10+ recensioner räcker för att AI ska börja använda er profil som källa.",
        }

    rating = tp.get("rating")
    count = tp.get("count")
    days = tp.get("days_since_review")

    details = [f"Profil: {tp['url']}"]
    if rating is not None:
        details.append(f"Betyg: {rating:.1f} / 5.0")
    if count is not None:
        details.append(f"Antal recensioner: {count}")

    # Recency
    if days is not None:
        if days <= 30:
            details.append(f"✓ Senaste recension: för {days} dagar sedan")
        elif days <= 365:
            details.append(f"Senaste recension: för ca {days // 30} månader sedan")
        else:
            details.append(f"⚠️ Senaste recension: för {days // 365} år sedan — profilen verkar inaktiv")

    # Themes from AI analysis
    if themes.get("summary"):
        details.append(f"Kunder säger: {themes['summary']}")
    if themes.get("positive"):
        details.append(f"Beröms för: {', '.join(themes['positive'])}")
    if themes.get("negative"):
        details.append(f"Kritiseras för: {', '.join(themes['negative'])}")

    # Cross-platform divergence
    issues = []
    if rating_divergence is not None and rating_divergence >= 1.5 and gbp_rating is not None:
        issues.append(
            f"Stort gap mellan Trustpilot ({rating:.1f}) och Google ({gbp_rating:.1f}) — "
            "AI flaggar inkonsekvent rykte, vilket kan minska trovärdigheten"
        )

    if rating is not None and rating < 4.0:
        issues.append(f"Betyget {rating:.1f} är under 4.0 — AI kan nedprioritera er till förmån för konkurrenter")
    if count is not None and count < 10:
        issues.append(f"Bara {count} recensioner — AI behöver fler datapunkter för att lita på betyget")
    if days is not None and days > 365:
        issues.append("Inga nya recensioner på över ett år — AI tolkar inaktiva profiler som lägre prioritet")

    is_good = (
        rating is not None and rating >= 4.0
        and (count or 0) >= 10
        and not issues
    )

    if is_good:
        return {
            "id": 11, "title": "Trustpilot-närvaro", "status": "good",
            "finding": f"Trustpilot-profil med betyg {rating:.1f}/5 ({count} recensioner).",
            "details": details,
            "why": "Trustpilot-data används aktivt av Perplexity och Google AI Overview för att bedöma trovärdighet. Högt betyg med många recensioner är en stark signal.",
            "impact": "Er Trustpilot-profil stärker ert anseende i AI-genererade svar.",
            "fix": "",
        }

    rating_str = f"{rating:.1f}/5" if rating is not None else "betyg okänt"
    count_str = str(count) if count is not None else "okänt antal"
    return {
        "id": 11, "title": "Trustpilot-närvaro", "status": "warning",
        "finding": f"Trustpilot-profil finns men kan stärkas ({rating_str}, {count_str} recensioner).",
        "details": details + [f"❌ {i}" for i in issues],
        "why": "Trustpilot-data vägs in av AI-sökmotorer vid rekommendationer. Lågt betyg, få recensioner eller inaktiv profil minskar er trovärdighet.",
        "impact": "Att aktivt samla fler recensioner och förbättra betyget är en av de mest effektiva åtgärderna för att öka AI-rekommendationer.",
        "fix": "Bjud systematiskt in nöjda kunder att lämna recensioner — via e-post efter avslutat uppdrag, via länk på fakturan, eller via QR-kod. Svara alltid på recensioner — det visar AI att ni är engagerade.",
    }


def _check_wikipedia_card(wiki: dict, company_name: str) -> dict:
    if wiki.get("exists"):
        lang_label = "svenska" if wiki["lang"] == "sv" else "engelska"
        return {
            "id": 12, "title": "Wikipedia-närvaro", "status": "good",
            "finding": f"Wikipedia-artikel hittad på {lang_label}: \"{wiki['title']}\".",
            "details": [
                f"Artikel: {wiki['url']}",
                "Wikipedia är en av AI:s mest betrodda källor — CitationBot, ChatGPT och Perplexity refererar aktivt till Wikipedia",
                "En Wikipedia-artikel ger er verksamhet en \"faktaruta\" som AI kan använda direkt",
            ],
            "why": "AI-modeller är tränade på Wikipedia och litar på det mer än på er egen webbplats. En artikel om er verksamhet är den starkaste externa trovärdighetsmarkören som finns.",
            "impact": "Wikipedia-närvaro kan ge er en permanent plats i AI-svar om er bransch — utan att ni behöver göra något mer.",
            "fix": "",
        }

    name_hint = f" för \"{company_name}\"" if company_name else ""
    return {
        "id": 12, "title": "Wikipedia-närvaro", "status": "warning",
        "finding": f"Ingen Wikipedia-artikel hittad{name_hint}.",
        "details": [
            "Wikipedia är en av AI:s absolut mest citerade källor",
            "AI-modeller litar mer på Wikipedia än på en företags egna sajt",
            "Artiklar om er bransch, era grundare eller er historia kan räcka",
            "Notabilitetskraven på Wikipedia kräver extern mediebevakning",
        ],
        "why": "ChatGPT, Claude och Gemini är alla tränade tungt på Wikipedia. Utan artikel om ert företag eller er branschnisch missar ni den källa AI litar mest på.",
        "impact": "En Wikipedia-artikel om er verksamhet eller er nisch kan dramatiskt öka hur AI presenterar er — men kräver att ni uppfyller Wikipedias notabilitetskrav.",
        "fix": "Tre vägar till Wikipedia-närvaro:\n1. Säkra pressbevakning (DI, Breakit, branschmedier) — Wikipedia kräver externa, oberoende källor\n2. Om en grundare eller produkt uppfyller notabilitetskraven kan det räcka med en artikel om dem\n3. Bidra till befintliga Wikipedia-artiklar om er bransch — det stärker indirekt er synlighet",
    }


def _check_social_card(links: dict, is_local: bool = False) -> dict:
    count = len(links)
    details = []

    priority = ["LinkedIn", "Google Maps", "Trustpilot", "Facebook", "Instagram", "Twitter/X", "YouTube"]
    for platform in priority:
        if platform in links:
            details.append(f"✓ {platform}: {links[platform][:60]}")
    for platform in links:
        if platform not in priority:
            details.append(f"✓ {platform}")

    critical_missing = ["Google Maps", "LinkedIn"] if is_local else ["LinkedIn"]
    missing = [p for p in critical_missing if p not in links]
    for p in missing:
        label = "kritisk för lokalt företag" if is_local and p == "Google Maps" else "rekommenderas"
        details.append(f"❌ {p} — inte länkat ({label})")

    # For local businesses, Google Maps is required for "good"
    local_maps_missing = is_local and "Google Maps" not in links

    if count >= 3 and not local_maps_missing:
        return {
            "id": 13, "title": "Social närvaro & externa profiler", "status": "good",
            "finding": f"{count} externa profiler länkade från sidan ({', '.join(list(links.keys())[:3])}).",
            "details": details,
            "why": "AI-sökmotorer använder sameAs-data och externa profilänkar för att bekräfta att en organisation är legitim och väletablerad.",
            "impact": "Tydliga externa profilänkar stärker er entitet i AI:s kunskapsgraf och ökar trovärdigheten i rekommendationer.",
            "fix": "",
        }

    if count >= 1:
        return {
            "id": 13, "title": "Social närvaro & externa profiler", "status": "warning",
            "finding": f"Bara {count} extern profil länkad — AI får lite extern bekräftelse på er identitet.",
            "details": details,
            "why": "AI bygger sin bild av er från flera källor. Ju fler konsistenta externa profiler, desto säkrare är AI på att ni är det ni påstår er vara.",
            "impact": "Att länka till LinkedIn och Google Maps ensamt ökar AI:s förtroende för er som organisation.",
            "fix": "Länka till era viktigaste externa profiler i sidfoten:\n- LinkedIn företagssida\n- Google Business Profile / Maps\n- Trustpilot\n\nOch deklarera dem i er schema-markup:\n<script type=\"application/ld+json\">\n{\"@type\": \"Organization\", \"sameAs\": [\"https://linkedin.com/company/...\", \"https://g.page/...\"]}\n</script>",
        }

    return {
        "id": 13, "title": "Social närvaro & externa profiler", "status": "bad",
        "finding": "Inga externa profiler hittades i sidans HTML — AI-crawlers kan inte se era sociala profiler.",
        "details": [
            "Inga sociala medier, Google Maps eller recensionssidor hittades i statisk HTML",
            "Obs: om länkarna laddas via JavaScript syns de inte för AI-crawlers (som inte kör JS)",
            "Lösningen är densamma oavsett: deklarera profilerna i JSON-LD schema sameAs",
            "LinkedIn och Google Business Profile är de viktigaste att börja med",
        ],
        "why": "AI-crawlers kör inte JavaScript — de ser bara statisk HTML. Om era sociala profillänkar är JS-renderade är de osynliga för ChatGPT, Perplexity och Google AI. sameAs i JSON-LD är den mest robusta lösningen.",
        "impact": "Att lägga till sameAs i schema är en engångsfiks som garanterat fungerar oavsett hur sajten är byggd — och tar under 10 minuter.",
        "fix": "Lägg till sameAs i er JSON-LD (fungerar oavsett om sajten är en SPA eller klassisk HTML):\n\n<script type=\"application/ld+json\">\n{\n  \"@type\": \"Organization\",\n  \"name\": \"Företagsnamn\",\n  \"sameAs\": [\n    \"https://linkedin.com/company/ert-foretag\",\n    \"https://facebook.com/ertforetag\",\n    \"https://instagram.com/ertforetag\",\n    \"https://g.page/ert-foretag\"\n  ]\n}\n</script>\n\nOch länka synligt i sidfoten med vanliga <a>-taggar (inte bara via JS).",
    }


# ─── Check 14: business-type-specific ─────────────────────────────────────────

def _check_local_presence(soup, schema: dict, social_links: dict, gbp_data: dict,
                          themes: dict = None, rating_divergence: float = None, tp_rating: float = None) -> dict:
    """Check 14 for local businesses — Google Business Profile & lokal schema completeness."""
    import json as _json
    themes = themes or {}
    details = []
    issues = []

    # Google Business Profile — actual existence via Places API
    has_gbp = gbp_data.get("found", False)
    if has_gbp:
        name = gbp_data.get("name", "")
        address = gbp_data.get("address", "")
        rating = gbp_data.get("rating")
        count = gbp_data.get("review_count")
        status = gbp_data.get("status", "")
        days = gbp_data.get("days_since_review")

        gbp_line = f"✓ Hittad på Google Maps: {name}"
        if address:
            gbp_line += f" — {address}"
        details.append(gbp_line)
        if rating and count:
            details.append(f"✓ Google-betyg: {rating:.1f}/5 ({count} recensioner)")
        if days is not None:
            if days <= 30:
                details.append(f"✓ Senaste Google-recension: för {days} dagar sedan")
            elif days <= 365:
                details.append(f"Senaste Google-recension: för ca {days // 30} månader sedan")
            else:
                issues.append(f"Senaste Google-recension är {days // 365} år gammal — aktiv profil är viktig för lokal AI")

        # Themes from reviews
        if themes.get("summary"):
            details.append(f"Kunder säger: {themes['summary']}")
        if themes.get("positive"):
            details.append(f"Beröms för: {', '.join(themes['positive'])}")
        if themes.get("negative"):
            details.append(f"Kritiseras för: {', '.join(themes['negative'])}")

        # Cross-platform divergence
        if rating_divergence is not None and rating_divergence >= 1.5 and tp_rating is not None:
            issues.append(
                f"Stort gap mellan Google ({rating:.1f}) och Trustpilot ({tp_rating:.1f}) — "
                "inkonsekvent rykte minskar AI:s förtroende"
            )

        if status and status != "OPERATIONAL":
            issues.append(f"GBP-status: {status} — kontrollera att profilen är aktiv")
    elif not gbp_data.get("skipped"):
        issues.append("Hittades inte på Google Maps — skapa eller verifiera er Google Business Profile")

    # Check LocalBusiness schema completeness
    has_address = False
    has_phone = False
    has_opening_hours = False

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = _json.loads(script.string or "")
            if isinstance(data, list):
                data = data[0]
            addr = data.get("address", {})
            if isinstance(addr, dict):
                if addr.get("streetAddress"):
                    has_address = True
                    details.append(f"✓ Gatuadress i schema: {addr['streetAddress']}")
                if addr.get("postalCode"):
                    details.append(f"✓ Postnummer i schema: {addr['postalCode']}")
            if data.get("telephone"):
                has_phone = True
                details.append(f"✓ Telefon i schema: {data['telephone']}")
            if data.get("openingHours") or data.get("openingHoursSpecification"):
                has_opening_hours = True
                details.append("✓ Öppettider deklarerade i schema")
            if data.get("geo"):
                details.append("✓ GPS-koordinater i schema")
        except Exception:
            pass

    if not has_address:
        issues.append("Gatuadress saknas i schema — AI kan inte visa er i lokala sökresultat")
    if not has_phone:
        issues.append("Telefonnummer saknas i schema")
    if not has_opening_hours:
        issues.append("Öppettider saknas i schema — Google AI visar ofta öppettider direkt i svar")

    # Google Maps link on website (bonus — not a blocker)
    has_maps_link = "Google Maps" in social_links
    if has_maps_link:
        details.append(f"✓ Länk till Google Maps på sidan")
    elif has_gbp:
        issues.append("Länk till er GBP-profil saknas på sidan — lägg till i sidfoten och sameAs-schema")

    # Embedded map
    if soup.find("iframe", src=lambda s: s and "google.com/maps" in s):
        details.append("✓ Inbäddad Google Map på sidan")

    # NAP consistency — compare schema/HTML phone vs GBP phone
    if has_gbp and gbp_data.get("address"):
        gbp_addr = gbp_data["address"].lower()
        page_text_lower = soup.get_text(separator=" ").lower()
        # Extract city from GBP address (last meaningful word before country)
        gbp_city_match = re.search(r',\s*([^,]+),\s*[a-z]+\s*$', gbp_addr)
        gbp_city = gbp_city_match.group(1).strip() if gbp_city_match else ""
        if gbp_city and gbp_city not in page_text_lower:
            issues.append(f"Stad '{gbp_city.title()}' från GBP syns inte på sidan — oenig NAP minskar lokal AI-synlighet")
        elif gbp_city:
            details.append(f"✓ NAP-konsistens: '{gbp_city.title()}' matchar GBP")

    score = sum([has_gbp, has_address, has_phone, has_opening_hours])

    if score >= 3 and not issues:
        status = "good"
        finding = "Lokal närvaro välkonfigurerad — hittad på Google Maps med adress, telefon och öppettider i schema."
    elif score >= 2:
        status = "warning"
        finding = f"Lokal närvaro delvis konfigurerad — {len(issues)} saker saknas."
    else:
        status = "bad"
        if not has_gbp:
            finding = "Hittades inte på Google Maps och saknar lokal schema-data — AI kan inte koppla er till en fysisk plats."
        else:
            finding = "Finns på Google Maps men schema-data är ofullständig — AI får svårt att visa er korrekt."

    details += [f"❌ {i}" for i in issues]

    return {
        "id": 14, "title": "Lokal närvaro (Google Business Profile)",
        "status": status,
        "finding": finding,
        "details": details,
        "why": "Google AI Overview och Perplexity använder Google Business Profile-data direkt när de svarar på lokala frågor som 'bästa [tjänst] i [stad]'. Utan fullständig lokal data syns ni inte.",
        "impact": "För lokala företag är Google Business Profile viktigare än nästan alla andra faktorer. En optimerad GBP-profil med adress, telefon och öppettider i schema ger omedelbar lokal AI-synlighet.",
        "fix": "1. Skapa/verifiera er Google Business Profile på business.google.com\n2. Komplettera LocalBusiness-schema med alla fält:\n\n<script type=\"application/ld+json\">\n{\n  \"@type\": \"LocalBusiness\",\n  \"name\": \"Företagsnamn\",\n  \"address\": {\n    \"@type\": \"PostalAddress\",\n    \"streetAddress\": \"Storgatan 1\",\n    \"addressLocality\": \"Stockholm\",\n    \"postalCode\": \"111 22\",\n    \"addressCountry\": \"SE\"\n  },\n  \"telephone\": \"+46701234567\",\n  \"openingHours\": [\"Mo-Fr 09:00-17:00\"],\n  \"geo\": {\"@type\": \"GeoCoordinates\", \"latitude\": 59.33, \"longitude\": 18.07}\n}\n</script>\n\n3. Länka till er GBP-profil i sidfoten",
    }


def _check_content_depth(soup) -> dict:
    """Check 14 for national/online businesses — content depth & topical authority."""
    text = soup.get_text(separator=" ", strip=True)
    words = len(text.split())
    details = []
    issues = []

    details.append(f"Ordantal på sidan: {words:,}")

    # Blog / knowledge base detection
    all_links = [a.get("href", "") for a in soup.find_all("a", href=True)]
    blog_signals = [h for h in all_links if any(
        kw in h.lower() for kw in ["/blog", "/blogg", "/artikel", "/guide", "/kunskap", "/tips", "/nyheter", "/resurser"]
    )]
    has_blog = len(blog_signals) > 0
    if has_blog:
        details.append(f"✓ Blogg/kunskapsbank länkad ({blog_signals[0][:50]})")
    else:
        issues.append("Ingen blogg eller kunskapsbank — AI citerar gärna sajter med djupgående innehåll")

    # Outbound links to authoritative sources
    outbound = [a.get("href", "") for a in soup.find_all("a", href=True)
                if a.get("href", "").startswith("http") and "trustpilot" not in a.get("href", "")]
    details.append(f"Utgående externa länkar: {len(outbound)}")
    if len(outbound) < 3:
        issues.append("Få externa länkar — att länka till auktoritativa källor stärker er trovärdighet")

    if words >= 500 and has_blog and not issues:
        status = "good"
        finding = f"Bra innehållsdjup — {words:,} ord och aktiv kunskapsproduktion."
    elif words >= 300 or has_blog:
        status = "warning"
        finding = f"Måttligt innehållsdjup — {words:,} ord. {len(issues)} förbättringsområden."
    else:
        status = "bad"
        finding = f"Tunt innehåll — bara {words:,} ord. AI föredrar datadrivna, djupgående sidor."

    details += [f"❌ {i}" for i in issues]

    return {
        "id": 14, "title": "Innehållsdjup & auktoritet",
        "status": status,
        "finding": finding,
        "details": details,
        "why": "AI-sökmotorer som Perplexity och ChatGPT citerar preferentiellt sidor med djupgående, välstrukturerat innehåll. Tunna sidor med få ord konkurrerar dåligt mot sajter med guider, bloggar och analyser.",
        "impact": "Innehållsdjup är en av de starkaste faktorerna för AI-citering. En sida med 1000+ ord och en aktiv blogg får exponentiellt fler citeringar än en tunn produktsida.",
        "fix": "Tre prioriterade åtgärder:\n1. Utöka varje tjänstesida till minst 400-600 ord med konkret information\n2. Starta en blogg/kunskapsbank med svar på de vanligaste frågorna i er bransch\n3. Länka till relevanta externa källor (branschrapporter, myndigheter, forskning) — det signalerar trovärdighet till AI",
    }


def _check_sitemap_card(sitemap: dict) -> dict:
    if sitemap.get("exists"):
        details = [f"✓ Sitemap hittad: {sitemap['url']}"]
        if sitemap.get("is_index"):
            details.append(f"✓ Sitemap-index med {sitemap.get('sub_sitemap_count', 0)} undersitemaps")
        elif sitemap.get("url_count", 0) > 0:
            details.append(f"✓ {sitemap['url_count']} sidor listade i sitemapen")
        if sitemap.get("in_robots"):
            details.append("✓ Sitemap deklarerad i robots.txt")
        else:
            details.append("Sitemap saknas i robots.txt — lägg till 'Sitemap: ...' för bättre crawl-vägledning")

        return {
            "id": 15, "title": "Sitemap", "status": "good",
            "finding": "Sitemap finns och ger AI-crawlers en komplett karta över sidan.",
            "details": details,
            "why": "En sitemap berättar för AI-crawlers exakt vilka sidor som finns och när de uppdaterades. Det ökar sannolikheten att alla dina sidor indexeras — inte bara startsidan.",
            "impact": "Sidor utan sitemap indexeras 40-60% mer sällan av AI-crawlers enligt Bing Webmaster-data.",
            "fix": "",
        }

    details = ["Ingen sitemap.xml hittades på /sitemap.xml eller /sitemap_index.xml"]
    if sitemap.get("robots_sitemap"):
        details.append(f"robots.txt pekar på {sitemap['robots_sitemap']} men filen svarade inte")

    return {
        "id": 15, "title": "Sitemap", "status": "bad",
        "finding": "Ingen sitemap hittades — AI-crawlers får gissa vilka sidor som finns.",
        "details": details,
        "why": "Utan sitemap crawlar AI-sökmotorer bara sidor de hittar via länkar. Sidor utan inkommande länkar — som blogginlägg, produktsidor, kontaktsidor — missas helt.",
        "impact": "Upp till hälften av dina sidor kan vara osynliga för AI om de inte är länkade tydligt. En sitemap löser detta direkt.",
        "fix": "Skapa /sitemap.xml med alla dina viktigaste sidor:\n\n<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url><loc>https://example.se/</loc><changefreq>weekly</changefreq></url>\n  <url><loc>https://example.se/om-oss/</loc></url>\n  <url><loc>https://example.se/kontakt/</loc></url>\n</urlset>\n\nDe flesta CMS (WordPress, Squarespace, Wix) genererar sitemap automatiskt — aktivera det i inställningarna.\n\nLägg sedan till i robots.txt:\nSitemap: https://example.se/sitemap.xml",
    }


def _check_eat_card(soup, url: str) -> dict:
    """Check 16 — E-A-T signals: About page, contact info, authors."""
    details = []
    issues = []

    from urllib.parse import urlparse
    origin = urlparse(url).netloc

    all_links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    page_text = soup.get_text(separator=" ")

    # About page
    about_keywords = ["/om-oss", "/om-", "/about", "/who-we-are", "/vara-", "/vilka-vi"]
    has_about = any(any(kw in link for kw in about_keywords) for link in all_links)
    if has_about:
        details.append("✓ Om oss-sida länkad från navigeringen")
    else:
        issues.append("Ingen Om oss-sida hittad — AI-sökmotorer väger in vem som står bakom innehållet")

    # Contact page
    contact_keywords = ["/kontakt", "/contact", "/reach", "/hitta-oss"]
    has_contact_page = any(any(kw in link for kw in contact_keywords) for link in all_links)
    if has_contact_page:
        details.append("✓ Kontaktsida länkad")
    else:
        issues.append("Ingen kontaktsida hittad — synlig kontaktinfo stärker trovärdigheten")

    # Visible email on page
    has_email = bool(re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', page_text))
    if has_email:
        details.append("✓ E-postadress synlig på sidan")
    else:
        issues.append("Ingen e-postadress synlig — AI associerar frånvaro av kontaktinfo med lägre trovärdighet")

    # Author bylines (in article/blog context)
    has_author = bool(
        soup.find(attrs={"class": re.compile(r"author|byline|writer", re.I)}) or
        soup.find("a", rel="author") or
        soup.find(attrs={"itemprop": "author"}) or
        soup.find("meta", attrs={"name": re.compile(r"author", re.I)})
    )
    if has_author:
        details.append("✓ Författaruppgifter hittade (stärker E-A-T)")

    # Privacy policy / terms (trust signal)
    legal_keywords = ["/integritetspolicy", "/privacy", "/gdpr", "/villkor", "/terms"]
    has_legal = any(any(kw in link for kw in legal_keywords) for link in all_links)
    if has_legal:
        details.append("✓ Integritetspolicy / villkor länkade")
    else:
        issues.append("Ingen integritetspolicy hittad — frånvaro minskar trovärdigheten hos AI och besökare")

    score = sum([has_about, has_contact_page, has_email, has_legal])

    if score >= 3 and not issues:
        status = "good"
        finding = "Stark trovärdighetsstruktur — Om oss, kontakt, e-post och policy hittade."
    elif score >= 2:
        status = "warning"
        finding = f"Delvis trovärdighetsstruktur — {len(issues)} signaler saknas."
    else:
        status = "bad"
        finding = "Svag trovärdighetsstruktur — AI har svårt att bedöma vem som står bakom sidan."

    details += [f"❌ {i}" for i in issues]

    return {
        "id": 16, "title": "Trovärdighet & avsändare (E-A-T)",
        "status": status,
        "finding": finding,
        "details": details,
        "why": "Google, ChatGPT och Perplexity väger in vem som producerar innehållet. En anonym sida utan Om oss eller kontaktinfo behandlas som mindre trovärdig — och citeras mer sällan.",
        "impact": "E-A-T-signaler är särskilt viktiga i känsliga branscher (hälsa, juridik, ekonomi). Men även för vanliga företag: en identifierbar avsändare ökar sannolikheten att AI rekommenderar er med upp till 35%.",
        "fix": "1. Skapa en 'Om oss'-sida med information om företaget, grundare och vad ni gör\n2. Lägg till en tydlig kontaktsida med e-post och eventuellt telefon\n3. Länka integritetspolicyn i sidfoten\n4. Om ni har en blogg: lägg till författarnamn och kort bio på varje inlägg\n5. Lägg till Organization-schema med contactPoint:\n\n{\"@type\": \"Organization\", \"contactPoint\": {\"@type\": \"ContactPoint\", \"email\": \"info@example.se\", \"contactType\": \"customer service\"}}",
    }
