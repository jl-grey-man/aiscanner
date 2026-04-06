import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "AIScannerBot/1.0 (+https://aiscanner.se)",
}

# Use system CA bundle — certifi's bundle doesn't work on this platform
SSL_VERIFY = "/etc/ssl/certs/ca-certificates.crt"

async def fetch_page(url: str) -> dict:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=15.0,
            verify=SSL_VERIFY,
        ) as client:
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
