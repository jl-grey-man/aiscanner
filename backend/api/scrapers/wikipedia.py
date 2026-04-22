import httpx

SSL_VERIFY = "/etc/ssl/certs/ca-certificates.crt"
HEADERS = {"User-Agent": "AIScannerBot/1.0 (+https://aiscanner.se)"}


async def check_wikipedia(company_name: str) -> dict:
    """Search Swedish then English Wikipedia for the company."""
    if not company_name or len(company_name) < 2:
        return {"exists": False}

    for lang in ["sv", "en"]:
        try:
            async with httpx.AsyncClient(timeout=8.0, verify=SSL_VERIFY) as client:
                response = await client.get(
                    f"https://{lang}.wikipedia.org/w/api.php",
                    params={
                        "action": "query",
                        "list": "search",
                        "srsearch": company_name,
                        "format": "json",
                        "srlimit": 3,
                        "srnamespace": 0,
                    },
                    headers=HEADERS,
                )
            data = response.json()
            results = data.get("query", {}).get("search", [])
            if results:
                top = results[0]
                return {
                    "exists": True,
                    "lang": lang,
                    "title": top["title"],
                    "url": f"https://{lang}.wikipedia.org/wiki/{top['title'].replace(' ', '_')}",
                    "snippet": top.get("snippet", ""),
                }
        except Exception:
            continue

    return {"exists": False}


def extract_company_name(meta: dict, soup) -> str:
    """Best-effort extraction of company name from page signals."""
    # 1. og:site_name
    og_site = soup.find("meta", property="og:site_name")
    if og_site and og_site.get("content"):
        return og_site["content"].strip()

    # 2. Organization schema name
    import json
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                data = data[0]
            if data.get("@type") in ("Organization", "LocalBusiness", "Corporation"):
                name = data.get("name", "")
                if name:
                    return name.strip()
        except Exception:
            pass

    # 3. Title tag — strip common suffixes like "| Hem", "- Startsida", etc.
    title = meta.get("title", "")
    for sep in [" | ", " - ", " — ", " – "]:
        if sep in title:
            return title.split(sep)[0].strip()
    return title.strip()
