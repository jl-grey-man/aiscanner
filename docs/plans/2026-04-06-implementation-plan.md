# AI Search Scanner — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web tool where users enter a URL and get a live-streamed Swedish-language report on how AI-search-ready their site is.

**Architecture:** FastAPI backend scrapes the target URL, runs 10 checks using httpx + BeautifulSoup + Claude API, and streams results via SSE. React + Vite frontend consumes the stream and renders cards as they arrive.

**Tech Stack:** Python 3.11, FastAPI, httpx, BeautifulSoup4, anthropic SDK, React 18, Vite, Tailwind CSS v3, TypeScript

---

## Task 1: Backend scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/.env` (symlink or copy from root)

**Step 1: Create directory structure**

```bash
mkdir -p backend/api/scrapers backend/api/ai backend/tests
touch backend/api/__init__.py backend/api/scrapers/__init__.py backend/api/ai/__init__.py
```

**Step 2: Write requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
httpx==0.27.0
beautifulsoup4==4.12.3
lxml==5.2.2
anthropic==0.40.0
python-dotenv==1.0.1
pytest==8.3.0
pytest-asyncio==0.24.0
httpx==0.27.0
slowapi==0.1.9
```

**Step 3: Install dependencies**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Step 4: Write backend/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv("../.env")

app = FastAPI(title="AI Search Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://100.72.180.20"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Step 5: Verify it starts**

```bash
cd backend && source venv/bin/activate
uvicorn main:app --reload --port 8010
# Visit http://localhost:8010/health → {"status":"ok"}
```

**Step 6: Commit**

```bash
git init
git add backend/
git commit -m "feat: backend scaffold"
```

---

## Task 2: Scraper — fetcher.py

**Files:**
- Create: `backend/api/scrapers/fetcher.py`
- Create: `backend/tests/test_fetcher.py`

**Step 1: Write failing test**

```python
# backend/tests/test_fetcher.py
import pytest
from api.scrapers.fetcher import fetch_page

@pytest.mark.asyncio
async def test_fetch_returns_page_data():
    data = await fetch_page("https://example.com")
    assert data["html"] is not None
    assert data["status_code"] == 200
    assert data["headers"] is not None
    assert data["url"] == "https://example.com"

@pytest.mark.asyncio
async def test_fetch_handles_bad_url():
    data = await fetch_page("https://this-domain-does-not-exist-xyzabc.com")
    assert data["error"] is not None
```

**Step 2: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate
pytest tests/test_fetcher.py -v
# Expected: ModuleNotFoundError or ImportError
```

**Step 3: Write implementation**

```python
# backend/api/scrapers/fetcher.py
import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "AIScannerBot/1.0 (+https://aiscanner.se)",
}

async def fetch_page(url: str) -> dict:
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            response = await client.get(url, headers=HEADERS)
            soup = BeautifulSoup(response.text, "lxml")
            return {
                "url": str(response.url),
                "status_code": response.status_code,
                "html": response.text,
                "soup": soup,
                "headers": dict(response.headers),
                "error": None,
            }
    except Exception as e:
        return {
            "url": url,
            "status_code": None,
            "html": None,
            "soup": None,
            "headers": {},
            "error": str(e),
        }
```

**Step 4: Run test to verify it passes**

```bash
pytest tests/test_fetcher.py -v
# Expected: 2 passed
```

**Step 5: Commit**

```bash
git add backend/api/scrapers/fetcher.py backend/tests/test_fetcher.py
git commit -m "feat: fetcher scraper"
```

---

## Task 3: Scrapers — robots, llms_txt, meta, schema

**Files:**
- Create: `backend/api/scrapers/robots.py`
- Create: `backend/api/scrapers/llms_txt.py`
- Create: `backend/api/scrapers/meta.py`
- Create: `backend/api/scrapers/schema.py`
- Create: `backend/tests/test_scrapers.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_scrapers.py
import pytest
from bs4 import BeautifulSoup
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.meta import check_meta
from api.scrapers.schema import check_schema

@pytest.mark.asyncio
async def test_robots_blocks_bots():
    result = await check_robots("https://example.com")
    assert "allowed" in result
    assert "blocked_bots" in result
    assert isinstance(result["blocked_bots"], list)

@pytest.mark.asyncio
async def test_llms_txt_missing():
    result = await check_llms_txt("https://example.com")
    assert "exists" in result

def test_meta_extracts_title():
    html = "<html lang='sv'><head><title>Test</title><meta name='description' content='Hej'></head><body><h1>Rubrik</h1></body></html>"
    soup = BeautifulSoup(html, "lxml")
    result = check_meta(soup, {})
    assert result["title"] == "Test"
    assert result["lang"] == "sv"
    assert len(result["h1"]) == 1

def test_schema_finds_faq():
    html = '''<html><head><script type="application/ld+json">{"@type":"FAQPage"}</script></head></html>'''
    soup = BeautifulSoup(html, "lxml")
    result = check_schema(soup)
    assert "FAQPage" in result["types"]
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_scrapers.py -v
# Expected: ImportError
```

**Step 3: Write robots.py**

```python
# backend/api/scrapers/robots.py
import httpx
from urllib.parse import urlparse

AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "anthropic-ai", "Google-Extended"]

async def check_robots(url: str) -> dict:
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    robots_url = f"{base}/robots.txt"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(robots_url)
        if r.status_code != 200:
            return {"exists": False, "allowed": True, "blocked_bots": [], "raw": ""}
        text = r.text
        blocked = [bot for bot in AI_BOTS if _is_blocked(text, bot)]
        return {
            "exists": True,
            "allowed": len(blocked) == 0,
            "blocked_bots": blocked,
            "raw": text[:2000],
        }
    except Exception as e:
        return {"exists": False, "allowed": True, "blocked_bots": [], "error": str(e)}

def _is_blocked(robots_txt: str, bot: str) -> bool:
    lines = robots_txt.lower().splitlines()
    in_block = False
    for line in lines:
        line = line.strip()
        if line.startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip()
            in_block = agent == bot.lower() or agent == "*"
        elif line.startswith("disallow:") and in_block:
            path = line.split(":", 1)[1].strip()
            if path == "/":
                return True
    return False
```

**Step 4: Write llms_txt.py**

```python
# backend/api/scrapers/llms_txt.py
import httpx
from urllib.parse import urlparse

async def check_llms_txt(url: str) -> dict:
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    llms_url = f"{base}/llms.txt"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(llms_url)
        if r.status_code == 200 and len(r.text.strip()) > 0:
            return {"exists": True, "content": r.text[:3000], "url": llms_url}
        return {"exists": False, "content": "", "url": llms_url}
    except Exception:
        return {"exists": False, "content": "", "url": llms_url}
```

**Step 5: Write meta.py**

```python
# backend/api/scrapers/meta.py
from bs4 import BeautifulSoup

def check_meta(soup: BeautifulSoup, headers: dict) -> dict:
    title = soup.find("title")
    desc = soup.find("meta", attrs={"name": "description"})
    html_tag = soup.find("html")
    last_modified = headers.get("last-modified", "")

    h1 = [t.get_text(strip=True) for t in soup.find_all("h1")]
    h2 = [t.get_text(strip=True) for t in soup.find_all("h2")]
    h3 = [t.get_text(strip=True) for t in soup.find_all("h3")]

    return {
        "title": title.get_text(strip=True) if title else "",
        "title_length": len(title.get_text(strip=True)) if title else 0,
        "description": desc["content"] if desc and desc.get("content") else "",
        "description_length": len(desc["content"]) if desc and desc.get("content") else 0,
        "lang": html_tag.get("lang", "") if html_tag else "",
        "h1": h1,
        "h2": h2,
        "h3": h3,
        "last_modified": last_modified,
    }
```

**Step 6: Write schema.py**

```python
# backend/api/scrapers/schema.py
import json
from bs4 import BeautifulSoup

def check_schema(soup: BeautifulSoup) -> dict:
    scripts = soup.find_all("script", type="application/ld+json")
    types = []
    raw = []
    for script in scripts:
        try:
            data = json.loads(script.string or "")
            t = data.get("@type", "")
            if isinstance(t, list):
                types.extend(t)
            elif t:
                types.append(t)
            raw.append(data)
        except Exception:
            continue
    has_faq = "FAQPage" in types
    has_org = any(t in types for t in ["Organization", "LocalBusiness", "Corporation"])
    has_article = any(t in types for t in ["Article", "BlogPosting", "NewsArticle"])
    return {
        "types": types,
        "has_faq": has_faq,
        "has_org": has_org,
        "has_article": has_article,
        "count": len(scripts),
        "raw": raw,
    }
```

**Step 7: Run tests to verify they pass**

```bash
pytest tests/test_scrapers.py -v
# Expected: 4 passed
```

**Step 8: Commit**

```bash
git add backend/api/scrapers/ backend/tests/test_scrapers.py
git commit -m "feat: scrapers (robots, llms_txt, meta, schema)"
```

---

## Task 4: AI client + prompts

**Files:**
- Create: `backend/api/ai/client.py`
- Create: `backend/api/ai/prompts.py`

**Step 1: Write client.py**

```python
# backend/api/ai/client.py
import os
import anthropic

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client

async def ask_haiku(prompt: str) -> str:
    """Use for fast, cheap checks."""
    client = get_client()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text

async def ask_sonnet(prompt: str) -> str:
    """Use for analysis requiring reasoning."""
    client = get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

**Step 2: Write prompts.py**

```python
# backend/api/ai/prompts.py

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
```

**Step 3: Commit**

```bash
git add backend/api/ai/
git commit -m "feat: Claude API client and prompts"
```

---

## Task 5: Analyzer — orchestrator

**Files:**
- Create: `backend/api/analyzer.py`
- Create: `backend/tests/test_analyzer.py`

**Step 1: Write test**

```python
# backend/tests/test_analyzer.py
import pytest
from api.analyzer import run_checks

@pytest.mark.asyncio
async def test_run_checks_returns_cards():
    cards = []
    async for event in run_checks("https://example.com"):
        cards.append(event)
    assert len(cards) >= 10  # one per check + summary + done
    card_events = [c for c in cards if c["event"] == "card"]
    assert len(card_events) == 10
    summary = next((c for c in cards if c["event"] == "summary"), None)
    assert summary is not None
    assert "score" in summary["data"]
```

**Step 2: Write analyzer.py**

```python
# backend/api/analyzer.py
import json
from typing import AsyncGenerator
from api.scrapers.fetcher import fetch_page
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.meta import check_meta
from api.scrapers.schema import check_schema
from api.ai.client import ask_haiku, ask_sonnet
from api.ai.prompts import entity_clarity_prompt, fix_recommendation_prompt

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
        entity_data = json.loads(entity_response)
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
                "finding": f"Sidan har korrekt språkdeklaration: `lang=\"{lang}\"`.", "fix": ""}
    return {"id": 2, "title": "Språkdeklaration", "status": "bad",
            "finding": "Sidan saknar språkdeklaration i HTML-taggen.",
            "fix": "Lägg till lang-attribut på din HTML-tagg: `<html lang=\"sv\">` (eller `en` för engelska)."}

def _check_robots_card(robots: dict) -> dict:
    if not robots.get("exists"):
        return {"id": 3, "title": "AI-crawler åtkomst", "status": "warning",
                "finding": "Ingen robots.txt hittades. AI-sökmotorer kan crawla sidan men det är bäst att vara explicit.",
                "fix": "Skapa en /robots.txt och tillåt AI-crawlers explicit:\n```\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n```"}
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
            "fix": "Skapa /llms.txt med en beskrivning av din sida:\n```\n# Företagsnamn\n\n> Vad ni gör på en rad\n\n## Om oss\nLängre beskrivning...\n\n## Tjänster\n- Tjänst 1\n- Tjänst 2\n```"}

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
                "fix": "Lägg till en H1-tagg som tydligt beskriver sidans huvudämne: `<h1>Din viktigaste rubrik</h1>`"}
    return {"id": 6, "title": "Rubrikstruktur", "status": "warning",
            "finding": f"Sidan har {len(h1)} H1-rubriker. Det bör bara finnas en.",
            "fix": "Behåll en H1 som huvudrubrik och gör resten till H2."}

def _check_schema_card(schema: dict) -> dict:
    types = schema.get("types", [])
    if not types:
        return {"id": 7, "title": "Strukturerad data (Schema)", "status": "bad",
                "finding": "Ingen strukturerad data (JSON-LD) hittades.",
                "fix": "Lägg till Organization-schema i din HTML:\n```html\n<script type=\"application/ld+json\">\n{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"Ditt Företag\",\"url\":\"https://example.com\",\"description\":\"Vad ni gör\"}\n</script>\n```"}
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
```

**Step 3: Run test**

```bash
pytest tests/test_analyzer.py -v
# Note: This hits real URLs and Claude API — needs ANTHROPIC_API_KEY set
# Expected: 1 passed (may take 10-20 seconds)
```

**Step 4: Commit**

```bash
git add backend/api/analyzer.py backend/tests/test_analyzer.py
git commit -m "feat: analyzer orchestrator with 10 checks"
```

---

## Task 6: SSE endpoint + rate limiting

**Files:**
- Modify: `backend/main.py`
- Create: `backend/api/rate_limiter.py`
- Create: `backend/tests/test_api.py`

**Step 1: Write rate_limiter.py**

```python
# backend/api/rate_limiter.py
import time
from collections import defaultdict

_requests: dict[str, list[float]] = defaultdict(list)
LIMIT = 3
WINDOW = 3600  # 1 hour

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    _requests[ip] = [t for t in _requests[ip] if now - t < WINDOW]
    if len(_requests[ip]) >= LIMIT:
        return True
    _requests[ip].append(now)
    return False
```

**Step 2: Update main.py with SSE endpoint**

```python
# backend/main.py
import json
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from dotenv import load_dotenv
from api.analyzer import run_checks
from api.rate_limiter import is_rate_limited

load_dotenv("../.env")

app = FastAPI(title="AI Search Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://100.72.180.20"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    url: str

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    ip = request.client.host

    if is_rate_limited(ip):
        return StreamingResponse(
            _error_stream("För många förfrågningar. Vänta en timme och försök igen."),
            media_type="text/event-stream",
        )

    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"

    return StreamingResponse(
        _stream_analysis(url),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

async def _stream_analysis(url: str):
    async for event in run_checks(url):
        data = json.dumps(event["data"], ensure_ascii=False)
        yield f"event: {event['event']}\ndata: {data}\n\n"

async def _error_stream(message: str):
    data = json.dumps({"message": message}, ensure_ascii=False)
    yield f"event: error\ndata: {data}\n\n"
```

**Step 3: Write API test**

```python
# backend/tests/test_api.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

def test_analyze_requires_url():
    r = client.post("/api/analyze", json={})
    assert r.status_code == 422
```

**Step 4: Run tests**

```bash
pytest tests/test_api.py -v
# Expected: 2 passed
```

**Step 5: Commit**

```bash
git add backend/main.py backend/api/rate_limiter.py backend/tests/test_api.py
git commit -m "feat: SSE endpoint and rate limiting"
```

---

## Task 7: Frontend scaffold

**Files:**
- Create: `frontend/` (via Vite)

**Step 1: Scaffold React + Vite + TypeScript**

```bash
cd /mnt/storage/newweb
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

**Step 2: Configure Tailwind — update frontend/tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0a0f",
        surface: "#12121a",
        border: "#1e1e2e",
        accent: "#6366f1",
        "accent-glow": "#818cf8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
```

**Step 3: Update frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  background-color: #0a0a0f;
  color: #e2e8f0;
}
```

**Step 4: Update frontend/vite.config.ts to proxy API**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8010',
    },
  },
})
```

**Step 5: Verify it builds**

```bash
cd frontend && npm run build
# Expected: No errors, dist/ created
```

**Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffold (React + Vite + Tailwind)"
```

---

## Task 8: SSE hook + types

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/hooks/useAnalysis.ts`
- Create: `frontend/src/lib/api.ts`

**Step 1: Write types.ts**

```ts
// frontend/src/types.ts
export type CardStatus = 'good' | 'warning' | 'bad'

export interface ReportCard {
  id: number
  title: string
  status: CardStatus
  finding: string
  fix: string
}

export interface Summary {
  score: number
  good: number
  warning: number
  bad: number
}

export type AnalysisState = 'idle' | 'scanning' | 'done' | 'error'
```

**Step 2: Write useAnalysis.ts**

```ts
// frontend/src/hooks/useAnalysis.ts
import { useState, useCallback } from 'react'
import { ReportCard, Summary, AnalysisState } from '../types'

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [cards, setCards] = useState<ReportCard[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (url: string) => {
    setState('scanning')
    setCards([])
    setSummary(null)
    setError(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const chunk of lines) {
          const eventLine = chunk.split('\n').find(l => l.startsWith('event:'))
          const dataLine = chunk.split('\n').find(l => l.startsWith('data:'))
          if (!eventLine || !dataLine) continue

          const event = eventLine.replace('event: ', '').trim()
          const data = JSON.parse(dataLine.replace('data: ', '').trim())

          if (event === 'card') {
            setCards(prev => [...prev, data as ReportCard])
          } else if (event === 'summary') {
            setSummary(data as Summary)
          } else if (event === 'done') {
            setState('done')
          } else if (event === 'error') {
            setError(data.message)
            setState('error')
          }
        }
      }
    } catch (e) {
      setError('Något gick fel. Försök igen.')
      setState('error')
    }
  }, [])

  return { state, cards, summary, error, analyze }
}
```

**Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/hooks/ frontend/src/lib/
git commit -m "feat: SSE hook and types"
```

---

## Task 9: Landing page

**Files:**
- Create: `frontend/src/pages/Landing.tsx`
- Create: `frontend/src/components/UrlInput.tsx`

**Step 1: Write UrlInput.tsx**

```tsx
// frontend/src/components/UrlInput.tsx
import { useState, FormEvent } from 'react'

interface Props {
  onSubmit: (url: string) => void
  disabled?: boolean
}

export function UrlInput({ onSubmit, disabled }: Props) {
  const [url, setUrl] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://dittforetag.se"
          disabled={disabled}
          className="flex-1 bg-surface border border-border rounded-xl px-5 py-4 text-lg
                     placeholder-slate-500 focus:outline-none focus:border-accent
                     transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className="bg-accent hover:bg-accent-glow text-white font-semibold
                     px-8 py-4 rounded-xl transition-colors disabled:opacity-40
                     disabled:cursor-not-allowed whitespace-nowrap"
        >
          Skanna sidan
        </button>
      </div>
    </form>
  )
}
```

**Step 2: Write Landing.tsx**

```tsx
// frontend/src/pages/Landing.tsx
import { UrlInput } from '../components/UrlInput'

const CHECKS = [
  { icon: '🤖', label: 'AI-crawler åtkomst' },
  { icon: '📄', label: 'llms.txt standard' },
  { icon: '🏗️', label: 'Strukturerad data' },
  { icon: '🔍', label: 'Innehållstydlighet' },
]

interface Props {
  onSubmit: (url: string) => void
  loading?: boolean
}

export function Landing({ onSubmit, loading }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
      <div className="text-center mb-12 max-w-3xl">
        <div className="inline-block bg-accent/10 text-accent-glow text-sm font-medium
                        px-4 py-1.5 rounded-full mb-6 border border-accent/20">
          GEO & AEO-optimering
        </div>
        <h1 className="text-5xl font-bold mb-5 leading-tight tracking-tight">
          Syns du för{' '}
          <span className="text-accent-glow">AI-sökmotorer?</span>
        </h1>
        <p className="text-slate-400 text-xl leading-relaxed">
          Skriv in din URL — vi analyserar din sida och berättar exakt vad som behöver fixas
          för att ChatGPT, Perplexity och Google AI ska hitta och citera dig.
        </p>
      </div>

      <UrlInput onSubmit={onSubmit} disabled={loading} />

      <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl w-full">
        {CHECKS.map(c => (
          <div key={c.label}
               className="bg-surface border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/components/UrlInput.tsx
git commit -m "feat: landing page"
```

---

## Task 10: Report page + components

**Files:**
- Create: `frontend/src/pages/Report.tsx`
- Create: `frontend/src/components/ReportCard.tsx`
- Create: `frontend/src/components/ScoreBadge.tsx`
- Create: `frontend/src/components/Progress.tsx`
- Create: `frontend/src/components/CTA.tsx`

**Step 1: Write ScoreBadge.tsx**

```tsx
// frontend/src/components/ScoreBadge.tsx
interface Props { score: number }

export function ScoreBadge({ score }: Props) {
  const color = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className={`text-4xl font-bold ${color}`}>{score}</span>
      <span className="text-slate-400 text-lg">/100</span>
    </div>
  )
}
```

**Step 2: Write ReportCard.tsx**

```tsx
// frontend/src/components/ReportCard.tsx
import { useState } from 'react'
import { ReportCard as CardType } from '../types'

const STATUS = {
  good:    { icon: '✅', label: 'Bra',              bg: 'border-green-500/20 bg-green-500/5' },
  warning: { icon: '⚠️', label: 'Kan förbättras',  bg: 'border-yellow-500/20 bg-yellow-500/5' },
  bad:     { icon: '❌', label: 'Saknas eller fel', bg: 'border-red-500/20 bg-red-500/5' },
}

interface Props { card: CardType; delay?: number }

export function ReportCard({ card, delay = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const s = STATUS[card.status]

  return (
    <div
      className={`border rounded-xl p-5 transition-all duration-300 ${s.bg}
                  animate-in fade-in slide-in-from-bottom-2`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => card.fix ? setOpen(o => !o) : undefined}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{s.icon}</span>
          <div>
            <h3 className="font-semibold text-white">{card.title}</h3>
            <p className="text-slate-400 text-sm mt-0.5">{card.finding}</p>
          </div>
        </div>
        {card.fix && (
          <span className="text-slate-500 text-sm ml-4 shrink-0">
            {open ? '↑ Dölj' : '↓ Hur fixar jag?'}
          </span>
        )}
      </div>

      {open && card.fix && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{card.fix}</p>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Write Progress.tsx**

```tsx
// frontend/src/components/Progress.tsx
interface Props { current: number; total?: number }

export function Progress({ current, total = 10 }: Props) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-slate-400 mb-2">
        <span>Analyserar… ({current}/{total} kontroller)</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

**Step 4: Write CTA.tsx**

```tsx
// frontend/src/components/CTA.tsx
export function CTA() {
  return (
    <div className="mt-16 grid md:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded-2xl p-8">
        <h3 className="text-xl font-semibold mb-3">Fixa det själv</h3>
        <p className="text-slate-400 mb-5">
          Rapporten ovan berättar exakt vad som behöver göras. Skicka den till din webbutvecklare.
        </p>
        <button className="text-accent-glow font-medium hover:underline">
          Ladda ner som PDF →
        </button>
      </div>
      <div className="bg-accent/10 border border-accent/30 rounded-2xl p-8">
        <h3 className="text-xl font-semibold mb-3">Vi fixar det åt dig</h3>
        <p className="text-slate-400 mb-5">
          Vi implementerar alla förbättringar och garanterar att du syns i AI-sökmotorer.
        </p>
        <a
          href="mailto:hej@example.com"
          className="inline-block bg-accent hover:bg-accent-glow text-white font-semibold
                     px-6 py-3 rounded-xl transition-colors"
        >
          Kontakta oss →
        </a>
      </div>
    </div>
  )
}
```

**Step 5: Write Report.tsx**

```tsx
// frontend/src/pages/Report.tsx
import { ReportCard as CardComp } from '../components/ReportCard'
import { ScoreBadge } from '../components/ScoreBadge'
import { Progress } from '../components/Progress'
import { CTA } from '../components/CTA'
import { ReportCard, Summary, AnalysisState } from '../types'

interface Props {
  url: string
  cards: ReportCard[]
  summary: Summary | null
  state: AnalysisState
  error: string | null
  onReset: () => void
}

export function Report({ url, cards, summary, state, error, onReset }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={onReset} className="text-slate-500 hover:text-slate-300 text-sm mb-2">
            ← Skanna en ny sida
          </button>
          <h2 className="font-semibold text-slate-300 truncate max-w-sm">{url}</h2>
        </div>
        {summary && <ScoreBadge score={summary.score} />}
      </div>

      {state === 'scanning' && <Progress current={cards.length} />}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 mb-6">
          {error}
        </div>
      )}

      <div className="space-y-4 mt-6">
        {cards.map((card, i) => (
          <ReportCard key={card.id} card={card} delay={i * 100} />
        ))}
      </div>

      {state === 'done' && summary && <CTA />}
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add frontend/src/pages/Report.tsx frontend/src/components/
git commit -m "feat: report page and all components"
```

---

## Task 11: Wire up App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Write App.tsx**

```tsx
// frontend/src/App.tsx
import { useState } from 'react'
import { Landing } from './pages/Landing'
import { Report } from './pages/Report'
import { useAnalysis } from './hooks/useAnalysis'

export default function App() {
  const [url, setUrl] = useState('')
  const { state, cards, summary, error, analyze } = useAnalysis()

  function handleSubmit(inputUrl: string) {
    setUrl(inputUrl)
    analyze(inputUrl)
  }

  if (state === 'idle') {
    return <Landing onSubmit={handleSubmit} />
  }

  return (
    <Report
      url={url}
      cards={cards}
      summary={summary}
      state={state}
      error={error}
      onReset={() => window.location.reload()}
    />
  )
}
```

**Step 2: Verify it runs**

```bash
cd frontend && npm run dev
# Visit http://localhost:5173 — landing page should appear
```

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up App with landing + report"
```

---

## Task 12: Systemd service + nginx

**Files:**
- Create: `deploy/ai-scanner-api.service`
- Create: `deploy/nginx.conf`
- Create: `deploy/deploy.sh`

**Step 1: Write service file**

```ini
# deploy/ai-scanner-api.service
[Unit]
Description=AI Search Scanner API
After=network.target

[Service]
Type=simple
User=jens
WorkingDirectory=/mnt/storage/newweb/backend
Environment=PATH=/mnt/storage/newweb/backend/venv/bin
ExecStart=/mnt/storage/newweb/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8010
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Step 2: Write nginx config snippet**

```nginx
# deploy/nginx.conf (add to existing nginx config)
location /aiscanner/ {
    alias /mnt/storage/newweb/frontend/dist/;
    try_files $uri $uri/ /aiscanner/index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:8010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # SSE-specific headers
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

**Step 3: Write deploy.sh**

```bash
#!/bin/bash
set -e
cd /mnt/storage/newweb

# Build frontend
cd frontend && npm run build && cd ..

# Install/update systemd service
sudo cp deploy/ai-scanner-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ai-scanner-api
sudo systemctl restart ai-scanner-api

echo "✓ Deployed. Visit http://100.72.180.20/aiscanner/"
```

**Step 4: Deploy**

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

**Step 5: Update nginx and reload**

```bash
# Add nginx config snippet manually to /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx
```

**Step 6: Commit**

```bash
git add deploy/
git commit -m "feat: deploy scripts and nginx config"
```

---

## Done

Visit `http://100.72.180.20/aiscanner/` — enter a URL, watch the report stream in.

**Register the service in the port registry:** port `8010` → AI Search Scanner API
