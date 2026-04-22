# AI Search Scanner

## What This Is

A Swedish-language web tool where business owners enter their website URL and receive a live, detailed report on how well their site is optimized for AI search engines (ChatGPT, Perplexity, Google AI Overview). The report is written in plain Swedish for non-technical readers and ends with a CTA to fix issues themselves or hire the service.

## Core Value

A Swedish business owner can enter their URL, wait ~30 seconds, and understand exactly what they need to do to be found by AI search engines — in language they understand, with concrete actions they can take.

## Requirements

### Validated

- ✓ SSE streaming from FastAPI backend → React frontend (live report cards)
- ✓ 10 sequential checks: HTTPS, language, AI-crawler access, llms.txt, meta tags, heading structure, structured data, content freshness, entity clarity (AI), FAQ content
- ✓ Score formula: `(good×10 + warning×5) / (total×10) × 100`
- ✓ Rate limiting: 3 requests/IP/hour (in-memory)
- ✓ All UI text in Swedish, non-technical language
- ✓ Deployed on PiPod (Raspberry Pi 5) with nginx + systemd
- ✓ Google Places API integration for business verification
- ✓ Business type detection (local vs national)
- ✓ Cross-platform rating divergence detection
- ✓ Review theme analysis via AI

### Active

- [ ] Fix `_check_content_depth()` — missing function for national businesses
- [ ] Add sitemap.xml check
- [ ] Add robots meta-tag check (`<meta name="robots">`)
- [ ] Add NAP consistency check (Name/Address/Phone vs Google Business Profile)
- [ ] Add E-A-T basics check (About page, contact info, named authors)
- [ ] Schema validation (correctness, not just existence)
- [ ] Core Web Vitals / page speed
- [ ] Internal link structure analysis
- [ ] Local directory presence (Eniro, Gulasidor, Hitta.se)
- [ ] Content freshness cycle (regularity, not just dates)

### Out of Scope

- Real-time continuous monitoring (deferred — manual scan only for now)
- Multi-language reports (Swedish only)
- PDF export of reports
- User accounts / login (no auth system)
- Payment processing (manual invoicing for agency plans)
- Mobile native app (web-only)

## Context

- Target market: ~550,000 Swedish SMEs, ~85% have websites, <5% optimized for AI search
- Best target segment: local service businesses (dentists, electricians, lawyers, restaurants, salons)
- No established Swedish competitor in AI-specific search optimization
- Semrush/Ahrefs don't focus on AI signals
- AI search shift: AI answers directly instead of linking. Not visible as source = invisible.
- Google AI Overviews launched globally May 2024, Swedish October 2024 (~15-20% of searches)
- ChatGPT Search launched October 2024 (200M+ active users)
- Perplexity: 100M+ monthly users, "Deep Research" mode
- LLMs.txt standard emerged mid-2024, supported by Anthropic, OpenAI, Perplexity

## Constraints

- **Tech stack:** FastAPI + React 19 + Vite — locked, already built
- **AI API:** OpenRouter (Gemini Flash) — budget constraint, Haiku/Sonnet equivalent
- **Hosting:** PiPod (Raspberry Pi 5) — limited compute, single-node
- **Language:** Swedish UI only — market decision
- **Budget:** No paid infrastructure beyond OpenRouter API calls

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Swedish-only UI | Target market is Swedish SMEs who need clarity, not English | ✓ Good — differentiates from competitors |
| SSE streaming | Live progress builds trust and engagement | ✓ Good — feels fast even when analysis takes time |
| OpenRouter instead of direct Claude API | Cost flexibility, model switching without code changes | — Pending |
| PiPod self-hosting | No hosting costs, full control | ✓ Good — works for current load |
| No user accounts | Simpler architecture, faster to market | ⚠️ Revisit — limits monetization options |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after GSD initialization*
