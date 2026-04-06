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
