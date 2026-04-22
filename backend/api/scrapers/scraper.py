import re
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from api.scrapers.fetcher import fetch_page
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.sitemap import check_sitemap
from api.scrapers.schema import check_schema

# Page type patterns — we pick ONE of each type
PAGE_TYPE_PATTERNS = {
    "contact": re.compile(r"/(?:kontakt|contact)(?:[/-]|$)", re.I),
    "about": re.compile(r"/(?:om(?:-oss)?|about(?:-us)?)(?:[/-]|$)", re.I),
    "services": re.compile(r"/(?:tjanster|tjänster|services?|vara-tjanster|behandlingar|menu|meny)(?:[/-]|$)", re.I),
    "booking": re.compile(r"/(?:boka|book)(?:[/-]|$)", re.I),
    "location": re.compile(r"/(?:hitta|besok|visit|find-us|hitta-hit)(?:[/-]|$)", re.I),
}

# Patterns to exclude
EXCLUDE_PATTERNS = [
    r"/blogg?",
    r"/tagg?",
    r"/kategori",
    r"/category",
    r"/arkiv",
    r"/archive",
    r"/page/\d+",
    r"/author/",
    r"/sok",
    r"/search",
    r"\.pdf$",
    r"\.(?:jpg|jpeg|png|gif|zip|doc|docx|mp4|svg)$",
]


def _is_swedish_path(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.startswith("/sv") or path.startswith("/se/")


def _is_english_path(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.startswith("/en") or path.startswith("/english/")


def _path_without_lang(url: str) -> str:
    path = urlparse(url).path
    return re.sub(r"^/(?:en|sv|se|english)/", "/", path)


def _matches_any(url: str, patterns: list) -> bool:
    url_lower = url.lower()
    return any(re.search(p, url_lower) for p in patterns)


def _extract_urls_from_sitemap(xml_text: str) -> list:
    """Extract all URLs from a sitemap.xml string."""
    urls = []
    try:
        text = re.sub(r'xmlns="[^"]+"', '', xml_text)
        root = ET.fromstring(text)
        for url_elem in root.findall(".//url"):
            loc = url_elem.find("loc")
            if loc is not None and loc.text:
                urls.append(loc.text.strip())
    except Exception:
        urls = re.findall(r"<loc>([^<]+)</loc>", xml_text)
    return urls


def _extract_internal_links(soup: BeautifulSoup, base_url: str) -> list:
    """Extract internal links from a page's HTML."""
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower()
    links = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        full_url = urljoin(base_url, href)
        parsed = urlparse(full_url)
        if parsed.netloc.lower() == base_domain:
            clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if clean != base_url.rstrip("/"):
                links.add(clean)

    return list(links)


def _select_relevant_pages(urls: list, base_url: str, max_pages: int = 4, log=None) -> list:
    """Select the most relevant pages — one per type, prefer Swedish over English."""
    base_domain = urlparse(base_url).netloc.lower()

    if log:
        log.add("discovery", f"Filtrerar {len(urls)} URL:er")

    # 1. Deduplicate and normalize
    seen = set()
    unique = []
    for url in urls:
        n = url.rstrip("/").lower()
        if n not in seen:
            seen.add(n)
            unique.append(url)

    # 2. Separate by language path
    sv_urls = []
    en_urls = []
    other_urls = []

    for url in unique:
        try:
            if _is_swedish_path(url):
                sv_urls.append(url)
            elif _is_english_path(url):
                en_urls.append(url)
            else:
                other_urls.append(url)
        except Exception:
            other_urls.append(url)

    # 3. Discard English if Swedish equivalent exists
    pool = sv_urls + other_urls
    kept_english = []
    for en_url in en_urls:
        en_path = _path_without_lang(en_url).lower()
        has_sv = any(_path_without_lang(u).lower() == en_path for u in pool)
        if not has_sv:
            kept_english.append(en_url)
    pool.extend(kept_english)

    # 4. Filter to same domain and exclude patterns
    domain_urls = []
    for url in pool:
        parsed = urlparse(url)
        if parsed.netloc.lower() != base_domain:
            if log:
                log.add("discovery", f"Exkluderad (extern): {url}")
            continue
        if _matches_any(url, EXCLUDE_PATTERNS):
            if log:
                log.add("discovery", f"Exkluderad (mönster): {url}")
            continue
        domain_urls.append(url)

    # 5. Pick one of each type
    selected = []
    used_paths = set()

    for type_name, regex in PAGE_TYPE_PATTERNS.items():
        match = None
        for url in domain_urls:
            path = urlparse(url).path
            if regex.search(path) and path not in used_paths:
                match = url
                break
        if match:
            selected.append(match)
            used_paths.add(urlparse(match).path)
            if log:
                log.add("discovery", f"Valde {type_name}: {match}")

    # 6. Fill remaining slots with other URLs
    remaining = [u for u in domain_urls if u not in selected]
    while len(selected) < max_pages and remaining:
        next_url = remaining.pop(0)
        selected.append(next_url)

    result = selected[:max_pages]

    if log:
        log.add("discovery", f"Valde {len(result)} sidor", {"selected": result, "sv": len(sv_urls), "en_skipped": len(en_urls) - len(kept_english)})

    return result


def _clean_body_text(soup: BeautifulSoup) -> str:
    """Remove noise elements and extract clean body text."""
    # Clone so we don't mutate original
    clone = BeautifulSoup(str(soup), "lxml")
    for tag in clone.find_all(["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript"]):
        tag.decompose()
    text = clone.get_text(separator=" ", strip=True)
    return re.sub(r"\s+", " ", text)


def _detect_schema_types(schema_scripts: list) -> tuple:
    """Check for LocalBusiness and Restaurant schema types."""
    has_local = False
    has_restaurant = False
    for script in schema_scripts:
        lower = script.lower()
        if "localbusiness" in lower:
            has_local = True
        if "restaurant" in lower or "foodestablishment" in lower:
            has_restaurant = True
    return has_local, has_restaurant


async def _scrape_single_page(url: str, log=None) -> dict:
    """Scrape a single page and return structured data."""
    if log:
        log.add("fetch", f"Hämtar: {url}")

    page = await fetch_page(url)
    if page["error"] is not None or page["soup"] is None:
        if log:
            log.add("fetch", f"Misslyckades: {url}", {"error": page.get("error", "okänt fel")})
        return None

    if log:
        log.add("fetch", f"Hämtad OK: {url}", {"status": page.get("status_code"), "size": len(page.get("html", ""))})

    soup = page["soup"]
    body_text = _clean_body_text(soup)

    schema_scripts = []
    for script in soup.find_all("script", type="application/ld+json"):
        text = script.string or ""
        if text.strip():
            schema_scripts.append(text.strip()[:1500])  # max 1500 chars per schema

    has_local, has_restaurant = _detect_schema_types(schema_scripts)

    phones = _extract_phones(body_text)
    addresses = _extract_addresses(body_text)
    cities = _extract_cities(body_text)

    return {
        "url": str(page["url"]),
        "title": soup.find("title").get_text(strip=True) if soup.find("title") else "",
        "meta_description": _get_meta_content(soup, "description"),
        "h1": _get_first_h1(soup),
        "h2s": [t.get_text(strip=True) for t in soup.find_all("h2")][:5],
        "body_text": body_text[:2000],  # Hard limit: 2000 chars per page
        "schema_scripts": schema_scripts,
        "has_local_business_schema": has_local,
        "has_restaurant_schema": has_restaurant,
        "nap_hints": {
            "phones": list(dict.fromkeys(phones))[:5],
            "addresses": list(dict.fromkeys(addresses))[:5],
            "cities": list(dict.fromkeys(cities))[:5],
        },
    }


def _get_first_h1(soup: BeautifulSoup) -> str:
    h1 = soup.find("h1")
    return h1.get_text(strip=True) if h1 else ""


def _get_meta_content(soup: BeautifulSoup, name: str) -> str:
    tag = soup.find("meta", attrs={"name": name})
    if tag and tag.get("content"):
        return tag["content"]
    return ""


async def scrape_website(url: str, log=None) -> dict:
    """Scrape a website — main page + up to 4 relevant sub-pages."""
    if log:
        log.add("start", f"Börjar skanna: {url}")

    # 1. Fetch main page
    if log:
        log.add("fetch", f"Hämtar förstasida: {url}")

    main_page = await fetch_page(url)
    if main_page["error"] is not None:
        raise Exception(f"Kunde inte hämta sidan: {main_page['error']}")

    soup = main_page["soup"]
    if soup is None:
        raise Exception("Kunde inte tolka sidan.")

    base_url = main_page["url"]
    if log:
        log.add("fetch", f"Förstasida hämtad: {base_url}", {"status": main_page.get("status_code"), "html_size": len(main_page.get("html", ""))})

    # 2. Fetch robots, llms.txt, sitemap in parallel
    if log:
        log.add("fetch", "Hämtar robots.txt, llms.txt, sitemap parallellt")

    robots_data, llms_data, sitemap_data = await _fetch_parallel(
        check_robots(base_url),
        check_llms_txt(base_url),
        check_sitemap(base_url),
    )

    if log:
        log.add("fetch", "robots.txt resultat", {"exists": bool(robots_data.get("exists")), "has_blocked_bots": bool(robots_data.get("blocked_bots"))})
        log.add("fetch", "llms.txt resultat", {"exists": bool(llms_data.get("exists"))})
        log.add("fetch", "sitemap resultat", {"exists": bool(sitemap_data.get("exists")), "url_count": sitemap_data.get("url_count", 0)})

    # 3. Discover extra pages to scrape
    extra_urls = []
    sitemap_url = sitemap_data.get("url") if sitemap_data.get("exists") else None

    if sitemap_url and sitemap_data.get("url_count", 0) > 0 and sitemap_data.get("url_count", 0) < 200:
        if log:
            log.add("discovery", f"Använder sitemap: {sitemap_url} ({sitemap_data.get('url_count')} URL:er)")

        from api.scrapers.fetcher import fetch_page as _fetch_page_for_sitemap
        sitemap_page = await _fetch_page_for_sitemap(sitemap_url)
        if sitemap_page["error"] is None and sitemap_page["html"]:
            all_urls = _extract_urls_from_sitemap(sitemap_page["html"])
            if log:
                log.add("discovery", f"Hittade {len(all_urls)} URL:er i sitemap")
            extra_urls = _select_relevant_pages(all_urls, base_url, max_pages=4, log=log)
        else:
            if log:
                log.add("discovery", "Kunde inte hämta sitemap", {"error": sitemap_page.get("error")})
    else:
        if log:
            log.add("discovery", "Sitemap saknas eller för stor — använder interna länkar som fallback")

    if not extra_urls:
        internal_links = _extract_internal_links(soup, base_url)
        if log:
            log.add("discovery", f"Hittade {len(internal_links)} interna länkar på förstasidan")
        extra_urls = _select_relevant_pages(internal_links, base_url, max_pages=3, log=log)

    # 4. Scrape extra pages in parallel
    extra_pages = []
    if extra_urls:
        if log:
            log.add("fetch", f"Hämtar {len(extra_urls)} extra sidor parallellt", {"urls": extra_urls})

        extra_results = await _fetch_parallel(*[_scrape_single_page(u, log) for u in extra_urls])
        for result in extra_results:
            if result is not None and not isinstance(result, Exception):
                extra_pages.append(result)

        if log:
            log.add("fetch", f"Extra sidor hämtade: {len(extra_pages)} av {len(extra_urls)} OK")
    else:
        if log:
            log.add("discovery", "Inga extra sidor hittades att hämta")

    # 5. Main page data
    main_body_text = _clean_body_text(soup)
    main_phones = _extract_phones(main_body_text)
    main_addresses = _extract_addresses(main_body_text)
    main_cities = _extract_cities(main_body_text)

    main_schema_scripts = []
    for script in soup.find_all("script", type="application/ld+json"):
        text = script.string or ""
        if text.strip():
            main_schema_scripts.append(text.strip()[:1500])

    has_local, has_restaurant = _detect_schema_types(main_schema_scripts)

    meta_robots = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
    robots_meta_content = meta_robots.get("content", "").lower() if meta_robots else None

    h1_tags = [t.get_text(strip=True) for t in soup.find_all("h1")]
    h2_tags = [t.get_text(strip=True) for t in soup.find_all("h2")]

    if log:
        log.add("extract", "Extraherat från förstasidan", {
            "title": soup.find("title").get_text(strip=True) if soup.find("title") else "",
            "h1": h1_tags[0] if h1_tags else "",
            "h2_count": len(h2_tags),
            "phones_found": len(main_phones),
            "cities_found": len(main_cities),
            "has_localbusiness": has_local,
            "has_restaurant": has_restaurant,
        })

    return {
        "url": base_url,
        "title": soup.find("title").get_text(strip=True) if soup.find("title") else "",
        "meta_description": _get_meta_content(soup, "description"),
        "robots_meta": robots_meta_content,
        "h1": h1_tags[0] if h1_tags else "",
        "h2s": h2_tags,
        "body_text": main_body_text,
        "schema_scripts": main_schema_scripts,
        "has_local_business_schema": has_local,
        "has_restaurant_schema": has_restaurant,
        "nap_hints": {
            "phones": list(dict.fromkeys(main_phones)),
            "addresses": list(dict.fromkeys(main_addresses)),
            "cities": list(dict.fromkeys(main_cities)),
        },
        "robots_txt": robots_data.get("raw", "") if robots_data.get("exists") else None,
        "sitemap_xml": sitemap_data.get("url", "") if sitemap_data.get("exists") else None,
        "llms_txt": llms_data.get("content", "") if llms_data.get("exists") else None,
        "sitemap_url_count": sitemap_data.get("url_count", 0) if sitemap_data.get("exists") else None,
        "extra_pages": extra_pages,
    }


PHONE_RE = re.compile(
    r"(?:\+46|0)\s?[0-9]{1,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}",
    re.VERBOSE,
)

ADDRESS_RE = re.compile(
    r"\b[A-ZÅÄÖ][a-zåäö]+\s+(?:gata|väg|gränd|torg|plats)\s+\d+",
    re.IGNORECASE,
)

CITIES_RE = re.compile(
    r"\b(?:Stockholm|Göteborg|Malmö|Uppsala|Linköping|Örebro|Västerås|Norrköping|Helsingborg|Jönköping|Umeå|Lund)\b"
)


def _extract_phones(text: str) -> list:
    return PHONE_RE.findall(text)[:10]


def _extract_addresses(text: str) -> list:
    return ADDRESS_RE.findall(text)[:10]


def _extract_cities(text: str) -> list:
    return CITIES_RE.findall(text)[:10]


async def _fetch_parallel(*coros):
    import asyncio
    results = await asyncio.gather(*coros, return_exceptions=True)
    cleaned = []
    for r in results:
        if isinstance(r, Exception):
            cleaned.append({})
        else:
            cleaned.append(r)
    return cleaned
