import os
from openai import OpenAI

_client = None

FAST_MODEL = "google/gemini-2.0-flash-001"
ANALYSIS_MODEL = "google/gemini-2.5-flash-preview"


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
    return _client


async def ask_haiku(prompt: str) -> str:
    """Use for fast, cheap checks."""
    client = get_client()
    response = client.chat.completions.create(
        model=FAST_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content


async def ask_sonnet(prompt: str) -> str:
    """Use for analysis requiring reasoning."""
    client = get_client()
    response = client.chat.completions.create(
        model=ANALYSIS_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content
