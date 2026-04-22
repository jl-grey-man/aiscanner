from bs4 import BeautifulSoup

def check_meta(soup: BeautifulSoup, headers: dict) -> dict:
    title = soup.find("title")
    desc = soup.find("meta", attrs={"name": "description"})
    html_tag = soup.find("html")
    last_modified = headers.get("last-modified", "")

    h1 = [t.get_text(strip=True) for t in soup.find_all("h1")]
    h2 = [t.get_text(strip=True) for t in soup.find_all("h2")]
    h3 = [t.get_text(strip=True) for t in soup.find_all("h3")]

    og_title = soup.find("meta", attrs={"property": "og:title"})
    og_desc = soup.find("meta", attrs={"property": "og:description"})

    return {
        "title": title.get_text(strip=True) if title else "",
        "title_length": len(title.get_text(strip=True)) if title else 0,
        "description": desc["content"] if desc and desc.get("content") else "",
        "description_length": len(desc["content"]) if desc and desc.get("content") else 0,
        "lang": html_tag.get("lang", "") if html_tag else "",
        "og_title": og_title["content"] if og_title and og_title.get("content") else "",
        "og_description": og_desc["content"] if og_desc and og_desc.get("content") else "",
        "h1": h1,
        "h2": h2,
        "h3": h3,
        "last_modified": last_modified,
    }
