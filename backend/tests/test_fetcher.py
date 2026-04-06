import pytest
from api.scrapers.fetcher import fetch_page

@pytest.mark.asyncio
async def test_fetch_returns_page_data():
    data = await fetch_page("https://example.com")
    assert data["html"] is not None
    assert data["status_code"] == 200
    assert data["headers"] is not None
    assert data["url"] == "https://example.com"

@pytest.mark.asyncio
async def test_fetch_handles_bad_url():
    data = await fetch_page("https://this-domain-does-not-exist-xyzabc.com")
    assert data["error"] is not None
