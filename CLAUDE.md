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
| **Go-live-fixes plan** | `./docs/plans/2026-09-01-golive-fixes.md` | Atomic 22-task åtgärdsplan efter go-live-audit sep 2026 — DeepSeek kör Task 0–11 + 14–21, Claude kör Task 12–13 |

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
      GoogleAttribution.tsx   # Google Maps logo — Places policy attribution, no-map sections (see "Google Places-attribution" below)
      CompetitorComparisonTable.tsx  # Ni vs. topp 3 konkurrenter, en rad per kontroll — renders ScanResult.competitorComparison (premium only)
      FreeReport.tsx          # Gratisrapport — 10 sections, 29 free checks, locked premium sections
      PremiumReport.tsx       # Premiumrapport — 10 sections, 36 checks, all solutions unlocked
  hooks/
    useAnalysis.ts            # State machine — analyze(url, city) → enhancedReport + scanResult (ScanResult)
  api/
    enhanced-scan/route.ts    # POST /api/enhanced-scan — MAIN endpoint (4 AI calls, 37 checks)
    scan/route.ts             # POST /api/scan — legacy free scan (Gemini Flash, 23 checks)
    full-scan/route.ts        # POST /api/full-scan — legacy premium
  lib/
    openrouter.ts             # Z3: centraliserad OpenRouter-konfiguration — OPENROUTER_API_URL + buildOpenRouterRequestBody() sätter provider.data_collection="deny" på VARJE anrop (dataskydd, se "OpenRouter — dataskydd" nedan). ALLA fetch-anrop mot openrouter.ai i app/ MÅSTE gå via denna
    scanResult.ts             # ScanResult Zod schema — 37 CheckKeys, CheckResult, CHECK_REGISTRY, calculateScores()
    checkBuilder.ts           # buildCheckResults() — maps raw scan data → 37 typed CheckResult objects, attaches genericSteps/genericCodeTemplate
    checkExplanations.ts      # Hardcoded "Vad är detta?" texts per check key (used by SolutionCard header)
    genericFixes.ts           # Hardcoded generic fix templates for all 29 free-tier checks (steps + codeTemplate with <PLACEHOLDERS>) — used in free reports, no LLM call needed
    reportWriter.ts           # enrichChecksWithReportWriter() — parallel Pro calls for rich report content; sanitizeCodeExample() strips ANPASSA/PLACEHOLDER lines defensively
    synthesisBudget.ts        # Z3: callWithDeadline() — withRetry bunden av en delad deadline (shrinks/gives-up per attempt), håller Pro+Flash-syntesracet i route.ts inom SYNTHESIS_BUDGET_MS (150s) i stället för att kunna göra 3×120s obundet
    masterSchema.ts           # Audit #7: buildMasterSchema() — ONE deterministic LocalBusiness JSON-LD from verified data; codeRef/delta for other schema checks; dedupeCodeExamples() similarity safety net
    factGuard.ts              # Audit #6: buildVerifiedFacts() + prompt-fakta/GROUNDING_RULES; groundReport() efterkontroll rättar/tar bort påhittade öppettider, telefon, interna URL:er, menyrätter/priser (loggar [FactCheck])
    bransch.ts                # Audit #10: deriveBransch()/mapPlacesType() — svensk bransch från Places primaryType/types (suffix _restaurant/_store), aldrig identisk med companyName
    templateFill.ts           # fillTemplate(template, meta) — fills genericCodeTemplate's <PLACEHOLDERS> with known facts (name/phone/address/domain), paid tier only
    reportDisplay.ts          # Pure display helpers for the reports: NAP rows/labels, AI-test labels (entityClassification-aware), pickSolutionCode() (SolutionCard code source: rich → codeRef → template)
    enhancedScraper.ts        # Enhanced scraping: robots.txt, OG, FAQ schema, sitemap, E-A-T
    scraper.ts                # Basic scraping + PageSummary extraction
    directoryChecker.ts       # Swedish directory check via Tavily API (Eniro, Hitta) + NAP consistency
    aiMentionChecker.ts       # Two-step AI mention test: entity query → niche extraction → category query
    places.ts                 # Google Places API — Text Search + Place Details (max 5 reviews) + findNearbyCompetitors (Nearby Search for check #36, incl. websiteUri)
    competitorComparison.ts   # Audit #9: paid-only deterministic scan of top 3 competitor websites (same scrapers + buildCheckResults, no LLM) → ScanResult.competitorComparison + prompt summary
    pageSpeed.ts              # Google PageSpeed Insights API — getCwvMetrics() returns LCP/CLS/INP for check #10 (prefers CrUX field data)
    scanCache.ts              # Task 12: CachedScanContext (utan Places-innehåll) + scanCacheKey()/cacheSkipReason()/serializeFreeScan()/parseCachedFreeScan()/restoreScanContext() — paid återanvänder cachad free-scan (tabell scan_cache i checkoutDb.ts)
    placesContent.ts          # Google Places-villkoren: derivePlacesParts()/placeFacts()/buildGbpData(), stripPlacesContent() före lagring, rehydrateStoredReport() vid läsning, PLACES_CONTENT_FIELDS
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

0. **Paid:** slå upp cachad free-scan (`scan_cache`, ≤ 24 h, se "Scan cache" nedan). Träff → hämta Place Details + Nearby Search färskt för cachens place_id, bygg om `ScanContext` och alla checks (`buildCheckResults`) och hoppa till steg 7. Miss → steg 1–6 som vanligt.
1. Parallel: `scrapeEnhanced()` + `scrapeWebsite()` + `findBusinessByUrl(url, city)`
2. `getPlaceDetails()` — single Places call → up to 5 reviews (API max), plus `location` + `primaryType` (needed for Nearby Search)
3. City priority: user input → Places formattedAddress (regex `\d{5}\s+([A-ZÅÄÖ][a-zåäö]+)`) → scraped cities
4. Parallel: 3× Gemini Flash (technical, FAQ, E-A-T — `temperature: 0`, `ASSESSMENT_TEMPERATURE`) + Tavily directory check + AI mention test + PageSpeed Insights (`getCwvMetrics`) + Places Nearby Search (`findNearbyCompetitors`)
5. `analyzeReviewReplies()` — always `notMeasured` (Audit #3, see below), uses merged reviews + totalReviewCount for the sample-size disclaimer (`sampleNote`)
6. `buildCheckResults()` — assembles all raw data into 37 typed `CheckResult` objects, then attaches `genericSteps` + `genericCodeTemplate` from `genericFixes.ts` to every bad/warning check
7. **Tier branch:**
   - `tier='free'` — **skip Pro entirely**. Build synthesis deterministically from check findings via `buildFreeSynthesis()`. ~10–20s scan, ~$0.10 cost.
   - `tier='paid'` — Report Writer + reviewInsights start immediately, in parallel with the competitor site scans; Pro synthesis starts as soon as the competitor comparison is ready. Same enrichment on cache hit and miss. ~100–170s scan (Report Writer is bounded by a 170 s budget), ~$0.35 cost. Synthesis uses **parallel-race fallback** (Pro 120s primary + Flash 45s backup always ready).
8. `applyRichData()` merges rich data (richRelevance, richSteps, richCodeExample, richStatus, codeRef — master schema already applied inside Report Writer) back into checks (paid only) — every bad/warning check gets `richStatus`, missing ones are logged. Then `fillTemplate()` fills every remaining `genericCodeTemplate` with known facts (paid only, cache hit and miss — see `templateFill.ts`), and finally `groundReport()` runs.
9. `calculateScores()` — weighted scoring → `scores.free` (29 checks) + `scores.full` (36 checks)
10. Zod-validate → **free:** spara i `scan_cache` (om cachebar) → return `ScanResult`

### Free vs Paid tier model

The same scan runs in two modes, differing only in the synthesis/Pro stage:

| Field | Free | Paid |
|-------|------|------|
| `finding` (personalized) | ✅ from scraper/Flash | ✅ from scraper/Flash |
| `fix` (short, deterministic) | ✅ | ✅ |
| `genericSteps` + `genericCodeTemplate` (hardcoded templates with `<PLACEHOLDERS>`) | ✅ shown in UI | ✅ used as fallback |
| `richRelevance` + `richSteps` + `richCodeExample` (Pro-generated with company data) | ❌ skipped | ✅ shown in UI |
| `synthesis.actionPlan` | Deterministic markdown from `finding`s | Pro-generated with competitor analysis |
| Latency | ~15s | ~130–170s |
| Cost | ~$0.10 (Places + Tavily) | ~$0.35 (+ Pro tokens) |

The UI renders generic templates with `<PLACEHOLDERS>` only when there is no rich content. In **free** reports, the "Kod att kopiera"-block is hidden entirely (data is still present in scanResult, just not displayed) — the user only sees "Så här fixar ni det" with generic steps. **Paid reports never hide a code block that exists** (`SolutionCard`'s `unlocked` prop, decision in `pickSolutionCode()` in `reportDisplay.ts`): richCodeExample is shown as-is (with `codeRef` it is only the delta); a card with `codeRef` shows the reference box to the master-schema card and never falls back to template/Flash code; otherwise `genericCodeTemplate` — pre-filled server-side by `fillTemplate()` (`templateFill.ts`) with known facts (company name, phone, street address, city, postal code, domain) — is shown with a "Mall — ersätt värden inom hakparenteser" badge instead of being hidden. Placeholders `fillTemplate()` has no verified data for (e.g. `<VERKSAMHETSTYP>`, `<ORGNUMMER>`, FAQ example questions) are deliberately left as-is rather than guessed.

### Report Writer (`reportWriter.ts`) — paid only

Runs in parallel with Pro synthesis when `tier='paid'` — it is usually the longest stage of the paid scan (bounded by its 170 s budget). Enriches bad/warning checks with:
- `richRelevance`: Company-specific explanation of why the check matters
- `richSteps`: Numbered step-by-step fix instructions
- `richCodeExample`: Copy-paste-ready code with actual company data

Receives a rich `BusinessMeta` (companyName, bransch, city, streetAddress, postalCode, formattedAddress, email, lat/lng, primaryType, googleRating, weekdayHours, schemaTypes, socialLinks, title, h1, …) so Pro can fill in real values. Prompt explicitly forbids `<!-- ANPASSA -->`, `<PLACEHOLDER>`, `<DITT FÖRETAGSNAMN>` etc. — those belong in free templates only. As a safety net, `sanitizeCodeExample()` strips any placeholder lines that Pro still produces (e.g. when data genuinely isn't available — the fix is to **omit the field**, not leave a placeholder).

**Reliability model — no silent gaps (Audit #1):**
- `planBatches()` sorts bad/warning checks by category (technical → local → ai-readiness → content → ai-test → gbp, then registry id) and splits them into batches of **max 3 checks**, so one broken/truncated generation never takes a whole category down.
- `runWithConcurrency()` runs batches in parallel, **max 4 at a time**.
- Each call goes through `withRetry` (`app/lib/retry.ts`): **Gemini 2.5 Pro** first (2 attempts), then **Gemini 2.5 Flash** (2 attempts) for the checks Pro could not deliver completely. A check is complete when both `richRelevance` and `richSteps` are non-empty; `richCodeExample` may legitimately be null. Permanent 4xx errors are not retried.
- `callLimitsFor()` scales timeout/max_tokens with batch size (Pro: 30 s + 25 s/check, 4000 + 2500 tokens/check; Flash: 20 s + 10 s/check, 2000 + 2000 tokens/check).
- Total time budget `budgetMs` = 170 s. Pro calls reserve time for the Flash fallback of the same batch; no call starts with < 15 s left.
- route.ts passes `callOpenRouterOnce` (NOT `callOpenRouter`, which has its own withRetry — nested retries would multiply latency).
**Huvudschema — ett kodblock i stället för 3–5 kopior (Audit #7, `masterSchema.ts`):**
- `pickMasterOwner()` väljer ägaren: första bad/warning-check med fix-text i ordningen `localBusiness` → `localSubtype` → `schemaAny` → `jsonLd`. Finns ingen → inget huvudschema.
- `buildMasterSchema(meta)` bygger huvudschemat **deterministiskt, utan LLM**, enbart av verifierad data: `@type` från Places `primaryType` (`PLACES_TO_SCHEMA_TYPE`, suffix `_restaurant`/`_store`, annars sajtens subtyp, annars `LocalBusiness`), `@id` = `<origin>/#localbusiness`, name, url, telefon (+46), e-post, PostalAddress, geo, `openingHoursSpecification` från Places `regularOpeningHours.periods` (`meta.openingPeriods`, ogiltiga perioder → utelämnas), `sameAs` = Maps-länk + sajtens egna sameAs. Aldrig aggregateRating/description/priceRange.
- Batch-prompten visar huvudschemat för berörda batchar: ägaren ska ge `richCodeExample: null`, täckta checks får inte upprepa det och ska bara ge delta; annan schema-typ ska referera `{"@id": ...}`.
- Efter sammanslagningen: `applyMasterSchema()` sätter huvudschemat som ägarens `richCodeExample`. Checks i `MASTER_COVERAGE` (localSubtype/schemaAny/jsonLd/aiMentions alltid; socialPresence/gbpData om `sameAs`, openingHours om öppettider, napConsistency/phone/contactInfo om adress/telefon/e-post finns i schemat) får `codeRef` = ägarens nyckel och `extractSchemaDelta()` rensar deras kod till bara det som inte redan finns i huvudschemat (företagsnoder reduceras till nya egenskaper under samma `@id`, nästlade företagsobjekt → `{"@id"}`, inget kvar/≥ 0,6 likt → null).
- `dedupeCodeExamples()` är ett generellt säkerhetsnät: token-baserad Ratcliff/Obershelp-likhet (`codeSimilarity()`, gemener, utan citattecken och JSON-LD-omslag) ≥ `DUPLICATE_THRESHOLD` 0,6 mot ett tidigare kodblock (ägaren först, sedan registerordning) → koden tas bort och `codeRef` pekar på det behållna kortet. Bara kort med fix-text (som renderas) kan vara mål.
- **`dedupeCodeExamples()` kräver MASTER_COVERAGE för hänvisningar till ägaren (fix sep 2026):** textlikhet mot ägarens kod räckte tidigare ensamt för `codeRef` — `serviceSchema` (inget i `MASTER_COVERAGE`) fick `codeRef` till huvudschemats ägare bara för att dess AI-genererade Service-kod delade företagsnamn/adress/telefon med LocalBusiness-koden (≥ 0,6 likhet), trots att huvudschemat aldrig innehåller ett Service-schema — `SolutionCard` visade då en hänvisningsruta ("koden ingår redan") utan att den gjorde det. `dedupeCodeExamples()` tar nu ett valfritt `master`-argument (skickas som `masterCtx?.master` från `reportWriter.ts`); en hänvisning till `options.first` (ägaren) kräver dessutom `referencesMaster(key, master)` — annars behåller checken sin egen kod (jämförelse mot andra, icke-ägande kort påverkas inte). `serviceSchema` fick även en egen `genericFixes.ts`-mall (Audit sep 2026, id 24 — tidigare det enda premium-only-checket utan generisk fallback) så en check utan rikt innehåll ändå visar steg + en ärlig `<PLACEHOLDERS>`-mall i stället för ett tomt kodblock.
- `applyRichData()` kopierar `codeRef` till checken (Zod-fältet `codeRef` i `CheckResultSchema` — annars strippas det). `SolutionCard` visar då en hänvisningsruta med länk `#fix-<codeRef>` + ev. delta-kod, och faller ALDRIG tillbaka på mall-/Flash-kod.
**Faktaförankring — inga påhittade fakta (Audit #6, `factGuard.ts`):**
- `buildVerifiedFacts()` (route.ts, före syntes + Report Writer) samlar det vi VET: telefon (Places `nationalPhoneNumber` + skrapade `phones`, dubbletter i olika format räknas en gång), öppettider (Places `periods` → `weekdayDescriptions` → sajtens eget `openingHoursFromSchema`), kända interna sökvägar (sitemap-`<loc>` inkl. CDATA + `PageSummary.internalLinks.paths` + skrapade sidors URL + og:image/websiteUri/blogPaths; www = naken domän) och skrapat meny-/tjänsteinnehåll (undersidor vars sökväg matchar meny/tjänst/behandling/pris…, max 800 tecken) + FAQ-frågor på sajten.
- `formatFactsForPrompt()` + `GROUNDING_RULES` läggs i syntesprompten och i Report Writer-prompten (`BusinessMeta.verifiedFacts`, `includeContact: false` där telefon/tider redan finns): förbud mot påhittade öppettider, telefon, priser, menyrätter/drycker, behandlingar, FAQ-svar och URL:er; nya sidor föreslås med ord, aldrig som sökväg; saknade uppgifter blir uppgifter/frågor för kunden.
- `groundReport(checks, synthesis, facts)` körs i paid-flödet efter `applyRichData()` + syntesvalidering och går igenom `richCodeExample`, `richSteps`, `richRelevance`, `synthesis.actionPlan` och `synthesis.summary` (```-kodblock och `<script type="application/ld+json">` tolkas strukturellt som JSON):
  - **Telefon:** okänt nummer → rättas till den kända (internationellt format om +46 användes); inget känt nummer → meningen/`telephone` tas bort.
  - **Öppettider:** `openingHoursSpecification`/`openingHours` som avviker → ersätts med verifierade tider (`hoursToSpecification()`), saknas verifierade → tas bort. Text ("tisdag–torsdag 12–23") jämförs per dag: fel i öppettids-sammanhang → hela kedjan ersätts med `formatHoursSv()`; annars (t.ex. lunchtider) eller utan verifierade tider → meningen tas bort. 23:59/24:00 = 00:00.
  - **Interna URL:er:** absoluta mot sajtens värd, `href`/`src`, markdown-länkar och fristående `/sökvägar` som inte finns bland de kända → `<a>`-elementet/URL-fältet/meningen tas bort, markdown-länk blir ren text. Tillåtna ändå: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/*`, `/wp-admin`, `/favicon.ico`. **Undantag (fix sep 2026):** en mening som uttryckligen föreslår att SKAPA en ny sida med sökvägen bara som exempel ("Skapa en ny undersida, exempelvis /vanliga-fragor") tas INTE bort — `unknownInternalRefs()` skippar hela textbiten (mening/kodrad) när `PAGE_CREATION_SIGNAL_RE` (ett skapa-verb + ordet sida/undersida i samma textbit) matchar, exakt vad `GROUNDING_RULES` redan ber om ("Föreslå nya sidor med ord ... aldrig som en påhittad sökväg eller länk"). Gäller bara bar text i prosa/kodrader — en riktig `<a href>`/markdown-länk isoleras redan till bara href-värdet innan kontrollen körs (ingen omgivande "skapa"-text i den strängen) och tas därför fortfarande bort oavsett formulering; ett påstående utan skapa-verb ("Läs mer på /vanliga-fragor") tas också fortfarande bort.
  - **Meny/pris (JSON-LD):** `MenuItem` vars namn inte finns i skrapad text och `price`/`priceRange` som inte finns där tas bort; tomma MenuSection/Menu, frågor utan svar och noder med bara `@type` försvinner.
  - Varje ändring loggas: `[FactCheck] <check>.<fält>: <typ> rättad|borttagen — <detalj>` + en summeringsrad.
- Every bad/warning check gets `richStatus`: `'pro'` | `'flash'` | `'missing'`. `'missing'` is logged with its reason (`[ReportWriter] Rikt innehåll SAKNAS för <key>: ...`); partial content is kept. `applyRichData()` merges into checks and also marks checks absent from the result as missing. Every failed attempt is logged too (`[ReportWriter] Pro-försök misslyckades ...`).

### Scan cache — paid återanvänder free-scanen (Task 12, `scanCache.ts` + `checkoutDb.ts`)

- **Varför:** kunden betalar för den rapport den såg. Tidigare scannades allt om vid betalning → Flash-bedömningar och AI-test kunde landa annorlunda (uppmätt 2026-09-14, tvakanten.se: free `scores.full` 67, ny paid-körning 70; `aiMentions` bad → warning) och insamlingsfasen kördes två gånger.
- **Spara (free):** efter lyckad free-scan sparar `storeFreeScanInCache()` (route.ts) `{ v: 2, scanDate, scores, statuses, context }` i SQLite-tabellen `scan_cache` (`data/checkouts.db`; `cache_key TEXT PRIMARY KEY, result_json TEXT, created_at INTEGER`, index på `created_at`). `context` = `CachedScanContext` — **bara icke-Places-data** (se "Google Places-villkoren" nedan): skrapad data (`scrapedData`, `enhancedData`), Flash-rådata (teknik/FAQ/E-A-T), katalogkontroll (Tavily), AI-test, PSI, stad + `placeId`/`domainMatch`/`placeWarning`. `toCachedContext()` är en vitlista. Inget ScanResult sparas längre. `purgeExpiredScanCache()` raderar rader äldre än `SCAN_CACHE_TTL_MS` (24 h) vid varje läsning och skrivning av cachen.
- **Sparas INTE** (`cacheSkipReason()`): ScanResult klarade inte Zod, någon Flash-bedömning föll tillbaka på "Kunde inte analyseras", eller AI-testet misslyckades (`errored`/null). En premiumrapport ska inte ärva ett tillfälligt API-fel — paid scannar då om från början.
- **Nyckel** (`scanCacheKey(url, city)`): normaliserad URL (värd gemener; standardport, fragment och avslutande `/` bort; protokoll, `www.`, sökväg och query behålls) + `|` + stad (trimmad, gemener). Free sparar med staden scannet **landade** i (`meta.city`), eftersom `FreeReport` skickar `meta.url` + `meta.city` till `/api/checkout` → finalize → paid. Ett paid-anrop med annan stad (t.ex. utan stad när free landade i "Göteborg") blir en cachemiss.
- **Läsa (paid):** `loadCachedFreeScan()` → `getFreeScan(key, 24 h)` + `parseCachedFreeScan()` (trasig JSON, fel `SCAN_CACHE_VERSION` eller ofullständig rad = miss). **Träff:** ingen scraping/Flash/Tavily/PSI/AI-test. `fetchPlacesForCachedScan()` hämtar Place Details + Nearby Search **färskt** för `placeId` (ingen place_id → inga anrop), `restoreScanContext()` bygger företagsnamn/bransch/recensioner/recensionssvar/konkurrentlista med samma `derivePlacesParts()` som insamlingsfasen, och `buildCheckResults()` körs om på cachens data + färsk Places-data (deterministiskt → samma `scores.free`/`scores.full` som gratisrapporten så länge Google-profilen inte ändrats). Ändrar färsk data statusar/poäng (t.ex. öppettider tillagda) är det accepterat men loggas: `[ScanCache] Färsk Places-data ändrade resultatet …: scores.free X → Y …; checks: openingHours: ok → notMeasured` (annars `… gav samma statusar och poäng`). Sedan körs HELA paid-berikningen: konkurrentsajter (färsk Nearby-lista), Pro-syntes, Report Writer, reviewInsights, huvudschema, groundReport. `meta.scanDate` = free-scanens tid, nytt `scanId`. **Miss eller DB-fel:** fullt flöde. Loggar: `[ScanCache] Sparad | Sparar inte | Träff | Miss | Ogiltig cachad rad`. Uppmätt 2026-09-14 (tvakanten.se, dev): free 77/73 → paid-träff 77/73, alla 37 statusar lika, 74 s.
- Bumpa `SCAN_CACHE_VERSION` (nu 2) när `CachedScanContext` ändras inkompatibelt — rader med annan version raderas när databasen öppnas.

### Google Places-villkoren — inget Places-innehåll lagras (`placesContent.ts`)

- **Villkoren** (verifierade mot primärkälla 2026-09-14): Places policies — *"You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions, although the place_id is exempt from caching restrictions."*; Service Specific Terms 14.3 — lat/lng får cachas max 30 dagar (vi lagrar dem inte alls). Namn, adress, telefon, betyg, antal recensioner, öppettider, recensioner, types och konkurrenters namn/betyg/webbplats får alltså **aldrig** hamna i `data/checkouts.db` (eller i git — testfixturen `tests/fixtures/paidReportPlaces.json` har påhittade värden).
- **scan_cache:** se "Scan cache" ovan — bara `CachedScanContext` + place_id.
- **checkouts:** `markScanDone()` sparar ALLTID `stripPlacesContent(result)` (central spärr). `PLACES_CONTENT_FIELDS` listar exakt vad som strippas: `meta.companyName`, `meta.bransch`, `scores.google`/`googleCount`, `gbp`, `reviewReplies.total`/`sampleNote`, `reviewInsights.themes[].quote` (sparas som SHA-256 + längd) + `.authorName`/`.authorUri` (recensionsförfattarens kreditering, Places policy — nollställs precis som citatet, återställs vid läsning via samma citat-uppslag), `competitorComparison.competitors[].name/website/rating/reviewCount`, finding+data för checks `openingHours` (när källan är GBP), `reviewReplies` (data), `gbpData`, `competitors`, alla `genericCodeTemplate` (tillbaka till ren mall) och huvudschemat i ägarkortets `richCodeExample`. Kvar: `placesRef.placeId`, konkurrenternas `placeId` (i `placesStripped.competitorPlaceIds` och `competitorComparison.competitors[].placeId`), statusar, poäng, AI-text.
- **Läsning:** `GET /api/checkout/status` (vid `done`) och `POST /api/checkout/finalize` (sparat resultat) kör `rehydrateStoredReport()`: Place Details för `placesRef.placeId` + Place Details per konkurrent-place_id (`getCompetitorDetails()`, avstånd räknat från platsens position) → `rehydratePlacesContent()` bygger om fälten deterministiskt med samma funktioner som scannet (`buildGbpData`, `buildGbpDataCheck`, `formatCompetitorsFinding`, `buildOpeningHoursCheck`, `analyzeReviewReplies`, `fillTemplate`, `buildMasterSchema`, citat hittas via hash i färska recensioner). Status, prioritet och poäng är de uppmätta. Saknas färsk data (API-fel, ingen `GOOGLE_PLACES_API_KEY`) visas "… kunde inte hämtas från Google just nu", ett tema vars citat inte längre finns utelämnas, konkurrent utan data blir "Okänd konkurrent" — aldrig ett kast. Kostnad: upp till 1 + 5 Place Details per öppning av en rapport. Verifierat 2026-09-14 i dev: status-routens rehydrerade rapport = paid-svaret, fält för fält.
- **`placesRef`** (ScanResult, båda tiers): `{ placeId, domainMatch, site: { title, phone, email, schemaTypes, socialLinks } }` — sajtens EGNA skrapade uppgifter som ombyggnaden behöver (företagsnamn-fallback, huvudschema, kodmallar). Inte Places-innehåll.
- **Migrering:** `migratePlacesContent()` körs när databasen öppnas: checkouts-rader utan `placesStripped` strippas på plats (äldre rapporter utan `placesRef` får `lookupByUrl` → place_id slås upp via Text Search vid läsning; jämförelsens place_id tas från check #36 via namnet), scan_cache-rader med annan version raderas.
- **GRÅZON (Jens informerad):** AI-genererad text sparas som den är — `richRelevance`, `richSteps`, AI-skrivna `richCodeExample`, `synthesis.*`, `reviewInsights.praise/complaints/sampleNote`, AI-testets `aiMentions`/check #33 (svar och faktagranskningens `correctFact`). Den är härledd ur prompter med Places-data och kan innehålla adress/telefon/betyg (uppmätt tvakanten.se: gatuadressen i `richSteps` och syntesen, "942 recensioner" i syntesen). Även `meta.city` (kan komma från Places-adressen) och `checkouts.city` sparas — ortnamnet är scan-parametern och cachenyckeln.
- Sajtens eget telefonnummer/adress i skrapad data (t.ex. check #11 `phone`, `scrapedData`, `placesRef.site.phone`) och Tavily-katalogdata är inte Places-innehåll och sparas som vanligt — de kan alltså vara samma nummer som i Google-profilen.
- **Temperatur:** status-avgörande Flash-bedömningar (teknik/FAQ/E-A-T i route.ts, AI-svarsklassificeringen i `aiMentionChecker.ts`) skickar `ASSESSMENT_TEMPERATURE = 0` (`reportWriter.ts`, sjunde parametern i `CallOpenRouterFn`). Textgenerering (syntes, Report Writer, reviewInsights) har kvar 0.2.

### OpenRouter — dataskydd (Z3, `app/lib/openrouter.ts`)

Places-data och kunddata (företagsnamn, adress, telefon, recensioner, e-post, ...) skickas till OpenRouter i varenda prompt i appen — tekniska/FAQ/E-A-T-bedömningar och syntesen (`route.ts`), Report Writer, recensionsinsikter, och AI-omnämnandetestet (`aiMentionChecker.ts`).

- **Problemet:** OpenRouter ruttar som DEFAULT till providers som får logga/lagra/träna på prompt-data (`provider.data_collection` default = `"allow"`, verifierat 2026-09-14 mot `openrouter.ai/docs/features/provider-routing`).
- **Fixen:** `provider: { data_collection: "deny" }` i request-bodyn begränsar routningen till providers UTAN datalagring/träning på prompten. `app/lib/openrouter.ts` exporterar `OPENROUTER_API_URL` + `buildOpenRouterRequestBody(params)` — den senare sätter `provider` alltid till detta, och `provider` finns inte som fält i `OpenRouterRequestParams` så ett anropsställe kan inte skriva över det.
- **VARJE direkt fetch-anrop mot openrouter.ai i app/ MÅSTE gå via denna helper** — de två anropsställena (`callOpenRouterOnce` i route.ts, `callGPT` i aiMentionChecker.ts) importerar `OPENROUTER_API_URL`/`buildOpenRouterRequestBody` i stället för att hårdkoda URL:en/`provider`-fältet själva. `reportWriter.ts`/`reviewInsights.ts` anropar aldrig fetch direkt — de tar emot `callOpenRouterOnce` som en injicerad `CallOpenRouterFn` (route.ts), så de täcks automatiskt.
- **Verifierat 2026-09-14** (riktiga anrop mot OpenRouter med `provider.data_collection: "deny"`, `max_tokens: 5`): HTTP 200 för alla tre modeller appen använder — `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `openai/gpt-4o-mini` — dvs. minst en zero-data-retention-provider finns för var och en.
- **Regressionsskydd:** `tests/openrouter.test.ts` grep:ar hela `app/` och kastar om strängen `openrouter.ai` eller `data_collection` förekommer i någon annan fil än `app/lib/openrouter.ts` — ett nytt anropsställe som hårdkodar URL:en/provider-fältet vid sidan av helpern får testet att slå fel.

### Google Places-attribution — branding (Z2, `GoogleAttribution.tsx`)

Skild från "inget Places-innehåll lagras" ovan — det här är Places-**branding**-kravet: *"When displaying Places API data without a Google Map, you must include the Google logo"* (developers.google.com/maps/documentation/places/web-service/policies, verifierat 2026-09-14).

- `app/components/report/GoogleAttribution.tsx` renderar `public/google-maps-logo.svg` — Googles egen officiella nedladdning (`Google_Maps_Attribution_Assets.zip`, `GoogleMaps_Logo_Gray`-varianten: icke-konturerad, för ljusa/vita ytor per branding-riktlinjerna "use... non-outlined on plain backgrounds"), oförändrad (ingen omfärgning/förvrängning — förbjudet enligt riktlinjerna). `h-4` (16px) matchar logotypens minimihöjd (16dp).
- Placerad vid varje sektion som visar Places-data i både Free- och PremiumReport: Google-betyget i sammanfattningen/poängsektionen (båda rapporterna), Google Business Profile-kortet, Konkurrentanalys (inkl. den låsta gratisteasern) och Recensionsanalys (inkl. den låsta gratisteasern) — Premium.
- **Layout:** header-raderna (`flex items-center justify-between gap-2 mb-5`) har `flex-wrap` så loggan bryter till egen rad i stället för att klippas utanför viewport på smala skärmar (uppmätt 44 px sidscroll vid 390px innan fixet — `document.documentElement.scrollWidth` måste vara lika med `innerWidth`, ingen sidscroll).
- Recensionscitatens författarkreditering (`authorName`/`authorUri` på temat, se "Recensionssvar & recensionsinsikter" ovan) är ett SEPARAT policykrav ("credit the author") och löses i `PremiumReport.tsx` med en länk under varje citat — inte via denna komponent.

### Betalflöde — asynkron finalize (Task 13, `checkout/finalize` + `checkout/status` + `pollScanStatus.ts`)

- **Varför:** paid-scan tar ~100–170 s. Ett synkront finalize-anrop överskrider Cloudflares 100 s-gräns (analyze.pipod.net) och håller kundens anslutning öppen hela tiden.
- **`POST /api/checkout/finalize`** (från `/report?session_id=`): Stripe-verifiering och url/stad-uppslag som tidigare (DB-rad, annars Stripe-metadata → raden återskapas). Finns sparat resultat → `200 { scanResult, fromCache: true }` — samma länk kan alltså öppnas igen utan nytt scan. Annars `claimScan()` → paid-scannet startas som bakgrunds-promise (`runPaidScan`, internt anrop till `/api/enhanced-scan` med `x-internal-scan-token`, `AbortSignal.timeout(SCAN_STALE_MS)`) och svaret är direkt `202 { status: 'running' }`. Succé → `markScanDone()` (`scan_status='done'`, `status='scanned'`); fel/icke-2xx/svar utan `checks` → `markScanFailed()`.
- **`GET /api/checkout/status?session_id=`**: `200 { status: 'done', scanResult } | { status: 'running' | 'failed' | 'pending' }`, `404` okänd session, `400` utan id, `Cache-Control: no-store`. **Medvetet utan rate limit** (`rateLimit.ts`) — bara en SQLite-läsning, pollas upp till 120 gånger.
- **Places-villkoren:** resultatet lagras via `stripPlacesContent()` och båda routes svarar med `rehydrateStoredReport()` (färsk Places-data) — se "Google Places-villkoren" ovan.
- **Kolumner i `checkouts`:** `scan_status` (`pending|running|done|failed`, default `pending`) + `scan_started_at` (ms, försöks-id). Äldre databaser får dem via `ALTER TABLE` i `getDb()`. `deriveScanStatus()`: läsbart resultat = alltid `done` (även gamla rader); `running` äldre än **`SCAN_STALE_MS` = 15 min** → `failed`.
- **Aldrig strandsatt kund:** `claimScan()` är en atomisk UPDATE som bara lyckas utan giltigt resultat och utan färskt `running` → omladdning/två flikar startar aldrig två scans (får 202 och pollar samma körning), medan `failed` eller > 15 min gammalt `running` (processen startades om mitt i) startas om av nästa finalize. `markScanFailed(sessionId, attempt)` rör bara sitt eget försök (ett övertaget försök som dör sent skriver inte över det nya), och `markScanDone()` låter första resultatet vinna.
- **`/report`-sidan:** finalize `202` → `pollScanStatus()` pollar var 5:e s i max 10 min (nätverksfel/5xx/429/trasig JSON/`pending` = fortsätt). `done` → `PremiumReport`; `failed`/`timeout`/`notFound` → felvyn, vars "Försök igen" laddar om sidan → finalize startar om eller återupptar väntan.
- **Railway utan volym:** DB:n raderas vid deploy → pågående scan och sparat resultat försvinner; nästa finalize återskapar raden från Stripe-metadata och scannar om.

### Synthesis Flash-fallback (paid) + time budget (Z3, `synthesisBudget.ts`)

The paid synthesis call uses a **parallel race**: Pro (120s timeout) AND Flash (45s timeout) fire against the same prompt at the same time. Pro is primary; if Pro succeeds within timeout we use Pro. If Pro errors or times out, we use the Flash result which is already complete (~10–15s old). Only if both fail do we return a stub. Cost: ~$0.0015 extra per paid scan; guarantees real synthesis content even when Pro is slow or rate-limited.

**Bounded by a shared time budget:** before Z3, `proPromise`/`flashFallbackPromise` used the generic `callOpenRouter` (`withRetry`, `attempts: 3`, no total-time cap) — on transient errors (429/5xx) Pro alone could retry 3× at its own 120s timeout, up to 360s+ before the Flash fallback was even consulted, pushing a paid scan toward 6 minutes (observed by X2). `route.ts` now calls `callWithDeadline()` (`app/lib/synthesisBudget.ts`) instead of `callOpenRouter` for both promises, passing them the SAME `synthesisDeadline = Date.now() + SYNTHESIS_BUDGET_MS` (150s). Same retry semantics as `callOpenRouter` (permanent 4xx never retried), but every attempt shrinks its timeout to `Math.min(requestedTimeoutMs, deadline - now())`, and a new attempt is refused (throws `budgetExhausted: true`, never retried) once less than `MIN_SYNTHESIS_CALL_MS` (15s) remains. Flash still wins whenever Pro fails — the fallback logic in route.ts is unchanged — it's just bounded by the same deadline, so the whole race settles within ~150s. Report Writer runs in parallel with its own independent 170s budget, so total paid-scan time stays within the documented ~100–170s range (worst case ~170s + collection phase, well under 5 min) instead of being able to balloon past it.

### ScanResult contract (`scanResult.ts`)

The `ScanResult` Zod schema defines:
- `meta` — domain, companyName, city, scanDate, tier
- `checks` — array of exactly 37 `CheckResult` objects (each with key, status, tier, category, finding, fix, priority, weight, + optional richRelevance/richSteps/richCodeExample/richStatus/codeRef)
- `scores` — `{ free: 0-100, full: 0-100, google, googleCount, measured, total }` — `measured`/`total` (mät-täckning, `calculateScores()`) are populated in the `/api/enhanced-scan` response (route.ts) since Z2; the field existed in the schema before that but the API always omitted it, so FreeReport/PremiumReport computed it themselves client-side via `calculateScores(checks)` (still done, now redundant with the API field but harmless).
- `synthesis` — structured synthesis (actionPlan, competitorNote, reviewAnalysis)
- `reviewReplies` — review reply analysis (always `status: 'notMeasured'`, see Audit #3 below)
- `reviewInsights` — optional/nullable grounded review themes (paid-only, see Audit #9 below)
- `competitorComparison` — optional/nullable deterministic comparison against top 3 nearby competitors' own websites (paid-only, see "Konkurrentjämförelse" below); entries carry `placeId`
- `placesRef` — optional `{ placeId, domainMatch, site }` used to rebuild Places content when a stored report is read (see "Google Places-villkoren")

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

### Recensionssvar & recensionsinsikter (Audit #3 + #9, `reviewInsights.ts`)

- **`reviewReplies` (check #34) är alltid `notMeasured` — aldrig ett påstått X %.** Verifierat mot Googles egen dokumentation (`places#Review`): Places API (New) Review-objektet har `name`/`text`/`originalText`/`rating`/`authorAttribution`/`publishTime`/`flagContentUri`/`googleMapsUri`/`visitDate`/`relativePublishTimeDescription` — inget fält för ägarsvar. `analyzeReviewReplies()` (route.ts) räknar därför aldrig `withReply`/en svarsfrekvens; den returnerar bara `total` + en ärlig `finding` ("Google tillhandahåller inte ägarsvar via API:t — kontrollera i Google Business Profile.", eller "Inga recensioner tillgängliga för analys." vid 0 recensioner). Eftersom `isEnrichable()` i Report Writer bara berikar bad/warning-checks försvinner reviewReplies automatiskt ur Åtgärdsplan/Detaljerade lösningar/De 3 viktigaste fynden när den är notMeasured — inget särskilt filter behövs där. Synthesisprompten har en explicit regel mot att Pro nämner en svarsfrekvens i procent.
- **`reviewInsights` (paid-only, `app/lib/reviewInsights.ts`)** — det som faktiskt ÄR mätbart: de riktiga recensionstexterna (max 5, Places API-gränsen). `analyzeReviewInsights()` skickar dem verbatim till Gemini Flash i JSON-läge och ber om `{themes:[{theme,sentiment,quote}], praise, complaints, sampleNote}`. `validateReviewInsights()` kastar varje tema vars `quote` inte är ett exakt substräng-utdrag ur en riktig recensionstext — modellen kan föreslå teman men aldrig hitta på belägg. Returnerar `null` om inga recensionstexter finns eller inget citat gick att verifiera. Körs i paid-flödet parallellt med Pro-syntesen och Report Writer (route.ts). Renderas i `PremiumReport.tsx` sektion 10 ("Recensionsanalys" → "Vad kunderna säger"). PremiumReport visar ALDRIG en svarsfrekvens (fältet `replyRate` finns inte längre), och gratisrapportens låsta recensionssektion lovar teman/beröm/klagomål med ordagranna citat — inte recensionssvar/svarsfrekvens.
- **Kreditering av recensionsförfattaren (Places policy)** — Places policy kräver "You must always credit the author when displaying photos or reviews". Varje tema i `reviewInsights.themes[]` bär därför `authorName`/`authorUri` (nullable, optional — `Review.authorAttribution.displayName`/`.uri`, extraherat i `extractReviewTexts()`). `validateReviewInsights()` slår upp vilken recension citatet kom ifrån (samma exakt-substräng-matchning som validerar citatet) och sätter författaren på temat — modellen väljer aldrig författaren själv. `PremiumReport.tsx` visar namnet som en länk till `authorUri` under varje citat ("— Namn, Google-recension"). Precis som citatet är författarnamn/länk Places-innehåll: `placesContent.ts` strippar dem (`PLACES_CONTENT_FIELDS`) innan en rapport lagras och `rehydratePlacesContent()` sätter tillbaka rätt författare via samma citat-hash-uppslag som redan återställer citatet.

### Konkurrentjämförelse (Audit #9 konkurrentdelen, `competitorComparison.ts`) — paid only

Konkurrentanalysen i premiumrapporten ("Konkurrentanalys", `synthesis.competitorNote` + en tabell) grundas på en riktig jämförelse av konkurrenternas webbplatser på samma kontroller, utan LLM-anrop i själva jämförelsen:
- `selectCompetitorsToScan()` väljer topp 3 (avståndsordning) från `findNearbyCompetitors` som har egen `websiteUri`. Hoppar över plattformar (`PLATFORM_HOSTS`: facebook/instagram/bokadirekt/tripadvisor/foodora/wolt/thefork/google …), samma domän som den scannade sajten och dubbletter per domän; `utm_*`-parametrar och fragment strippas.
- `scanCompetitorSites()` kör `scrapeWebsite` + `scrapeEnhanced` (samma scrapers, via `safeFetch`) parallellt, **25 s tidsgräns per konkurrent** (`COMPETITOR_SCAN_TIMEOUT_MS`), kastar aldrig — misslyckad sajt → `scanned: false`. Startar i route.ts direkt när Nearby-listan finns, i samma parallella fas som Flash-anropen (mätt 3–6 s för tvakanten.se, påverkar inte totaltiden märkbart).
- `evaluateComparisonStatuses()` anropar **`buildCheckResults()` själv** (ingen duplicerad bedömningslogik) med neutrala LLM-/API-indata och plockar ut `COMPARISON_KEYS` (14 st): https, robotsTxt, sitemap, llmsTxt, canonical, ogTags, phone, googleMaps, localBusiness, faqSchema, semanticHtml, h1, title, metaDescription. För de tre som annars bedöms av Flash (ogTags/llmsTxt/faqSchema) används `deterministicTechnicalResult`/`deterministicFaqResult` som följer Flash-promptens REGLER men bara finns/saknas (ingen kvalitetsbedömning). En robots.txt/llms.txt som egentligen är en HTML-sida (soft 404) räknas som saknad. https bedöms på slutlig URL efter redirect.
- **"Ni" bedöms med exakt samma funktion** på redan skrapad data (ingen ny hämtning) → rättvis jämförelse. OBS: för ogTags/llmsTxt/faqSchema kan jämförelsens status därför skilja sig från huvudrapportens Flash-status (t.ex. llms.txt finns = ok här, men Flash kan ha gett warning för innehållet).
- `ScanResult.competitorComparison` (optional/nullable; null i free och när ingen konkurrent har egen sajt): `{ keys, you: {statuses, okCount}, competitors: [{name, website, rating, reviewCount, scanned, statuses, okCount}] }` — `okCount` = antal `ok` bland `keys`; oscannad konkurrent har `statuses: {}` och `okCount: null`.
- **Rendering (Z2, `PremiumReport.tsx` sektion 9):** `CompetitorComparisonTable.tsx` visar en tabell — en rad per `COMPARISON_KEYS`-kontroll, kolumner "Ni" + varje konkurrent, `CheckBadge` per cell, `okCount`/`total` i kolumnrubriken. `buildComparisonRows()`/`competitorCountFromChecks()` (`app/lib/reportDisplay.ts`) är rena hjälpfunktioner (testbara utan DOM). En oscannad konkurrent (`scanned: false`) visas ändå som kolumn med "Kunde inte scannas" i rubriken och "—" i varje rad i stället för badges — aldrig tyst utelämnad. `COMPETITOR_COMPARISON_CHECK_COUNT` (`reportDisplay.ts`) duplicerar `COMPARISON_KEYS.length` som en egen konstant (competitorComparison.ts drar in node-fetch-beroende scraper-moduler som aldrig får nå klientbundlen) — hålls i synk av ett test i `competitorComparison.test.ts`.
- **Gratisrapportens låsta konkurrentsektion (Z2, `FreeReport.tsx`) är en ärlig teaser** — inga längre påhittade konkurrentnamn/betyg (tidigare hårdkodat "Konkurrent A ★4.6"). Visar bara två räknade tal: antal närliggande konkurrenter Google hittade (`competitorCountFromChecks(checks)`, ur check #36:s `data.competitors` — mäts i BÅDA tiers, se route.ts `competitorListPromise`) och `COMPETITOR_COMPARISON_CHECK_COUNT`. Ingen konkurrents namn/betyg visas förrän betalning (fortsatt bakom `LockedSection`s blur+lås).
- `formatComparisonForPrompt()` ger syntesprompten en verifierad sammanfattning: poäng per part, kod-räknade aggregat ("Bara ni …" / "Alla scannade konkurrenter har, men inte ni …"), en rad per kontroll där resultaten skiljer sig ("har: ni, Epoque; saknar: Kometen") och skillnader per konkurrent ("Kometen har FAQ-schema, ni inte."). REGLER förbjuder påståenden om konkurrenters sajter utöver detta, generaliseringar utöver aggregatraderna och sammanslagning av kontroller med olika har/saknar-listor. Loggrad: `[Competitors] N konkurrentsajter på X ms (…)`.

### Directory checker (`directoryChecker.ts`)

- Uses Tavily API (`TAVILY_API_KEY`) — NOT scraping (Eniro/Hitta block scrapers)
- Checks: Eniro, Hitta (Gulasidorna removed)
- NAP extraction from Tavily snippets via regex (handles two-word street names like "Malös gata")
- **Namnmatchning (fix sep 2026):** Tavilys `site:`-sökning kan träffa en helt annan, orelaterad verksamhet — verifierat med tvakanten.se: Eniro och Hitta hittade båda "Tvåkanten AB", men det är ett HELT ANNAT bolag (ett finansbolag, org.nr 5566672027) än restaurangen (verkligt namn "Mialda Restaurang - Rest. Tvåkanten AB", org.nr 556469-2415) — ren namnkollision. `resultMatchesCompany()` filtrerar bort Tavily-träffar vars titel+innehåll inte nämner något signifikant ord ur företagsnamnet (legala suffix som AB/HB/KB ignoreras) INNAN ranking och NAP-extraktion; ingen matchande träff → `found: false`, räknas inte som en listning.
- **NAP-konsistens jämförs mot Google Business Profile, inte bara kataloger mot varandra (fix sep 2026):** tidigare jämförde `buildNAPConsistency()` bara kataloger sinsemellan — två kataloger som råkade vara ENSE om samma FELAKTIGA adress (ovanstående namnkollision) gav `consistent: true` trots att GBP-adressen var en helt annan ("Kungsportsavenyen 27" vs kataloghitens "Maj på Malös gata 40"). `checkSwedishDirectories(companyName, city, sameAsLinks, gbpNap?)` tar nu ett 4:e valfritt argument — route.ts skickar med `{ phone, address }` från `placeFacts(placeForAnalysis)` (Places `nationalPhoneNumber`/`formattedAddress`, redan hämtat innan anropet). När GBP-data finns läggs den FÖRST i värdelistan (referensvärdet alla andra jämförs mot) och räknas med i tröskeln för "tillräckligt många källor" (tidigare krävdes ≥2 kataloger; nu räcker GBP + 1 katalog).
- NAP consistency: normaliserar adresser innan jämförelse — postnummer (3+2 siffror) strippas oavsett om det skrivs med mellanslag ("411 36", GBP:s format) eller utan ("41136", vanligast i katalogextraktion)
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
- **Enhanced scan timeout:** Free ~15–25s, paid ~100–170s (measured 2026-09-14 before Task 12: sprej.nu 165 s, tvakanten.se 133 s; after Task 12 without cache: sprej.nu 131 s, tvakanten.se 105 s; with cached free-scan: sprej.nu 59 s, tvakanten.se 112 s ×2). The cache removes the collection phase, but paid total time is dominated by Report Writer: a Pro batch that hits its timeout (up to 105 s for 3 checks) + Flash fallback pushes it to ~112 s with or without cache. Production on Railway (`robotbyran.com`) has no per-request HTTP timeout. If paid Pro synthesis times out at 120s, the parallel Flash-fallback takes over automatically (see synthesis fallback above).
- **Dev toggle + auto-paid:** `AppShell.tsx` binds `IS_DEV = process.env.NODE_ENV === 'development'`. In dev: paid scan auto-triggers in background after free completes, so toggle is instant. **In production: paid scan only runs if explicitly invoked.** This avoids burning ~$0.35 per public scan. When a payment flow is added it should call `analyzePaid(url, city)` from `useAnalysis` after the purchase confirms. To preview the paid layout without paying, use the `/preview` route (mock data).
- **cityMentioned (#12) search surface:** The scraper strips `<header>`/`<nav>`/`<footer>` before extracting `bodyText`. Cities therefore search a wider haystack: `[title, metaDescription, h1, h2s, bodyText]`. Important so cities written only in title or header/logo area (common pattern) still match. Stad-listan i `SWEDISH_CITIES` är ~50 ord — uppdatera vid behov.
- **PageSpeed Insights (CWV check #10):** Uses `GOOGLE_PLACES_API_KEY` (same key as Places API — PSI must be enabled on the Google Cloud project AND added to the key's API restrictions list). Falls back to `notMeasured` with a 403/timeout finding if the API call fails — never blocks the scan. Prefers CrUX field data over Lighthouse lab data.
- **Competitors check #36:** Uses Places API (New) Nearby Search with the business's `location.latitude/longitude` + `primaryType` (radius 1.5 km, max 6 results, deduped on normalized name). Returns `notMeasured` if no GBP match. The synthesis prompt is given the verified list and instructed to NEVER invent competitor names — when the list is empty it falls back to industry-generic insights. Field mask includes `places.websiteUri` (same Enterprise SKU as rating — no extra cost); in paid the websites are scanned, see "Konkurrentjämförelse" below.
- **sanitizeCodeExample (paid):** Defensive line-based strip in `reportWriter.ts` that removes `<!-- ANPASSA -->`, `<DITT ...>`, `<PLACEHOLDER>` and similar placeholder patterns from Pro's `richCodeExample`. Pro's prompt forbids placeholders but it sometimes ignores the rule. The strip cleans trailing commas, collapses excess newlines, and returns null if nothing substantial remains (UI falls back to `genericCodeTemplate`).
- **Generic fixes coverage:** `app/lib/genericFixes.ts` has hardcoded `steps` + `codeTemplate` for all 29 free-tier checks (43 fix variants, 26 with code templates), **plus `serviceSchema`** (premium-only #24, added sep 2026 as an honest `<PLACEHOLDERS>` fallback — see "dedupeCodeExamples() kräver MASTER_COVERAGE" above). When adding a new check to `CHECK_REGISTRY`, also add a generic fix here for free-tier UX (or, for a premium-only check whose rich content can legitimately be empty, so it never shows a blank code block). Placeholders use the convention `<FÖRETAGSNAMN>`, `<TJÄNST>`, `<STAD>`, `<GATUADRESS>`, `<TELEFONNUMMER>`, `<DOMÄN>`, etc.
- **templateFill.ts (paid) — premium never hides a code block:** Audit sep 2026 found premium customers got an empty "Kod att kopiera" block whenever Report Writer produced no `richCodeExample` for a check and only `genericCodeTemplate` (raw, with `<PLACEHOLDERS>`) was available — `SolutionCard.tsx` hid template-sourced code unconditionally, in both tiers. Fix: `SolutionCard` takes an `unlocked` prop (`PremiumReport` passes `true`, `FreeReport` omits it → free behavior unchanged); when `unlocked`, template-sourced code is shown with a "Mall — ersätt värden inom hakparenteser" badge instead of being hidden. Card priority in premium (`pickSolutionCode()`, `reportDisplay.ts`): `richCodeExample` → `codeRef` reference to the master-schema card (+ delta code if any) → filled template with badge; a card with `codeRef` never shows a template. Server-side, `route.ts` calls `fillTemplate()` on every check's `genericCodeTemplate` (paid tier only, cache hit and miss, after `applyRichData()` and before `groundReport()`) with a lean fact set (`companyName`, `phone`, `streetAddress`, `city`, `postalCode`, `domain`, `url`, `email` — all already available in `reportWriterMeta`). `fillTemplate()` deliberately does NOT fill `<TJÄNST>` (branch word — needs grammatical agreement it can't guarantee) or any free-text placeholder (`<VERKSAMHETSTYP>`, `<ORGNUMMER>`, FAQ questions) — those stay visible placeholders rather than risk a wrong or invented value.
- **Tavily directory check:** Uses `TAVILY_API_KEY`. If missing, directory check returns warning status with empty results. Gulasidorna removed from ACTIVE_CHECK_DIRS — do not add back (rate-limiting issues).
- **AI mention city guard:** Category query is skipped entirely if no city is resolved. Never use "Sverige" as fallback — it produces meaningless national-level results.
- **Places content is never persisted:** never write Places API values (name, address, phone, rating, review count, hours, reviews, types, competitor names/ratings/websites) to SQLite, files or git — only `place_id`. New Places-derived fields in ScanResult must be added to `stripPlacesContent()`/`rehydratePlacesContent()` + `PLACES_CONTENT_FIELDS` (and their tests); new ScanContext fields are excluded from `scan_cache` unless added to the `toCachedContext()` whitelist. See "Google Places-villkoren".
- **Places API reviews:** Returns max 5 reviews per call. The New Places API REST endpoint has no `reviewSort` parameter or pagination — what you get is what you get.
- **Synthesis preamble stripping:** `synthesisRaw.replace(/^[\s\S]*?(##\s)/m, '$1').trim()` — if Pro model doesn't output any `##` heading, synthesis will be empty string. The catch block returns a stub `## Syntesfel` message.
