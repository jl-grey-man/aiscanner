AI Search Scanner — Swedish-language tool that analyzes how well a website is optimized for AI search engines (ChatGPT, Perplexity, Google AI Overview).

## Project Documentation

| Document | Path | Purpose |
|----------|------|---------|
| **CLAUDE.md** | `./CLAUDE.md` | Agent instructions — stack, architecture, commands, coding rules |
| **STATUS.md** | `./STATUS.md` | Living dashboard — what works, what's broken, next 3 tasks |
| **Checklist.md** | `./Checklist.md` | Feature checklist — [x] done, [ ] pending |
| **IMPLEMENTATION-PLAN.md** | `./IMPLEMENTATION-PLAN.md` | 4-fas implementation plan with MANDATORY-TESTS per step |
| **OVERSEER-PROMPT.md** | `./OVERSEER-PROMPT.md` | Generic overseer prompt — copy after /clear + specify fas |
| **SCANNER_VERIFICATION.md** | `./SCANNER_VERIFICATION.md` | QA test results against real businesses (Apr 26) |
| **QA-FIX-PLAN.md** | `./docs/QA-FIX-PLAN.md` | Fix plan for 5 remaining QA problems — root causes, files, fixes |

## Multi-machine sync (Mac ↔ pipod)

This repo is worked on from two machines that are both clones of `github.com:jl-grey-man/aiscanner`. **GitHub is the single source of truth** — never copy files between machines by hand.

- **Pipod:** `/mnt/storage/aiscanner` — `ssh -i ~/.ssh/id_ed25519_pipod jens@100.72.180.20`
- **Mac:** `~/aiscanner`

**Golden rule: `git pull` before you start, commit + `git push` before you switch machines.**

```bash
git pull                          # start of every session
# ...work, commit...
git add -p && git commit -m "..." && git push   # before leaving the machine
```

If both machines edit the same file before pushing, GitHub resolves it as a normal merge — but pulling first avoids it. `node_modules/`, `.next/`, `.env*` are gitignored and stay local per machine.

## Stack (current — Next.js 15 App Router)

- **Framework:** Next.js 15 App Router, TypeScript, standalone output
- **UI:** Tailwind CSS (dark theme — bg-zinc-950)
- **AI:** OpenRouter API — Gemini 2.5 Flash (free), Gemini 2.5 Pro (premium)
- **Scraping:** Node.js `node-fetch` + `cheerio` (NOT Python, NOT BeautifulSoup)
- **Google Places:** New Places API (Text Search + Place Details)
- **Deploy:** Railway (nixpacks, standalone output) + auto-deploy from GitHub

> **Note:** The old `backend/` (Python FastAPI) and `frontend/` (React/Vite) directories are DEAD CODE.
> The entire app lives in `app/`. Do not read or modify backend/ or frontend/.
>
> **Config helper:** `app/lib/config.ts` exports `APP_URL` and `APP_DOMAIN` from `NEXT_PUBLIC_APP_URL`. Never hardcode domains — always import from config.ts.

## Architecture

The **enhanced-scan** endpoint is now the primary scan flow, returning a typed `ScanResult` with 37 checks validated by Zod. The old free/full-scan endpoints still exist but the UI no longer calls them. The UI uses `AppShell` → `useAnalysis` → `report/FreeReport` or `report/PremiumReport` (dev-toggle in development).

```
app/
  page.tsx                    # Renders <AppShell /> — all client logic delegated
  components/
    AppShell.tsx              # Client shell — states: idle→scanning→done→error, dev-toggle free/premium
    EnhancedReport.tsx        # Legacy report — status badges + synthesis markdown (not used by new flow)
    UrlInput.tsx              # URL + city input fields
    FreeReport.tsx            # Legacy FreeReport (old mock view — NOT the new report/FreeReport)
    Progress.tsx              # Progress animation during scan
    report/                   # ← NEW: Fas 3 report components
      index.ts                # Re-exports all shared components
      ScoreCircle.tsx         # SVG donut score circle, color-coded by threshold
      CheckBadge.tsx          # OK/FEL/~/—/N/A inline badges
      PriorityCard.tsx        # Action plan item with priority-colored left border + anchor link
      SolutionCard.tsx        # 4-block solution card (explanation, relevance, steps, code)
      RichMarkdown.tsx        # Shared markdown-to-HTML renderer (extracted from PremiumReport)
      LockedSection.tsx       # Blur overlay with lock icon + CTA
      CheckTable.tsx          # Check table filtered by category, sorted by severity
      Glossary.tsx            # 14-term Swedish glossary in collapsible details
      FreeReport.tsx          # Gratisrapport — 10 sections, 29 free checks, locked premium sections
      PremiumReport.tsx       # Premiumrapport — 10 sections, 36 checks, all solutions unlocked
  hooks/
    useAnalysis.ts            # State machine — analyze(url, city) → enhancedReport + scanResult (ScanResult)
  api/
    enhanced-scan/route.ts    # POST /api/enhanced-scan — MAIN endpoint (4 AI calls, 37 checks)
    scan/route.ts             # POST /api/scan — legacy free scan (Gemini Flash, 23 checks)
    full-scan/route.ts        # POST /api/full-scan — legacy premium
  lib/
    scanResult.ts             # ScanResult Zod schema — 37 CheckKeys, CheckResult, CHECK_REGISTRY, calculateScores()
    checkBuilder.ts           # buildCheckResults() — maps raw scan data → 37 typed CheckResult objects, attaches genericSteps/genericCodeTemplate
    checkExplanations.ts      # Hardcoded "Vad är detta?" texts per check key (used by SolutionCard header)
    genericFixes.ts           # Hardcoded generic fix templates for all 29 free-tier checks (steps + codeTemplate with <PLACEHOLDERS>) — used in free reports, no LLM call needed
    reportWriter.ts           # enrichChecksWithReportWriter() — parallel Pro calls for rich report content; sanitizeCodeExample() strips ANPASSA/PLACEHOLDER lines defensively
    enhancedScraper.ts        # Enhanced scraping: robots.txt, OG, FAQ schema, sitemap, E-A-T
    scraper.ts                # Basic scraping + PageSummary extraction
    directoryChecker.ts       # Swedish directory check via Tavily API (Eniro, Hitta) + NAP consistency
    aiMentionChecker.ts       # Two-step AI mention test: entity query → niche extraction → category query
    places.ts                 # Google Places API — Text Search + Place Details (max 5 reviews) + findNearbyCompetitors (Nearby Search for check #36)
    pageSpeed.ts              # Google PageSpeed Insights API — getCwvMetrics() returns LCP/CLS/INP for check #10 (prefers CrUX field data)
    mockScan.json             # Frozen ScanResult fixture used by /preview route
    prompts.ts                # buildFreePrompt() / buildPremiumPrompt() (legacy)
    gemini.ts                 # OpenRouter API wrapper for Gemini Flash/Pro calls
    redis.ts                  # In-memory result cache (24h TTL, stub Redis)
    mockData.ts               # Dev/test mock data
  preview/
    page.tsx                  # /preview — DEV-ONLY route that renders FreeReport/PremiumReport with fake data so designers can iterate without scanning
```

### Enhanced scan flow (`/api/enhanced-scan`)

Request body: `{ url, city?, tier?: 'free' | 'paid' }` — default `tier='free'`.

1. Parallel: `scrapeEnhanced()` + `scrapeWebsite()` + `findBusinessByUrl(url, city)`
2. `getPlaceDetails()` — single Places call → up to 5 reviews (API max), plus `location` + `primaryType` (needed for Nearby Search)
3. City priority: user input → Places formattedAddress (regex `\d{5}\s+([A-ZÅÄÖ][a-zåäö]+)`) → scraped cities
4. Parallel: 3× Gemini Flash (technical, FAQ, E-A-T) + Tavily directory check + AI mention test + PageSpeed Insights (`getCwvMetrics`) + Places Nearby Search (`findNearbyCompetitors`)
5. `analyzeReviewReplies()` — uses merged reviews + totalReviewCount for disclaimer (`sampleNote`)
6. `buildCheckResults()` — assembles all raw data into 37 typed `CheckResult` objects, then attaches `genericSteps` + `genericCodeTemplate` from `genericFixes.ts` to every bad/warning check
7. **Tier branch:**
   - `tier='free'` — **skip Pro entirely**. Build synthesis deterministically from check findings via `buildFreeSynthesis()`. ~10–20s scan, ~$0.10 cost.
   - `tier='paid'` — Pro synthesis + Report Writer in parallel. ~60–90s scan, ~$0.35 cost. Synthesis uses **parallel-race fallback** (Pro 120s primary + Flash 45s backup always ready).
8. Merge rich data (richRelevance, richSteps, richCodeExample) back into checks (paid only)
9. `calculateScores()` — weighted scoring → `scores.free` (29 checks) + `scores.full` (36 checks)
10. Zod-validate → return `ScanResult`

### Free vs Paid tier model

The same scan runs in two modes, differing only in the synthesis/Pro stage:

| Field | Free | Paid |
|-------|------|------|
| `finding` (personalized) | ✅ from scraper/Flash | ✅ from scraper/Flash |
| `fix` (short, deterministic) | ✅ | ✅ |
| `genericSteps` + `genericCodeTemplate` (hardcoded templates with `<PLACEHOLDERS>`) | ✅ shown in UI | ✅ used as fallback |
| `richRelevance` + `richSteps` + `richCodeExample` (Pro-generated with company data) | ❌ skipped | ✅ shown in UI |
| `synthesis.actionPlan` | Deterministic markdown from `finding`s | Pro-generated with competitor analysis |
| Latency | ~15s | ~70s |
| Cost | ~$0.10 (Places + Tavily) | ~$0.35 (+ Pro tokens) |

The UI renders generic templates with `<PLACEHOLDERS>` only when there is no rich content. In free reports, the "Kod att kopiera"-block is hidden entirely (data is still present in scanResult, just not displayed) — the user only sees "Så här fixar ni det" with generic steps. **Paid reports show real code with the company's actual address/phone/openingHours filled in.**

### Report Writer (`reportWriter.ts`) — paid only

Runs in parallel with Pro synthesis (zero extra latency) when `tier='paid'`. Enriches bad/warning checks with:
- `richRelevance`: Company-specific explanation of why the check matters
- `richSteps`: Numbered step-by-step fix instructions
- `richCodeExample`: Copy-paste-ready code with actual company data

Receives a rich `BusinessMeta` (companyName, bransch, city, streetAddress, postalCode, formattedAddress, email, lat/lng, primaryType, googleRating, weekdayHours, schemaTypes, socialLinks, title, h1, …) so Pro can fill in real values. Prompt explicitly forbids `<!-- ANPASSA -->`, `<PLACEHOLDER>`, `<DITT FÖRETAGSNAMN>` etc. — those belong in free templates only. As a safety net, `sanitizeCodeExample()` strips any placeholder lines that Pro still produces (e.g. when data genuinely isn't available — the fix is to **omit the field**, not leave a placeholder).

Batches checks by category (technical, local, ai-readiness, content+other) and calls Gemini 2.5 Pro for each batch. Falls back silently if any batch fails — checks keep their original finding/fix.

### Synthesis Flash-fallback (paid)

The paid synthesis call uses a **parallel race**: Pro (120s timeout) AND Flash (45s timeout) fire against the same prompt at the same time. Pro is primary; if Pro succeeds within timeout we use Pro. If Pro errors or times out, we use the Flash result which is already complete (~10–15s old). Only if both fail do we return a stub. Cost: ~$0.0015 extra per paid scan; guarantees real synthesis content even when Pro is slow or rate-limited.

### ScanResult contract (`scanResult.ts`)

The `ScanResult` Zod schema defines:
- `meta` — domain, companyName, city, scanDate, tier
- `checks` — array of exactly 37 `CheckResult` objects (each with key, status, tier, category, finding, fix, priority, weight, + optional richRelevance/richSteps/richCodeExample)
- `scores` — `{ free: 0-100, full: 0-100 }`
- `synthesis` — structured synthesis (actionPlan, competitorNote, reviewAnalysis)
- `reviewReplies` — review reply analysis

`CHECK_REGISTRY` (37 entries) maps each check key to label, category, tier, weight. Free tier = 29 checks, premium tier adds 8 more = 37 total (36 scoreable + synthesis).

### Report rendering flow

```
page.tsx → AppShell (client component)
  → idle: landing page (Hero, ToolSection with onAnalyze)
  → scanning: Progress component
  → done: report/FreeReport (29 free checks, locked premium) OR report/PremiumReport (36 checks, all unlocked)
  → error: error message + retry
```

In development (`NODE_ENV=development`) AppShell auto-triggers a paid scan in the background after the free scan completes, so the free↔premium toggle is instant. In production no paid scan runs unless explicitly invoked by a payment flow — see Fragile areas.

### /preview route (dev-only)

`http://<host>/preview` renders FreeReport + PremiumReport using a frozen ScanResult from `app/lib/mockScan.json`. Lets us iterate on card design, spacing, typography without burning real scan cost. Returns `notFound()` in production. Toggle in the amber sticky bar switches between free/premium views.

### useAnalysis fetch retry

`useAnalysis.ts` uses a `fetchWithRetry()` wrapper that retries on transient failures (network reset / HTTP 5xx). Max 2 retries with 3s + 8s backoff. Logs `[free-scan]` / `[paid-scan] got 502, retrying in 3000ms...` to console. Skips retry on HTTP 4xx (client error) and app-level JSON errors.

### AI mention checker (`aiMentionChecker.ts`)

Two-step flow using GPT-4o-mini:
1. Entity query: `"Vad vet du om [company] i [city]?"` — checks if AI knows the business
2. Niche extraction: from entity response, extract 1-3 word cuisine/service type (e.g. "husmanskost", "bistro")
3. Category query: `"Var hittar jag bra [niche] i [city]?"` — checks if business is mentioned spontaneously
- City guard: category query skipped entirely if no city is known — never uses "Sverige"

### Directory checker (`directoryChecker.ts`)

- Uses Tavily API (`TAVILY_API_KEY`) — NOT scraping (Eniro/Hitta block scrapers)
- Checks: Eniro, Hitta (Gulasidorna removed)
- NAP extraction from Tavily snippets via regex (handles two-word street names like "Malös gata")
- NAP consistency: normalizes addresses (strips 5-digit postal codes) before comparing
- Returns `napConsistency` with per-field values and `consistent` flag

## Scraper fields (PageSummary)

The scraper extracts these fields per page:

| Field | Type | Notes |
|-------|------|-------|
| `url` | string | |
| `title` | string | max 200 chars |
| `metaDescription` | string | max 300 chars |
| `h1` | string | |
| `h2s` | string[] | max 3 |
| `bodyText` | string | max 800 chars (hard limit) |
| `schemaScripts` | string[] | raw JSON-LD text, max 500 chars each |
| `schemaTypes` | string[] | parsed @type values (e.g. `["Plumber", "WebSite"]`) |
| `hasLocalBusinessSchema` | boolean | true only if @type === "LocalBusiness" exactly |
| `hasAnyLocalBusinessSchema` | boolean | true if any schema.org LocalBusiness subtype found (Plumber, RealEstateAgent, Restaurant, etc.) |
| `hasRestaurantSchema` | boolean | true for Restaurant, Cafe, Bakery, Bar, etc. |
| `canonical` | string\|null | href from `<link rel="canonical">` |
| `hasGoogleMaps` | boolean | true if Google Maps embed/link detected (NOT OpenStreetMap) |
| `phones` | string[] | Swedish format — söks i HELA strippade sidtexten (inte 800-fönstret) + JSON-LD `telephone` ur fulltexten, inkl. `@graph` |
| `cities` | string[] | 12 major Swedish cities |
| `menuSummary` | string | |
| `hasContactInfo` | boolean | |

**Important:** Schema detection uses LOCAL_BUSINESS_SUBTYPES whitelist (~60 types). `Plumber`, `RealEstateAgent`, `Restaurant`, `Dentist` etc. all count as LocalBusiness. The AI prompt receives `LOCALBUSINESS_SUBTYP: Ja/Nej` so it knows whether a subtype is present.

## AI Analysis

### Enhanced scan (primary) — 37 checks
- **3× Gemini Flash** in parallel: technical signals, FAQ/content depth, E-A-T
- **1× Gemini Pro** synthesis: markdown action plan with competitor analysis
- **1× GPT-4o-mini** for AI mention testing (two-step: entity + category query)
- Models via OpenRouter: `google/gemini-2.5-flash` (Flash), `google/gemini-2.5-pro` (Pro). **OBS:** OpenRouter fasar ut gamla modell-id:n (2.0-serien gav 404 i juni 2026 → alla Flash-checks blev `notMeasured`) — verifiera mot `GET https://openrouter.ai/api/v1/models` om "Kunde inte analyseras" dyker upp brett.
- Output: 37 `CheckResult` objects across 5 categories: `technical`, `local`, `aireadiness`, `content`, `premium`
- Free tier: 29 checks (scores.free), Premium: 36 scoreable + synthesis = 37 total (scores.full)
- Synthesis rules: no preamble, no timeframes, starts directly with `## Prioriterad åtgärdsplan`

### Legacy scan (unused by UI)
- **23 checks** across 4 phases: `technical` (6), `local` (6), `aireadiness` (5), `content` (6)
- Fallback chain: Gemini 2.5 Flash → Flash Lite → Mistral Small

## Commands

```bash
# Development
npm run dev          # Next.js dev server on port 3000

# Production build (Railway runs this automatically)
npm run build        # outputs to .next/standalone/

# Design preview (dev only) — mock data, no real scan
# Open http://localhost:3000/preview (or http://100.72.180.20:3000/preview via Tailscale)

# Test free scan locally (default tier)
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.se","city":"Göteborg"}' \
  --max-time 60 | python3 -m json.tool

# Test paid scan locally
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.se","city":"Göteborg","tier":"paid"}' \
  --max-time 180 | python3 -m json.tool

# Railway CLI (requires login)
railway login
railway link -p "AI SCANNER"
railway service aiscanner
railway variables               # view/set env vars
railway deployment list         # view deployments
railway deployment redeploy     # trigger redeploy
```

## URLs

- **Production:** https://aiscanner-production.up.railway.app
- **Local:** http://localhost:3000
- **Main API:** POST /api/enhanced-scan (city param optional)
- **Legacy API:** POST /api/scan, POST /api/full-scan

## Environment

- `.env.local` at project root — synced from Railway variables: `OPENROUTER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TAVILY_API_KEY`, `NEXT_PUBLIC_APP_URL`
- `railway.toml`: nixpacks build, standalone start command, healthcheck
- Railway auto-deploys on push to GitHub master
- `HOSTNAME=0.0.0.0` required in Railway env for Next.js standalone to bind correctly

## Overseer-regler för implementationsplaner

När du agerar som overseer och exekverar en implementationsplan (t.ex. IMPLEMENTATION-PLAN.md):

1. **Sub-agent-prompten MÅSTE inkludera det exakta verifieringsblocket** (allt under `### MANDATORY-TESTS-X.Y`) kopierat ordagrant från planen — inte en sammanfattning, inte en förkortning, inte omskrivet. Copy-paste.
2. **Sub-agenten MÅSTE avsluta med att köra varje PASS-rad** och rapportera utfall. Om agenten inte visar PASS-output för varje test → steget är INTE klart.
3. **Overseern MÅSTE själv köra fas-gate-testerna** — curl mot live endpoint, räkna checks, visuell jämförelse — inte bara tsc/build.
4. **Overseern får INTE deklarera ett steg klart** utan att se testoutput som matchar varje PASS-kriterie i planen.
5. **"Agent said success" är INTE verifiering** — overseern måste oberoende bekräfta genom att köra kommandon eller granska agent-output mot PASS-kriterierna.
6. **Modellval i planen är krav, inte förslag** — se tabellen "Modellval per steg".

## UI / Frontend Verification Rules

Every frontend change MUST pass the following gate before being presented to the user:

1. **All changes must work on mobile, tablet, and desktop.**
2. **All changes must be checked by you through screenshots on mobile AND desktop** before saying anything to the user.
3. **At every screenshot, ask yourself:**
   - *"Är detta en bra design?"* — Does the layout work, is it readable, balanced?
   - *"Följer den resten av UI:t?"* — Do colors, typography, spacing and style match the rest of the site?
   - *"Ser det snyggt ut?"* — Contrast, proportions, details — is it visually appealing?
4. **If the answer to any of the three questions is NO — redo it and run a new screenshot.** Do not present imperfect results.

## Coding rules

- TypeScript strict, no `any` unless unavoidable
- Swedish strings for all user-facing text
- No state management library — React hooks only
- Tailwind utility classes, no CSS modules
- Scraper runs server-side only (API route)
- Hard body text limit: 800 chars per page (keeps AI prompt manageable)
- Never modify `backend/` or `frontend/` — dead code, do not touch
- **Never hardcode domains** — always use `APP_URL` / `APP_DOMAIN` from `app/lib/config.ts`
- `NEXT_PUBLIC_*` env vars are inlined at build time — must be set in Railway BEFORE deploy
- **Svenska strängar måste ha Å/Ä/Ö** — aldrig ASCII-versioner som "Lagg till", "Anvand", "namns pa". Skriv `Lägg till`, `Använd`, `nämns på`. Tidigare hade `checkBuilder.ts` ~30 sådana fel som har städats.
- **Paid placeholders förbjudna** — Pro-genererad `richCodeExample` får ALDRIG innehålla `<!-- ANPASSA -->`, `<DITT FÖRETAGSNAMN>`, `<PLACEHOLDER>`. Om data saknas: utelämna fältet helt ur koden. `sanitizeCodeExample()` är säkerhetsnätet.

## Fragile areas

- **Schema detection:** The LOCAL_BUSINESS_SUBTYPES list in scraper.ts must be maintained. When schema.org adds new LocalBusiness subtypes, add them here. `@type`-extraktionen packar upp `@graph` (WordPress/Yoast lägger ALLA typer där utan toppnivå-@type) — ta aldrig bort den uppackningen. `telephone` extraheras ur schemats FULLTEXT i samma loop; `schemaScripts`-arrayen är 500-tecken-kapad och får ALDRIG användas för JSON.parse.
- **Subpage fetching:** All page fetches use the full `BROWSER_HEADERS` — never override with a bare `User-Agent: Mozilla/5.0` (triggers WAF 466 on sites that accept the full header set). Sitemap `<loc>` values can be CDATA-wrapped (All in One SEO) — the wrapper is stripped before URL parsing. Host comparisons treat `www.` and naked domain as the same site, and all downstream URL logic uses the FINAL URL after redirects (`mainRes.url`).
- **JSON-LD parsing:** Wrapped in try/catch. Malformed JSON falls back to text search. Both code paths must set `hasAnyLocalBusinessSchema`.
- **Google Maps detection:** Regex must be Google-specific: `/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i`. Do NOT widen to generic "map" detection.
- **Canonical:** Extracted BEFORE cheerio removes `<head>` elements (step 2 in extractSummary).
- **Google Maps:** Detected BEFORE iframes are removed (step 3 in extractSummary). Order matters.
- **Port 8010 collision:** If another service starts on 8010, the scanner silently fails. Check registry before deploying.
- **Enhanced scan timeout:** Free ~15s, paid ~70s. Production on Railway (`robotbyran.com`) has no per-request HTTP timeout. If paid Pro synthesis times out at 120s, the parallel Flash-fallback takes over automatically (see synthesis fallback above).
- **Dev toggle + auto-paid:** `AppShell.tsx` binds `IS_DEV = process.env.NODE_ENV === 'development'`. In dev: paid scan auto-triggers in background after free completes, so toggle is instant. **In production: paid scan only runs if explicitly invoked.** This avoids burning ~$0.35 per public scan. When a payment flow is added it should call `analyzePaid(url, city)` from `useAnalysis` after the purchase confirms. To preview the paid layout without paying, use the `/preview` route (mock data).
- **cityMentioned (#12) search surface:** The scraper strips `<header>`/`<nav>`/`<footer>` before extracting `bodyText`. Cities therefore search a wider haystack: `[title, metaDescription, h1, h2s, bodyText]`. Important so cities written only in title or header/logo area (common pattern) still match. Stad-listan i `SWEDISH_CITIES` är ~50 ord — uppdatera vid behov.
- **PageSpeed Insights (CWV check #10):** Uses `GOOGLE_PLACES_API_KEY` (same key as Places API — PSI must be enabled on the Google Cloud project AND added to the key's API restrictions list). Falls back to `notMeasured` with a 403/timeout finding if the API call fails — never blocks the scan. Prefers CrUX field data over Lighthouse lab data.
- **Competitors check #36:** Uses Places API (New) Nearby Search with the business's `location.latitude/longitude` + `primaryType` (radius 1.5 km, max 6 results, deduped on normalized name). Returns `notMeasured` if no GBP match. The synthesis prompt is given the verified list and instructed to NEVER invent competitor names — when the list is empty it falls back to industry-generic insights. Konkurrenternas hemsidor scannas INTE — bara namn/betyg/recensioner via Places.
- **sanitizeCodeExample (paid):** Defensive line-based strip in `reportWriter.ts` that removes `<!-- ANPASSA -->`, `<DITT ...>`, `<PLACEHOLDER>` and similar placeholder patterns from Pro's `richCodeExample`. Pro's prompt forbids placeholders but it sometimes ignores the rule. The strip cleans trailing commas, collapses excess newlines, and returns null if nothing substantial remains (UI falls back to `genericCodeTemplate`).
- **Generic fixes coverage:** `app/lib/genericFixes.ts` has hardcoded `steps` + `codeTemplate` for all 29 free-tier checks (43 fix variants, 26 with code templates). When adding a new check to `CHECK_REGISTRY`, also add a generic fix here for free-tier UX. Placeholders use the convention `<FÖRETAGSNAMN>`, `<TJÄNST>`, `<STAD>`, `<GATUADRESS>`, `<TELEFONNUMMER>`, `<DOMÄN>`, etc.
- **Tavily directory check:** Uses `TAVILY_API_KEY`. If missing, directory check returns warning status with empty results. Gulasidorna removed from ACTIVE_CHECK_DIRS — do not add back (rate-limiting issues).
- **AI mention city guard:** Category query is skipped entirely if no city is resolved. Never use "Sverige" as fallback — it produces meaningless national-level results.
- **Places API reviews:** Returns max 5 reviews per call. The New Places API REST endpoint has no `reviewSort` parameter or pagination — what you get is what you get.
- **Synthesis preamble stripping:** `synthesisRaw.replace(/^[\s\S]*?(##\s)/m, '$1').trim()` — if Pro model doesn't output any `##` heading, synthesis will be empty string. The catch block returns a stub `## Syntesfel` message.
