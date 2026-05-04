AI Search Scanner — Swedish-language tool that analyzes how well a website is optimized for AI search engines (ChatGPT, Perplexity, Google AI Overview).

## Project Documentation

| Document | Path | Purpose |
|----------|------|---------|
| **CLAUDE.md** | `./CLAUDE.md` | Agent instructions — stack, architecture, commands, coding rules |
| **STATUS.md** | `./STATUS.md` | Living dashboard — what works, what's broken, next 3 tasks |
| **Checklist.md** | `./Checklist.md` | Feature checklist — [x] done, [ ] pending |
| **IMPLEMENTATION-PLAN.md** | `./IMPLEMENTATION-PLAN.md` | 4-fas implementation plan with MANDATORY-TESTS per step |
| **OVERSEER-PROMPT.md** | `./OVERSEER-PROMPT.md` | Generic overseer prompt — copy after /clear + specify fas |
| **SCANNER_VERIFICATION.md** | `./SCANNER_VERIFICATION.md` | QA test results against real businesses |

## Stack (current — Next.js 15 App Router)

- **Framework:** Next.js 15 App Router, TypeScript, standalone output
- **UI:** Tailwind CSS (dark theme — bg-zinc-950)
- **AI:** OpenRouter API — Gemini 2.5 Flash (free), Gemini 2.5 Pro (premium)
- **Scraping:** Node.js `node-fetch` + `cheerio` (NOT Python, NOT BeautifulSoup)
- **Google Places:** New Places API (Text Search + Place Details)
- **Deploy:** systemd + nginx on PiPod (port 8010)

> **Note:** The old `backend/` (Python FastAPI) and `frontend/` (React/Vite) directories are DEAD CODE.
> The entire app lives in `app/`. Do not read or modify backend/ or frontend/.

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
    checkBuilder.ts           # buildCheckResults() — maps raw scan data → 37 typed CheckResult objects
    checkExplanations.ts      # Hardcoded "Vad är detta?" texts per check key (used by SolutionCard)
    reportWriter.ts           # enrichChecksWithReportWriter() — parallel Pro calls for rich report content
    enhancedScraper.ts        # Enhanced scraping: robots.txt, OG, FAQ schema, sitemap, E-A-T
    scraper.ts                # Basic scraping + PageSummary extraction
    directoryChecker.ts       # Swedish directory check via Tavily API (Eniro, Hitta) + NAP consistency
    aiMentionChecker.ts       # Two-step AI mention test: entity query → niche extraction → category query
    places.ts                 # Google Places API — Text Search + Place Details (max 5 reviews)
    prompts.ts                # buildFreePrompt() / buildPremiumPrompt() (legacy)
    gemini.ts                 # OpenRouter API wrapper for Gemini Flash/Pro calls
    redis.ts                  # In-memory result cache (24h TTL, stub Redis)
    mockData.ts               # Dev/test mock data
```

### Enhanced scan flow (`/api/enhanced-scan`)

1. Parallel: `scrapeEnhanced()` + `scrapeWebsite()` + `findBusinessByUrl(url, city)`
2. `getPlaceDetails()` — single Places call → up to 5 reviews (API max)
3. City priority: user input → Places formattedAddress (regex `\d{5}\s+([A-ZÅÄÖ][a-zåäö]+)`) → scraped cities
4. Parallel: 3× Gemini Flash (technical, FAQ, E-A-T) + Tavily directory check + AI mention test
5. `analyzeReviewReplies()` — uses merged reviews + totalReviewCount for disclaimer (`sampleNote`)
6. `buildCheckResults()` — assembles all raw data into 37 typed `CheckResult` objects
7. **Parallel:** Gemini Pro synthesis + Report Writer (3-4 Pro batch calls for bad/warning checks)
8. Merge rich data (richRelevance, richSteps, richCodeExample) back into checks
9. `calculateScores()` — weighted scoring → `scores.free` (29 checks) + `scores.full` (36 checks)
10. Zod-validate → return `ScanResult`

### Report Writer (`reportWriter.ts`)

Runs in parallel with Pro synthesis (zero extra latency). Enriches bad/warning checks with:
- `richRelevance`: Company-specific explanation of why the check matters
- `richSteps`: Numbered step-by-step fix instructions
- `richCodeExample`: Copy-paste-ready code with actual company data

Batches checks by category (technical, local, ai-readiness, content+other) and calls Gemini 2.5 Pro for each batch. Falls back silently if any batch fails — checks keep their original finding/fix.

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
Dev-toggle (NODE_ENV=development only) switches between free/premium view.
```

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
| `phones` | string[] | Swedish format |
| `cities` | string[] | 12 major Swedish cities |
| `menuSummary` | string | |
| `hasContactInfo` | boolean | |

**Important:** Schema detection uses LOCAL_BUSINESS_SUBTYPES whitelist (~60 types). `Plumber`, `RealEstateAgent`, `Restaurant`, `Dentist` etc. all count as LocalBusiness. The AI prompt receives `LOCALBUSINESS_SUBTYP: Ja/Nej` so it knows whether a subtype is present.

## AI Analysis

### Enhanced scan (primary) — 37 checks
- **3× Gemini Flash** in parallel: technical signals, FAQ/content depth, E-A-T
- **1× Gemini Pro** synthesis: markdown action plan with competitor analysis
- **1× GPT-4o-mini** for AI mention testing (two-step: entity + category query)
- Models via OpenRouter: `google/gemini-2.0-flash-001` (Flash), `google/gemini-2.5-pro-preview-03-25` (Pro)
- Output: 37 `CheckResult` objects across 5 categories: `technical`, `local`, `aireadiness`, `content`, `premium`
- Free tier: 29 checks (scores.free), Premium: 36 scoreable + synthesis = 37 total (scores.full)
- Synthesis rules: no preamble, no timeframes, starts directly with `## Prioriterad åtgärdsplan`

### Legacy scan (unused by UI)
- **23 checks** across 4 phases: `technical` (6), `local` (6), `aireadiness` (5), `content` (6)
- Fallback chain: Gemini 2.5 Flash → Flash Lite → Mistral Small

## Commands

```bash
# Development
cd /mnt/storage/aiscanner
npm run dev          # dev server on port 3000

# Production build + restart
# IMPORTANT: standalone output does NOT copy public/ automatically — always run both steps:
npm run build && cp -r public .next/standalone/public && sudo systemctl restart ai-scanner-api

# Service management
sudo systemctl restart ai-scanner-api
sudo journalctl -u ai-scanner-api -f

# Test enhanced scan
curl -s -X POST http://localhost:8010/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.se","city":"Göteborg"}' \
  --max-time 140 | python3 -m json.tool
```

## URLs

- **Production:** https://analyze.pipod.net
- **Local (Tailscale):** http://100.72.180.20:8010
- **Main API:** POST http://localhost:8010/api/enhanced-scan (city param optional)
- **Demo reports:** http://100.72.180.20/aiscanner-demos/

## Environment

- `.env` at project root — contains `OPENROUTER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TAVILY_API_KEY`
- Port: **8010** (registered in PiPod port registry)
- systemd: `ai-scanner-api.service`
- Cloudflare Tunnel: `analyze-tunnel.service` → `analyze.pipod.net`
- nginx: proxies `analyze.pipod.net` → port 8010

## Overseer-regler för implementationsplaner

När du agerar som overseer och exekverar en implementationsplan (t.ex. IMPLEMENTATION-PLAN.md):

1. **Sub-agent-prompten MÅSTE inkludera det exakta verifieringsblocket** (allt under `### MANDATORY-TESTS-X.Y`) kopierat ordagrant från planen — inte en sammanfattning, inte en förkortning, inte omskrivet. Copy-paste.
2. **Sub-agenten MÅSTE avsluta med att köra varje PASS-rad** och rapportera utfall. Om agenten inte visar PASS-output för varje test → steget är INTE klart.
3. **Overseern MÅSTE själv köra fas-gate-testerna** — curl mot live endpoint, räkna checks, visuell jämförelse — inte bara tsc/build.
4. **Overseern får INTE deklarera ett steg klart** utan att se testoutput som matchar varje PASS-kriterie i planen.
5. **"Agent said success" är INTE verifiering** — overseern måste oberoende bekräfta genom att köra kommandon eller granska agent-output mot PASS-kriterierna.
6. **Modellval i planen är krav, inte förslag** — se tabellen "Modellval per steg".

## Coding rules

- TypeScript strict, no `any` unless unavoidable
- Swedish strings for all user-facing text
- No state management library — React hooks only
- Tailwind utility classes, no CSS modules
- Scraper runs server-side only (API route)
- Hard body text limit: 800 chars per page (keeps AI prompt manageable)
- Never modify `backend/` or `frontend/` — dead code, do not touch

## Fragile areas

- **Schema detection:** The LOCAL_BUSINESS_SUBTYPES list in scraper.ts must be maintained. When schema.org adds new LocalBusiness subtypes, add them here.
- **JSON-LD parsing:** Wrapped in try/catch. Malformed JSON falls back to text search. Both code paths must set `hasAnyLocalBusinessSchema`.
- **Google Maps detection:** Regex must be Google-specific: `/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i`. Do NOT widen to generic "map" detection.
- **Canonical:** Extracted BEFORE cheerio removes `<head>` elements (step 2 in extractSummary).
- **Google Maps:** Detected BEFORE iframes are removed (step 3 in extractSummary). Order matters.
- **Port 8010 collision:** If another service starts on 8010, the scanner silently fails. Check registry before deploying.
- **Enhanced scan timeout:** Takes ~90s total (scraping + 3 Flash + Pro). Cloudflare tunnel drops at 100s — scan must stay under that. If Pro synthesis times out (90s limit), it falls back to a stub message.
- **Tavily directory check:** Uses `TAVILY_API_KEY`. If missing, directory check returns warning status with empty results. Gulasidorna removed from ACTIVE_CHECK_DIRS — do not add back (rate-limiting issues).
- **AI mention city guard:** Category query is skipped entirely if no city is resolved. Never use "Sverige" as fallback — it produces meaningless national-level results.
- **Places API reviews:** Returns max 5 reviews per call. The New Places API REST endpoint has no `reviewSort` parameter or pagination — what you get is what you get.
- **Synthesis preamble stripping:** `synthesisRaw.replace(/^[\s\S]*?(##\s)/m, '$1').trim()` — if Pro model doesn't output any `##` heading, synthesis will be empty string. The catch block returns a stub `## Syntesfel` message.
