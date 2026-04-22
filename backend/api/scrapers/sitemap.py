import httpx
import re

SSL_VERIFY = "/etc/ssl/certs/ca-certificates.crt"


async def check_sitemap(url: str) -> dict:
    """Check for sitemap.xml existence and basic quality."""
    base = url.rstrip("/").split("?")[0]
    # Strip to origin
    from urllib.parse import urlparse
    parsed = urlparse(base)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    candidates = [
        f"{origin}/sitemap.xml",
        f"{origin}/sitemap_index.xml",
        f"{origin}/sitemap-index.xml",
    ]

    # Also check robots.txt for Sitemap: directive
    robots_sitemap = None
    try:
        async with httpx.AsyncClient(timeout=8, verify=SSL_VERIFY) as client:
            r = await client.get(f"{origin}/robots.txt")
            if r.status_code == 200:
                m = re.search(r"^Sitemap:\s*(.+)$", r.text, re.MULTILINE | re.IGNORECASE)
                if m:
                    robots_sitemap = m.group(1).strip()
                    if robots_sitemap not in candidates:
                        candidates.insert(0, robots_sitemap)
    except Exception:
        pass

    async with httpx.AsyncClient(timeout=8, verify=SSL_VERIFY, follow_redirects=True) as client:
        for candidate in candidates:
            try:
                r = await client.get(candidate)
                if r.status_code == 200 and ("<urlset" in r.text or "<sitemapindex" in r.text):
                    # Count URLs
                    url_count = len(re.findall(r"<url>", r.text))
                    is_index = "<sitemapindex" in r.text
                    sub_count = len(re.findall(r"<sitemap>", r.text)) if is_index else 0
                    return {
                        "exists": True,
                        "url": candidate,
                        "is_index": is_index,
                        "url_count": url_count,
                        "sub_sitemap_count": sub_count,
                        "in_robots": candidate == robots_sitemap,
                    }
            except Exception:
                continue

    return {"exists": False, "robots_sitemap": robots_sitemap}
