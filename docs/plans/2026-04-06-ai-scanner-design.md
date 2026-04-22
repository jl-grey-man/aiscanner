# AI Search Scanner — Design Doc

## What

A web tool where companies enter their URL and get a live, detailed report on how well their site is optimized for AI search engines (GEO/AEO). Report is in Swedish, written clearly for non-technical readers. Ends with a CTA: fix it yourself or hire us.

## Stack

- **Backend:** FastAPI (Python) + httpx + BeautifulSoup
- **AI:** Claude API (Haiku for fast checks, Sonnet for analysis) — no Opus
- **Frontend:** React + Vite + Tailwind CSS
- **Streaming:** Server-Sent Events (SSE)
- **Hosting:** PiPod, nginx reverse proxy

## User Flow

```
Landing page → enter URL → click "Skanna"
→ loading state with progress
→ report cards stream in one by one (SSE)
→ summary score at top (updates live)
→ CTA section at bottom
```

## Analysis Points (10)

| # | Check | What we look for |
|---|-------|-----------------|
| 1 | `llms.txt` | Exists? Valid format? |
| 2 | `robots.txt` | Allows GPTBot, ClaudeBot, PerplexityBot? |
| 3 | Schema markup | Article, FAQ, Organization, Product |
| 4 | Heading hierarchy | H1→H2→H3 logical structure |
| 5 | Meta tags | Title + description quality and length |
| 6 | Content freshness | Last-Modified header, dates in content |
| 7 | Entity clarity | Is the company/product clearly described? |
| 8 | FAQ sections | Exist? Well-structured? |
| 9 | HTTPS | Valid certificate? |
| 10 | Language declaration | `<html lang="">` present and correct? |

## Report Card Format

Each card has:
- **Status:** 🟢 Bra / 🟡 Kan förbättras / 🔴 Saknas eller fel
- **Title:** e.g. "AI-crawler åtkomst"
- **Finding:** What we found (1-2 sentences)
- **Fix:** Exact steps to fix it (code snippets where relevant)

## API Design

### `POST /api/analyze`

**Request:**
```json
{ "url": "https://example.com" }
```

**Response:** SSE stream
```
event: card
data: { "id": 1, "title": "...", "status": "good|warning|bad", "finding": "...", "fix": "..." }

event: card
data: { "id": 2, ... }

event: summary
data: { "score": 72, "good": 5, "warning": 3, "bad": 2 }

event: done
data: {}
```

## Backend Architecture

```
api/
  main.py          — FastAPI app, CORS, routes
  analyzer.py      — orchestrates the full scan
  scrapers/
    fetcher.py     — httpx fetch + parse HTML
    robots.py      — parse robots.txt
    llms_txt.py    — check llms.txt
    schema.py      — extract structured data
    meta.py        — meta tags, lang, headings
  ai/
    client.py      — Claude API wrapper
    prompts.py     — prompt templates per check
```

## Frontend Architecture

```
src/
  App.tsx
  pages/
    Landing.tsx    — hero + URL input
    Report.tsx     — live report view
  components/
    UrlInput.tsx   — input + submit button
    ReportCard.tsx — single analysis card
    ScoreBadge.tsx — overall score display
    CTA.tsx        — bottom call-to-action
    Progress.tsx   — scanning progress indicator
  hooks/
    useAnalysis.ts — SSE hook, manages stream state
  lib/
    api.ts         — API client
```

## Visual Direction

- **Vibe:** Modern startup — smart, confident, approachable
- **NOT:** Corporate, security firm, enterprise SaaS
- **Colors:** Dark base (near-black or deep navy) + accent color (electric blue or green)
- **Typography:** Clean sans-serif, generous whitespace
- **Cards:** Subtle glassmorphism or soft shadows, rounded corners
- **Animations:** Cards slide/fade in as SSE delivers them
- **Overall feel:** "A tool built by people who actually understand AI" — not a generic SEO dashboard

## Page Layout

### Landing
- Minimal hero: bold headline, 1-line subtitle
- Large URL input field, centered
- "Skanna din sida" button
- Below: 3-4 trust signals (what we check, no fluff)

### Report
- Sticky top: overall score (updates live)
- Cards stack vertically, animate in
- Each card expandable for detailed fix instructions
- Bottom: CTA section with two paths

### CTA Section
- Left: "Fixa det själv" — links to guide/resources
- Right: "Vi fixar det åt dig" — contact form or booking link

## Claude API Usage

- **Haiku:** robots.txt parsing, meta tag evaluation, structural checks (cheap, fast)
- **Sonnet:** Entity clarity analysis, content quality assessment, writing fix recommendations in Swedish (needs better reasoning)
- All prompts in Swedish, instructed to write clearly without jargon

## Rate Limiting

- Max 3 scans per IP per hour (no auth for now)
- Queue system if needed later

## Future (not MVP)

- PDF report export
- Email report
- Historical tracking (rescan)
- English language support
- Auth + saved reports
