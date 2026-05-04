# AI Search Scanner -- Status

**Last updated:** 2026-04-29

## Current State

Next.js 15 App Router monolith on PiPod (port 8010), publicly accessible at `https://analyze.pipod.net`. The enhanced scan is the primary flow — returns a **Zod-validated ScanResult with 37 checks** across 5 categories. Report rendering uses new Fas 3 components: `report/FreeReport` (29 free checks, locked premium) and `report/PremiumReport` (36 checks, all unlocked). The UI flow is `page.tsx → AppShell → useAnalysis → report components`.

**Implementation plan progress:**
- Fas 1 (Schema + data): 1.1 (Zod schema) + 1.10 (poängberäkning) — committed. Remaining 1.2–1.9, 1.11–1.14 not started.
- Fas 2 (AI + assembly): 2.1 (checkBuilder) — done. Remaining 2.2–2.8 not started.
- Fas 3 (Report UI): All 4 steps done (3.1 shared components, 3.2 FreeReport, 3.3 PremiumReport, 3.4 integration). Automated tests PASS. Visual verification pending.
- Fas 4 (Leveranskedja): Not started. Plan reformatted with MANDATORY-TESTS format.

## What Works Today

- Enhanced scan (`POST /api/enhanced-scan`): scrapes URL + sub-pages, 3× Gemini Flash + 1× Gemini Pro + Tavily directories + GPT-4o-mini AI mention → 37 typed checks + scores
- ScanResult Zod schema with CHECK_REGISTRY (37 checks), calculateScores() (weighted free/full)
- checkBuilder.ts: buildCheckResults() maps all raw data → 37 CheckResult objects
- Report components: ScoreCircle, CheckBadge, PriorityCard, SolutionCard, LockedSection, CheckTable, Glossary
- FreeReport: 10 sections, 29 free checks with badges, locked premium sections with blur + CTA
- PremiumReport: 10 sections, 36 checks, all solutions unlocked with anchor links
- AppShell: idle→scanning→done→error states, dev-toggle (development only)
- useAnalysis: returns both enhancedReport (legacy) and scanResult (ScanResult type)
- Google Places API: 2-batch review dedup (relevance + newest sort)
- Directory checker: Tavily API (Eniro, Hitta) + NAP consistency
- AI mention checker: GPT-4o-mini two-step (entity + category query)
- Cloudflare Tunnel: `analyze.pipod.net` → nginx → port 8010
- systemd service: `ai-scanner-api.service`

## What's Missing or Broken

- **Visual verification pending** — Fas 3 report components pass all automated tests but haven't been visually verified in browser
- **Fas 1 incomplete** — steps 1.2–1.9, 1.11–1.14 (scraper improvements, minor fixes) not implemented
- **Fas 2 incomplete** — steps 2.2–2.8 (prompt refactoring, synthesis, assembly) not implemented
- **Fas 4 not started** — email, persistence, PDF, premium page, payment, review tool
- **No lead capture** — no email form, no CTA that collects contact info
- **No rate limiting** on Next.js API routes
- **Cache is in-memory** — loses all cache on restart
- **No tests** for Next.js API routes or lib functions
- **.env with API keys** not properly gitignored

## Next 3 Tasks

1. **Visual verification of Fas 3** — Open https://analyze.pipod.net, run scan, verify FreeReport + PremiumReport render correctly (27 visual PASS-points across 3.2, 3.3, 3.4)
2. **Complete Fas 1** — Implement remaining scraper improvements (1.2–1.9) and minor fixes (1.11–1.14)
3. **Complete Fas 2** — Prompt refactoring (2.2–2.4), synthesis (2.5), AI mention (2.6), öppettider (2.7), assembly (2.8)
