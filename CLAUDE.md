AI Search Scanner — Swedish-language tool that analyzes how well a website is optimized for AI search engines (ChatGPT, Perplexity, Google AI Overview).

## Project Documentation

This project uses multiple documents for different purposes. As an AI assistant, you should know where to look:

| Document | Path | Purpose | When to read it |
|----------|------|---------|-----------------|
| **CLAUDE.md** | `./CLAUDE.md` | Agent instructions — stack, architecture, commands, coding rules | Always read first when starting work on this project |
| **GSD PROJECT.md** | `.planning/PROJECT.md` | Living project context — vision, core value, requirements (Validated/Active/Out of Scope), key decisions, constraints | Read when planning features, scoping work, or making architectural decisions |
| **GSD REQUIREMENTS.md** | `.planning/REQUIREMENTS.md` | Checkable requirements with IDs — v1 (committed), v2 (deferred), traceability matrix | Read before implementing a feature to see if it's already defined |
| **GSD ROADMAP.md** | `.planning/ROADMAP.md` | Phased execution plan — what's been done, what's next, plan structure | Read when picking up work to understand what phase/plan to execute |
| **GSD STATE.md** | `.planning/STATE.md` | Current project state — active phase, blockers, next action | Read to understand what's happening right now |
| **GSD config** | `.planning/config.json` | GSD workflow settings — model profile, parallelization, verifier, etc. | Read if you need to understand GSD tooling behavior |
| **Design doc (legacy)** | `docs/plans/2026-04-06-ai-scanner-design.md` | Original design document from project inception — outdated but has historical context | Only read for historical context; prefer PROJECT.md |
| **Analysis doc** | `docs/analys-2026-04.md` | April 2026 analysis — critical gaps, market research, pricing, sales strategy | Read when considering new checks/features or business direction |

**Rule:** If a user asks you to build something, check `REQUIREMENTS.md` first to see if it's already defined. If you need to understand the "why", read `PROJECT.md`. If you need to know what's next, read `ROADMAP.md`.

## Stack

- **Backend:** Python 3 + FastAPI + uvicorn (port 8010)
- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind 3
- **AI:** OpenRouter API — Gemini 2.0 Flash (fast checks), Gemini 2.5 Flash (analysis)
- **Scraping:** httpx + BeautifulSoup + lxml
- **Deploy:** systemd + nginx on PiPod (Raspberry Pi 5)

## Architecture

```
backend/
  main.py                  # FastAPI app, CORS, POST /api/analyze (SSE)
  api/
    analyzer.py            # Orchestrator — runs 16 checks sequentially, streams results
    rate_limiter.py        # 3 scans/IP/hour (in-memory dict)
    ai/
      client.py            # ask_haiku() / ask_sonnet() via OpenRouter (Gemini Flash)
      prompts.py           # Swedish system prompts
    scrapers/
      fetcher.py           # httpx fetch + BeautifulSoup parse
      meta.py              # title, description, lang, og tags, headings
      robots.py            # robots.txt AI bot access
      llms_txt.py          # /llms.txt existence check
      schema.py            # JSON-LD structured data extraction
      trustpilot.py        # Trustpilot profile & reviews
      wikipedia.py         # Wikipedia article presence
      social.py            # Social profile link extraction
      business_type.py     # Local vs national business detection
      google_places.py     # Google Business Profile via Places API
      sitemap.py           # sitemap.xml check
  tests/                   # pytest tests for API and scrapers

frontend/
  src/
    App.tsx                # Hero + URL input always visible, Report below
    types.ts               # CardStatus, ReportCard, Summary types
    pages/
      Report.tsx           # Live report: score, progress, cards, CTA
    components/
      UrlInput.tsx         # URL form with validation
      ScoreBadge.tsx       # Color-coded 0–100 score
      ReportCard.tsx       # Expandable card (finding/details/why/impact/fix)
      Progress.tsx         # Status box with animated activity log
      CTA.tsx              # "Fixa det själv" / "Vi fixar det åt dig"
      SeoSplit.tsx         # SEO vs AI illustration
      SeoFlow.tsx          # Flow diagram component
    hooks/
      useAnalysis.ts       # SSE stream parser, throttled card display (1.4s/card)

deploy/
  ai-scanner-api.service   # systemd unit (user=jens, port 8010)
  nginx-aiscanner.conf     # /aiscanner/ → frontend dist, /api/ → backend
```

## Key patterns

- **SSE streaming** — backend yields `event: progress` / `event: card` / `event: summary` / `event: done`; frontend throttles card display to ~1.4s per card for dramatic effect
- **16 sequential checks** — HTTPS, language, robots.txt+meta, llms.txt, meta tags, headings, schema, freshness, entity clarity (AI), FAQ, Trustpilot, Wikipedia, social, local presence, sitemap, E-A-T
- **Cards prepend** — new report cards are inserted at the top of the list so users see new activity immediately
- **Score formula** — `(good×10 + warning×5) / (total×10) × 100`
- **Rate limiting** — in-memory dict, 3 requests/IP/hour, resets on restart
- **All UI text is Swedish** — non-technical language, aimed at business owners
- **SPA routing** — nginx `try_files` falls back to `/aiscanner/index.html`

## Coding rules

- Backend: async Python, type hints, Swedish strings for user-facing text
- Frontend: functional React, single `useState` per concern, Tailwind utility classes
- No state management library — local state + props only
- Components are self-contained with inline Tailwind styling
- Color tokens defined in `tailwind.config.js` (`accent`, `surface`, `muted`, etc.)

## Commands

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8010 --reload   # dev
pytest                                                     # tests
```

### Frontend
```bash
cd frontend
npm run dev          # dev server (localhost:5173, proxies /api to 8010)
npm run build        # production build → dist/
npm run lint         # eslint check
```

### Deploy
```bash
# Install systemd service
sudo cp deploy/ai-scanner-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ai-scanner-api

# Add nginx locations (inside existing server block)
# See deploy/nginx-aiscanner.conf

# Build frontend for production
cd frontend && npm run build
```

### URLs
- **Frontend:** https://analyze.pipod.net
- **API:** https://analyze.pipod.net/api/analyze (POST, SSE response)
- **Local:** http://100.72.180.20/aiscanner/ (Tailscale, legacy path)

## Environment

- `.env` at project root — contains `OPENROUTER_API_KEY`
- Backend loads via `python-dotenv`
- Vite dev server proxies `/api` → `http://localhost:8010`
- Production: nginx proxies `/api/` → `http://127.0.0.1:8010`

## Port

- **8010** — AI Scanner API (registered in PiPod port registry)
