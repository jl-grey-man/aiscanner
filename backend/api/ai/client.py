import os
from openai import OpenAI

_client = None

FAST_MODEL = "google/gemini-2.0-flash-001"
ANALYSIS_MODEL = "google/gemini-2.5-flash-preview"
PRO_MODEL = "google/gemini-2.5-pro-preview-03-25"


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


async def ask_pro(prompt: str) -> dict:
    """Use for premium analysis. Returns parsed JSON."""
    client = get_client()
    response = client.chat.completions.create(
        model=PRO_MODEL,
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    text = response.choices[0].message.content
    return _extract_json(text)


def _extract_json(text: str) -> dict:
    """Extract and parse JSON from text, handling truncated responses."""
    import json
    import re
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Truncate to last complete key-value pair before the error
    # Find the last position where we have a complete string value or object/array close
    # Strategy: progressively remove trailing partial content
    for cutoff in range(len(text) - 1, 0, -1):
        candidate = text[:cutoff]
        # Close any open string
        if candidate.count('"') % 2 != 0:
            # Find last unescaped quote
            last_q = candidate.rfind('"')
            if last_q >= 0:
                # Check if it's escaped
                escapes = 0
                p = last_q - 1
                while p >= 0 and candidate[p] == '\\':
                    escapes += 1
                    p -= 1
                if escapes % 2 == 0:  # unescaped quote, string is open
                    candidate = candidate[:last_q] + '"'
        # Close brackets
        open_braces = candidate.count('{') - candidate.count('}')
        open_brackets = candidate.count('[') - candidate.count(']')
        for _ in range(open_brackets):
            candidate += ']'
        for _ in range(open_braces):
            candidate += '}'
        # Remove trailing comma before closing brace
        candidate = re.sub(r',(\s*[}\]])', r'\1', candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise json.JSONDecodeError("Could not repair truncated JSON", text, 0)


async def ask_flash_json(prompt: str) -> dict:
    """Use for free analysis. Returns parsed JSON."""
    client = get_client()
    response = client.chat.completions.create(
        model=FAST_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    text = response.choices[0].message.content
    return _extract_json(text)
