# AI Search Scanner -- Checklist

---

## Sessionshistorik (komprimerad — detaljer i CLAUDE.md)

- [x] Issue 1 (PSI-timeout 12s→30s) — löst, ej en riktig bugg (transient kvot), timeout ändå bumpad (commit `e2cbfe4`)
- [x] Issue 2 (eatSignals/faqSchema-kalibrering mot VERIFICATION-PROTOCOL.md) — commits `f98e3a9`, `db25529`; se CLAUDE.md "eatSignals/faqSchema-kalibrering"
- [x] Issue 3 (nationella kedjor utan stad → "ange stad"-flagga i stället för slumpmässigt kontor) — commits `5919ff6`, `4e4a8c8`; se CLAUDE.md "Flera kontor / ingen stad"
- [x] Issue 4a (roranalys competitors notMeasured — Places 400 på `includedPrimaryTypes`) — commits `c68a56c`, `0828caf`; se CLAUDE.md "Competitors check #36"
- [x] Issue 4b (bjurfors contactInfo false positive på bar-ordet "kontakt") — commit `2039604`; se CLAUDE.md "contactInfo (#30)"
- [x] Issue 4c (tvakanten hreflang false notApplicable — språkväljare utan hreflang-taggar) — commit `f6eb841`; se CLAUDE.md "hreflang (#9)"
- [x] Uppföljningar samma session: competitors-radie 1,5 km enforced (`8cfb91c`), `/sv/` borttagen ur språkväljar-mönstret (`8cfb91c`)
- [x] Staging-flöde dokumenterat + `deploy/pi-staging.sh` (`555af5b`, `9c7ac3f`); `next dev`/`next build` kan aldrig mer skriva över prod-bygget (`eb5c569`, `ccab807`)

---

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
- [x] Report Writer — batches of max 3 checks, concurrency 4, withRetry, Pro → Flash fallback, time budget (Audit #1)
- [x] checkExplanations.ts — hardcoded "Vad är detta?" texts for all check keys
- [x] richRelevance/richSteps/richCodeExample fields in CheckResult schema
- [x] richStatus ('pro' | 'flash' | 'missing') per bad/warning check — missing is always logged, never silent
- [x] ONE master schema (deterministic LocalBusiness JSON-LD from verified data) owned by the most relevant schema check; other schema checks get `codeRef` + delta only; similarity dedup safety net (Audit #7)
- [x] Faktaförankring: verifierade fakta (telefon, öppettider, kända URL:er, skrapat meny-/tjänsteinnehåll, FAQ-frågor) + förbud mot påhittade fakta i syntes- och Report Writer-prompterna; efterkontroll `groundReport()` rättar/tar bort påhittade öppettider, telefon, interna URL:er, menyrätter och priser och loggar `[FactCheck]` (Audit #6)
- [ ] Uppföljning Audit #6: FAQ-svar i fri text kan inte verifieras automatiskt — bara promptregeln skyddar; överväg att endast tillåta FAQPage-svar byggda på verifierade fakta
- [x] Report Writer runs parallel with Pro synthesis

### Premium / Full Scan
- [x] Google Places API integration (Text Search + Place Details)
- [x] Domain match validation for Places results
- [x] Review extraction (up to 10 reviews)
- [x] City hint from free scan passed to Places search
- [x] Google Places-villkoren (2026-09-14): inget Places-innehåll lagras — scan_cache v2 utan Places-data (färsk Place Details + Nearby vid paid-träff), lagrade premiumrapporter strippas (`stripPlacesContent`) och rehydreras vid läsning, scan_cache-städning, migrering av gamla rader
- [ ] Places-gråzon: AI-genererad text (richSteps, syntes, AI-test) kan innehålla adress/telefon/betyg från prompten — beslut om den ska strippas/regenereras (Jens)
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
- [x] `next dev` builds into `.next-dev/` — can never overwrite `.next/standalone` (sep 2026, `next.config.ts` `PHASE_DEVELOPMENT_SERVER`, regression test `tests/nextConfig.test.ts`)
- [x] Git-trädet förblir rent efter `next dev`/`next build`: `next-env.d.ts` gitignorerad, `tsconfig.json` i Next-format med `.next-dev/types` (sep 2026)
- [x] `deploy/pi-staging.sh` — test + build + restart + smoke-test staging in one gate before pushing to master (sep 2026)
- [x] Deploy-flöde dokumenterat i CLAUDE.md ("Staging på Pi:n / deploy-flöde", sep 2026)

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

- [x] Remove dev toggle from production — env-gated (`AppShell.tsx` `IS_DEV = NODE_ENV === 'development'`, auto-paid preview never runs in prod)
- [x] Rate limiting on API routes — `app/lib/rateLimit.ts`: 5 scans/10 min + 20/dag per IP, 60/timme globalt, checkout 10/10 min (in-app, not nginx-level 3/hour as originally sketched)
- [x] Move .env API keys to .env.local (and add .env to .gitignore) — `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`
- [x] Update CLAUDE.md to reflect actual Next.js architecture
- [ ] Clean up or archive dead code (backend/, frontend/ directories)
- [x] Fix nginx config for analyze.pipod.net — proxies to `127.0.0.1:8010`
- [ ] Add robots meta tag check to scraper (`<meta name="robots" content="noindex">` detection)
- [x] Open Graph tag extraction — `enhancedScraper.ts` (og:title/description/image)
- [x] SEO: proper `<title>` and `<meta description>` — `app/layout.tsx`
- [ ] Favicon / branding on the scanner page
- [x] Footer with contact/about info — `landing/Footer.tsx`, `app/om-oss`
- [ ] Loading state improvements (skeleton or better spinner for premium scan)
- [ ] Analytics (simple page view / scan count tracking)

---

## Fas 4: Leveranskedja

- [x] 4.2 Persistens — SQLite `data/checkouts.db` (`checkouts` + `scan_cache`), Places-innehåll strippat före lagring, rehydreras vid läsning (se CLAUDE.md "Google Places-villkoren")
- [x] 4.4 Premium-sida — `/report?session_id=`, gated på Stripe `payment_status` (ej det ursprungligen tänkta token-baserade `/report/[scanId]`)
- [x] 4.5 Betalflöde — Stripe (499 kr), asynkron finalize + statuspolling; ingen Swish
- [ ] 4.1 Email — gratis-rapport via e-post. Blockerad på ägarbeslut: vilken provider (Resend/Postmark/SES) + API-nyckel + avsändardomän-DNS (SPF/DKIM/DMARC), och om det ens är önskat för lead capture på gratisrapporten (Jens)
- [ ] 4.3 PDF-generering. Blockerad på ägarbeslut: är PDF fortfarande önskat nu när det finns en webbrapport (Jens)
- [ ] 4.6 Review-verktyg för Jens. Blockerad på ägarbeslut: vill Jens ha manuell granskning före leverans (ändrar dagens auto-leverans-flöde) + admin-autentisering (Jens)
- [ ] Riktigt end-to-end-köp i produktion (Stripe) — aldrig verifierat; kräver Jens

## Future / V2

- [ ] Proper Redis or persistent cache (survive restarts)
- [x] E-A-T dedicated check — included in enhanced scan (Flash #3: E-A-T analysis)
- [ ] Schema validation (correctness, not just existence)
- [x] Core Web Vitals / page speed measurement — `pageSpeed.ts` (PSI, CrUX field data preferred)
- [x] Internal link structure analysis — included in enhanced scan checks
- [x] Local directory presence check (Eniro, Hitta) — directoryChecker.ts via Tavily
- [ ] Content freshness cycle analysis (regularity, not just dates)
- [x] NAP consistency — included in enhanced scan (directoryChecker + Places API)
- [ ] SSE streaming for real-time progress (instead of simulated steps)
- [ ] User accounts / scan history
- [x] Stripe payment integration (→ Fas 4.5)
- [ ] PDF report export (→ Fas 4.3)
- [ ] Email report delivery (→ Fas 4.1)
- [ ] Agency plan (multi-client dashboard)
- [x] Competitor comparison — included in Pro synthesis
- [ ] Content recommendations via AI
- [x] Tests for Next.js API routes and lib functions — `tests/` has 39 files
- [ ] Error tracking (Sentry or similar)
- [ ] Structured logging (beyond console.error)
