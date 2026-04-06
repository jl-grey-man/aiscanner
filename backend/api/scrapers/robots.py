import httpx
from urllib.parse import urlparse

AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "anthropic-ai", "Google-Extended"]

async def check_robots(url: str) -> dict:
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    robots_url = f"{base}/robots.txt"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify="/etc/ssl/certs/ca-certificates.crt") as client:
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
