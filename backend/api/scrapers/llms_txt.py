import httpx
from urllib.parse import urlparse

async def check_llms_txt(url: str) -> dict:
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    llms_url = f"{base}/llms.txt"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify="/etc/ssl/certs/ca-certificates.crt") as client:
            r = await client.get(llms_url)
        if r.status_code == 200 and len(r.text.strip()) > 0:
            return {"exists": True, "content": r.text[:3000], "url": llms_url}
        return {"exists": False, "content": "", "url": llms_url}
    except Exception:
        return {"exists": False, "content": "", "url": llms_url}
