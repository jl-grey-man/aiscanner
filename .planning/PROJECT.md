# AI Search Scanner

## What This Is

A Swedish-language web tool where business owners enter their website URL (and optionally city) and receive a detailed AI-powered report on how well their site is optimized for AI search engines (ChatGPT, Perplexity, Google AI Overview). The report is written in plain Swedish for non-technical readers and ends with a prioritized action plan. The stack is Next.js 15 App Router, deployed on PiPod at analyze.pipod.net.

## Core Value

A Swedish business owner can enter their URL, wait ~90 seconds, and understand exactly what they need to do to be found by AI search engines — in language they understand, with concrete actions they can take.

## Requirements

### Validated

- ✓ Next.js 15 App Router monolith, TypeScript, standalone output — deployed on PiPod port 8010
- ✓ Enhanced scan (`/api/enhanced-scan`): 3× Gemini Flash parallel (technical, FAQ, E-A-T) + Gemini Pro synthesis
- ✓ Enhanced scraper: robots.txt, OG tags, FAQ schema, sitemap, E-A-T signals, canonical, Google Maps detection
- ✓ Google Places: 2-batch review fetch (up to 10 merged reviews), review reply analysis
- ✓ Directory checker: Tavily-powered NAP check against Eniro + Hitta
- ✓ AI mention checker: GPT-4o-mini two-step (entity query → niche extraction → category query)
- ✓ EnhancedReport component: status badges + synthesis markdown action plan
- ✓ Cloudflare Tunnel: analyze.pipod.net → nginx → port 8010
- ✓ In-memory result cache (24h TTL)
- ✓ Swedish UI, dark theme (bg-zinc-950), mobile responsive

### Active

- [ ] Lead capture: email gate — summary free, full synthesis behind email submission
- [ ] Rate limiting on /api/enhanced-scan (3 scans/IP/hour)
- [ ] Dev toggle removed from production (env-gated or deleted)
- [ ] API keys moved to .env.local; .env added to .gitignore
- [ ] nginx config: proxy all traffic to port 8010 (remove dead frontend/dist alias)
- [ ] App SEO: proper `<title>` and `<meta description>` for the scanner page itself
- [ ] Dead code removed: backend/ (Python FastAPI) and frontend/ (Vite/React)

### Out of Scope

- Real-time continuous monitoring — manual scan only for v1
- Multi-language reports — Swedish-only by design
- PDF export of reports — deferred to v2
- User accounts / login — no auth system for v1
- Payment processing (Stripe) — manual invoicing, deferred to v2
- Mobile native app — web-only
- Core Web Vitals check — requires browser rendering, not viable with current scraper

## Context

- Target market: ~550,000 Swedish SMEs, ~85% have websites, <5% optimized for AI search
- Best target: local service businesses (dentists, electricians, lawyers, restaurants, salons)
- No established Swedish competitor in AI-specific search optimization
- AI search shift: AI answers directly instead of linking — not visible as source = invisible
- Google AI Overviews launched in Sweden October 2024 (~15–20% of searches)
- ChatGPT Search launched October 2024 (200M+ active users)
- Stack migrated from FastAPI + React (Vite) → Next.js 15 in April 2026

## Constraints

- **Tech stack**: Next.js 15 App Router — locked, fully deployed
- **AI APIs**: OpenRouter (Gemini Flash/Pro) + GPT-4o-mini via OpenRouter for AI mention testing
- **Directory API**: Tavily — Eniro/Hitta block scrapers, API is the only reliable path
- **Hosting**: PiPod (Raspberry Pi 5) — limited compute, single-node
- **Language**: Swedish UI only — market decision
- **Budget**: No paid infrastructure beyond API costs (OpenRouter, Tavily, Google Places)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Swedish-only UI | Target market is Swedish SMEs who need clarity in their language | ✓ Good — differentiates from competitors |
| Next.js migration from FastAPI+React | One codebase, simpler deployment, TypeScript everywhere | ✓ Good — cleaner architecture |
| OpenRouter instead of direct Gemini API | Cost flexibility, model switching without code changes | ✓ Good — enabled Flash→Pro upgrade path |
| Tavily for directory checks | Eniro/Hitta block scrapers — API is the only reliable path | ✓ Good — works reliably |
| Enhanced scan as primary (no free/premium gate yet) | Deliver full value immediately; gate content behind email | — Pending — lead capture not yet implemented |
| No user accounts for v1 | Simpler architecture, faster to market | ⚠️ Revisit — limits monetization options |
| GPT-4o-mini for AI mention testing | Reliable entity knowledge, separate from main Gemini pipeline | — Pending — adds OpenAI dependency |
| PiPod self-hosting | No hosting costs, full control | ✓ Good — handles current load |

---
*Last updated: 2026-04-27 — full rewrite to reflect Next.js stack and enhanced scan architecture*
