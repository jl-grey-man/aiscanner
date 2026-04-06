import pytest
from bs4 import BeautifulSoup
from api.scrapers.robots import check_robots
from api.scrapers.llms_txt import check_llms_txt
from api.scrapers.meta import check_meta
from api.scrapers.schema import check_schema

@pytest.mark.asyncio
async def test_robots_blocks_bots():
    result = await check_robots("https://example.com")
    assert "allowed" in result
    assert "blocked_bots" in result
    assert isinstance(result["blocked_bots"], list)

@pytest.mark.asyncio
async def test_llms_txt_missing():
    result = await check_llms_txt("https://example.com")
    assert "exists" in result

def test_meta_extracts_title():
    html = "<html lang='sv'><head><title>Test</title><meta name='description' content='Hej'></head><body><h1>Rubrik</h1></body></html>"
    soup = BeautifulSoup(html, "lxml")
    result = check_meta(soup, {})
    assert result["title"] == "Test"
    assert result["lang"] == "sv"
    assert len(result["h1"]) == 1

def test_schema_finds_faq():
    html = '''<html><head><script type="application/ld+json">{"@type":"FAQPage"}</script></head></html>'''
    soup = BeautifulSoup(html, "lxml")
    result = check_schema(soup)
    assert "FAQPage" in result["types"]
