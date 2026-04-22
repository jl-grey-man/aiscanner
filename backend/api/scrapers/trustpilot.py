import json
import re
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from datetime import datetime, timezone

SSL_VERIFY = "/etc/ssl/certs/ca-certificates.crt"

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
}


def _extract_aggregate_rating(data: dict) -> dict | None:
    """Recursively find aggregateRating in a JSON-LD dict, including @graph arrays."""
    if "aggregateRating" in data:
        ar = data["aggregateRating"]
        try:
            return {
                "rating": float(ar.get("ratingValue", 0)),
                "count": int(ar.get("reviewCount", 0)),
            }
        except (TypeError, ValueError):
            return None

    for item in data.get("@graph", []):
        if isinstance(item, dict):
            result = _extract_aggregate_rating(item)
            if result:
                return result

    return None


def _extract_reviews_from_next_data(html: str) -> list[dict]:
    """Try to parse reviews from Trustpilot's __NEXT_DATA__ JSON blob."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return []
    try:
        nd = json.loads(m.group(1))
        reviews_raw = (
            nd.get("props", {})
              .get("pageProps", {})
              .get("reviews", [])
        )
        result = []
        for r in reviews_raw:
            text = r.get("text", "").strip()
            rating = r.get("rating")
            date_str = r.get("dates", {}).get("publishedDate", "")
            days_ago = None
            if date_str:
                try:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    days_ago = (datetime.now(timezone.utc) - dt).days
                except Exception:
                    pass
            if text:
                result.append({"text": text, "rating": rating, "days_ago": days_ago})
        return result
    except Exception:
        return []


def _extract_reviews_from_html(soup: BeautifulSoup) -> list[dict]:
    """Fallback: scrape review text and dates from Trustpilot HTML."""
    reviews = []
    # Trustpilot uses data-service-review-text-typography or similar
    for el in soup.select("[data-service-review-text-typography]"):
        text = el.get_text(strip=True)
        if text:
            reviews.append({"text": text, "rating": None, "days_ago": None})

    if not reviews:
        # Generic fallback — look for <p> inside review articles
        for article in soup.find_all("article", limit=10):
            p = article.find("p")
            if p:
                text = p.get_text(strip=True)
                if len(text) > 20:
                    reviews.append({"text": text, "rating": None, "days_ago": None})

    return reviews[:5]


async def check_trustpilot(url: str) -> dict:
    domain = urlparse(url).netloc.lstrip("www.")
    tp_url = f"https://www.trustpilot.com/review/{domain}"

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=10.0,
            verify=SSL_VERIFY,
        ) as client:
            response = await client.get(tp_url, headers=BROWSER_HEADERS)

        if response.status_code == 404:
            return {"exists": False, "domain": domain, "url": tp_url}

        if response.status_code != 200:
            return {"exists": False, "domain": domain, "url": tp_url, "error": f"HTTP {response.status_code}"}

        soup = BeautifulSoup(response.text, "lxml")
        html = response.text

        # Rating — try JSON-LD first
        rating_data = None
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                raw = json.loads(script.string or "")
                items = raw if isinstance(raw, list) else [raw]
                for item in items:
                    result = _extract_aggregate_rating(item)
                    if result:
                        rating_data = result
                        break
            except Exception:
                continue
            if rating_data:
                break

        # Regex fallback for rating
        if not rating_data:
            m = re.search(r'"ratingValue"\s*:\s*"?([\d.]+)"?.*?"reviewCount"\s*:\s*"?(\d+)"?', html)
            if not m:
                m = re.search(r'"reviewCount"\s*:\s*"?(\d+)"?.*?"ratingValue"\s*:\s*"?([\d.]+)"?', html)
                if m:
                    rating_data = {"rating": float(m.group(2)), "count": int(m.group(1))}
            elif m:
                rating_data = {"rating": float(m.group(1)), "count": int(m.group(2))}

        # Reviews — try __NEXT_DATA__ first, then HTML
        reviews = _extract_reviews_from_next_data(html)
        if not reviews:
            reviews = _extract_reviews_from_html(soup)

        # Recency from reviews
        days_since_review = None
        days_list = [r["days_ago"] for r in reviews if r.get("days_ago") is not None]
        if days_list:
            days_since_review = min(days_list)  # most recent

        base = {"exists": True, "domain": domain, "url": tp_url, "reviews": reviews, "days_since_review": days_since_review}
        if rating_data:
            return {**base, **rating_data}
        return {**base, "rating": None, "count": None}

    except Exception as e:
        return {"exists": False, "domain": domain, "url": tp_url, "error": str(e)}
