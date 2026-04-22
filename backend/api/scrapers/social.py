import re
import json

PLATFORMS = [
    ("LinkedIn",    r"linkedin\.com/company/[\w\-\./]+"),
    ("Facebook",    r"facebook\.com/[\w\.\-]+"),
    ("Instagram",   r"instagram\.com/[\w\.\-]+"),
    ("Twitter/X",   r"(?:twitter|x)\.com/[\w\-]+"),
    ("YouTube",     r"youtube\.com/(?:channel|@|c/)[\w\-\.]+"),
    ("Google Maps", r"(?:maps\.google\.|goo\.gl/maps|g\.page)[\S]*"),
    ("Trustpilot",  r"trustpilot\.com/review/[\w\.\-]+"),
]


def extract_social_links(soup) -> dict[str, str]:
    """Return dict of {platform: url} found as links or in sameAs schema."""
    found: dict[str, str] = {}

    # 1. All href links on the page
    hrefs = " ".join(a.get("href", "") for a in soup.find_all("a", href=True))
    for platform, pattern in PLATFORMS:
        m = re.search(pattern, hrefs, re.IGNORECASE)
        if m:
            found[platform] = m.group(0)

    # 2. sameAs in JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                data = data[0]
            same_as = data.get("sameAs", [])
            if isinstance(same_as, str):
                same_as = [same_as]
            for url in same_as:
                for platform, pattern in PLATFORMS:
                    if platform not in found and re.search(pattern, url, re.IGNORECASE):
                        found[platform] = url
        except Exception:
            pass

    return found
