# AI Search Scanner -- Checklist

## Core Features

### Scanning & Analysis
- [x] URL input with validation
- [x] Web scraping: main page HTML, title, meta, H1, H2, body text, schema scripts
- [x] Multi-page scraping: up to 4 sub-pages (contact, about, services, booking, location)
- [x] Smart page selection: sitemap-based or internal link fallback
- [x] Swedish page preference over English equivalents
- [x] robots.txt existence check
- [x] sitemap.xml existence check (with URL count)
- [x] llms.txt existence check
- [x] JSON-LD schema detection — full type parsing, @type extracted per item
- [x] Schema.org type hierarchy — LocalBusiness subtypes (Plumber, RealEstateAgent, Restaurant etc.) correctly recognized (~60 types)
- [x] Canonical tag extraction (`<link rel="canonical">`)
- [x] Google Maps detection (Google-specific — not OpenStreetMap)
- [x] Schema type names passed to AI prompt (SCHEMA_TYPER, LOCALBUSINESS_SUBTYP, CANONICAL, GOOGLE_MAPS)
- [x] AI instructions: subtype = exists, don't recommend adding what's already there
- [x] Phone number extraction (Swedish format)
- [x] City/location extraction (12 major Swedish cities)
- [x] Contact info detection (phone, email, contact keywords)
- [x] Menu/pricing detection for restaurants
- [x] AI analysis via Gemini Flash (23 checks across 4 phases) — legacy
- [x] AI model fallback chain (Flash -> Flash Lite -> Mistral Small) — legacy
- [x] Robust JSON extraction from AI responses (code blocks, bracket matching, greedy)
- [x] Phase-based report: Technical, Local, AI-readiness, Content — legacy
- [x] ensurePhases() fallback when AI omits phase data — legacy
- [x] Score calculation (0-100)
- [x] Category scores (4 categories, 0-10 each)
- [x] Critical issues list with severity
- [x] Quick wins list

### Enhanced Scan (primary — 37 checks)
- [x] ScanResult Zod schema — 37 CheckKeys, CheckResult type, CHECK_REGISTRY (Fas 1.1)
- [x] calculateScores() — weighted scoring → scores.free (29 checks) + scores.full (36 checks) (Fas 1.10)
- [x] checkBuilder.ts — buildCheckResults() maps all raw scan data to 37 typed CheckResult objects (Fas 2.1)
- [x] Enhanced scan returns validated ScanResult with 37 checks + scores
- [x] 3× Gemini Flash parallel: technical, FAQ, E-A-T
- [x] 1× Gemini Pro synthesis — structured action plan
- [x] AI mention checker — GPT-4o-mini two-step (entity + category query)
- [x] Tavily directory checker (Eniro, Hitta) + NAP consistency
- [x] Review reply analysis with sample note
- [x] Report Writer — 3-4 parallel Pro batches enriching bad/warning checks with rich content
- [x] checkExplanations.ts — hardcoded "Vad är detta?" texts for all check keys
- [x] richRelevance/richSteps/richCodeExample fields in CheckResult schema
- [x] Report Writer runs parallel with Pro synthesis (zero extra latency)

### Premium / Full Scan
- [x] Google Places API integration (Text Search + Place Details)
- [x] Domain match validation for Places results
- [x] Review extraction (up to 10 reviews)
- [x] City hint from free scan passed to Places search
- [x] Premium AI analysis via Gemini 2.5 Pro
- [x] Pro model fallback chain (Pro -> Claude 3.5 Sonnet -> Gemini 2.0 Pro)
- [x] NAP consistency comparison (website vs Google)
- [x] GBP analysis (strengths/weaknesses)
- [x] Review analysis (sentiment, keywords, divergence warning)
- [x] Competitor comparison (2-3 suggested competitors)
- [x] Tailored fixes ranked by priority and expected impact

### Frontend (legacy — EnhancedReport)
- [x] Hero page with tagline and URL input
- [x] Animated progress indicator with step messages
- [x] Simulated progress (creeping 88% -> 99% while waiting for AI)
- [x] Free report: dark summary box with score, category breakdown, good/warning/bad counts
- [x] Phase-by-phase detailed analysis with progress bars
- [x] Check rows sorted by severity (bad first, good last)
- [x] What/Why explanations for each check
- [x] Fix suggestions for warning/bad checks
- [x] Critical issues section with severity badges
- [x] Quick wins section
- [x] Code examples in monospace blocks
- [x] Full Scan button (appears after free scan)
- [x] Premium report: NAP comparison, GBP analysis, reviews, competitors, action plan
- [x] Reset/scan-again button
- [x] SEO illustration section ("Sökmotorernas spelregler har förändrats")
- [x] Responsive layout (mobile + desktop)
- [x] Error display for failed scans

### Frontend (Fas 3 — report components)
- [x] AppShell — client shell: idle→scanning→done→error states, dev-toggle free/premium
- [x] page.tsx simplified to `<AppShell />`
- [x] useAnalysis returns ScanResult alongside enhancedReport
- [x] ScoreCircle — SVG donut, color-coded by threshold
- [x] CheckBadge — OK/FEL/~/—/N/A inline badges
- [x] PriorityCard — action plan item with priority-colored left border + anchor links
- [x] SolutionCard — 4-block layout (explanation, relevance, steps, code + copy button)
- [x] LockedSection — blur overlay with lock icon + CTA
- [x] CheckTable — check table filtered by category, sorted by severity
- [x] Glossary — 14-term Swedish glossary in collapsible details
- [x] FreeReport (report/) — 10 sections, 29 free checks, locked premium sections with CTA
- [x] PremiumReport (report/) — 10 sections, 36 checks, all solutions unlocked
- [x] RichMarkdown — shared markdown-to-HTML renderer (extracted from PremiumReport)
- [ ] Visual verification: FreeReport renders correctly (visuell check ej gjord)
- [ ] Visual verification: PremiumReport renders correctly (visuell check ej gjord)
- [ ] Visual verification: End-to-end scan → report flow (visuell check ej gjord)

### Infrastructure
- [x] Next.js 15 App Router with standalone output
- [x] systemd service (ai-scanner-api.service, port 8010)
- [x] Cloudflare Tunnel (analyze.pipod.net -> nginx -> 8010)
- [x] nginx config for analyze.pipod.net
- [x] In-memory cache for scan results (24h TTL, stub Redis)
- [x] OpenRouter API integration (not direct Gemini)
- [x] Google Places API (New) integration
- [x] CORS headers for API routes

---

## Lead Capture (PRIORITY -- none exists)

- [ ] Email capture form after free scan (gate detailed report behind email)
- [ ] Email storage backend (JSON file, SQLite, or simple API)
- [ ] "Get full report" CTA that requires email before showing phase details
- [ ] Basic email validation (format check)
- [ ] Thank-you / confirmation after email submission
- [ ] Email list export capability (CSV or similar)
- [ ] Privacy notice / GDPR compliance text on email form

---

## Polish / Launch Prep

- [ ] Remove dev toggle from production (env-gate or delete)
- [ ] Add rate limiting to Next.js API routes (3 scans/IP/hour)
- [ ] Move .env API keys to .env.local (and add .env to .gitignore)
- [ ] Update CLAUDE.md to reflect actual Next.js architecture
- [ ] Clean up or archive dead code (backend/, frontend/ directories)
- [ ] Fix nginx config for analyze.pipod.net (proxy everything to 8010, not alias to dead frontend/dist/)
- [ ] Add robots meta tag check to scraper (`<meta name="robots" content="noindex">` detection)
- [ ] Add Open Graph tag extraction to scraper
- [ ] SEO: add proper `<title>` and `<meta description>` to the app itself
- [ ] Favicon / branding on the scanner page
- [ ] Footer with contact/about info
- [ ] Loading state improvements (skeleton or better spinner for premium scan)
- [ ] Analytics (simple page view / scan count tracking)

---

## Fas 4: Leveranskedja (planerad — IMPLEMENTATION-PLAN.md)

- [ ] 4.1 Email: Gratis-rapport via email (send-report API route)
- [ ] 4.2 Persistens: Spara ScanResult till fil (storage.ts)
- [ ] 4.3 PDF-generering via Playwright
- [ ] 4.4 Premium webbsida med token-baserat inlogg (/report/[scanId])
- [ ] 4.5 Betalflöde (Stripe/Swish)
- [ ] 4.6 Review-verktyg för Jens (/admin/[scanId])

## Future / V2

- [ ] Proper Redis or persistent cache (survive restarts)
- [x] E-A-T dedicated check — included in enhanced scan (Flash #3: E-A-T analysis)
- [ ] Schema validation (correctness, not just existence)
- [ ] Core Web Vitals / page speed measurement
- [x] Internal link structure analysis — included in enhanced scan checks
- [x] Local directory presence check (Eniro, Hitta) — directoryChecker.ts via Tavily
- [ ] Content freshness cycle analysis (regularity, not just dates)
- [x] NAP consistency — included in enhanced scan (directoryChecker + Places API)
- [ ] SSE streaming for real-time progress (instead of simulated steps)
- [ ] User accounts / scan history
- [ ] Stripe payment integration (→ Fas 4.5)
- [ ] PDF report export (→ Fas 4.3)
- [ ] Email report delivery (→ Fas 4.1)
- [ ] Agency plan (multi-client dashboard)
- [x] Competitor comparison — included in Pro synthesis
- [ ] Content recommendations via AI
- [ ] Tests for Next.js API routes and lib functions
- [ ] Error tracking (Sentry or similar)
- [ ] Structured logging (beyond console.error)
