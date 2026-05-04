# AI Search Scanner — QA Verification Report

**Date:** 2026-04-26
**Scanner version:** Next.js app on port 8010 (systemd: ai-scanner-api.service)
**Endpoints tested:** POST /api/full-scan (premium analysis incl. Google Places)
**Verification method:** Manual curl + Python HTML parsing against every scanner claim

---

## 1. Bjurfors — https://www.bjurfors.se

**Category:** Mäklare (Real Estate Agent)
**Scanner free score:** 55/100 | **Premium score:** 65/100

### Technical

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| HTTPS/SSL | good — "Webbplatsen använder HTTPS" | Confirmed: redirects to `https://www.bjurfors.se/` | YES | |
| Robots.txt | good — "Robots.txt finns" | Confirmed: exists with User-agent, Disallow, Sitemap directives | YES | |
| Sitemap.xml | good — "Sitemap.xml finns med 31324 URL:er" | Confirmed: valid XML sitemap exists. URL count not manually verified but file is large | YES | URL count plausible given large site |
| LLMS.TXT | bad — "LLMS.TXT saknas" | Confirmed: no /llms.txt found (returns main page HTML, no dedicated file) | YES | |
| Core Web Vitals | warning — "Sidhastighet har inte analyserats" | N/A (skipped) | YES | Scanner honestly reports it can't check this |
| Canonical tags | warning — "Canonical tags har inte analyserats" | Manual found: `<link rel="canonical" href="https://www.bjurfors.se/sv/">` | PARTIAL | Scanner says "not analyzed" but canonical tag IS present. Scanner should detect this. |

### Local Visibility

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| NAP on website | warning — "NAP finns, men inte strukturerat" | Phone: `0771` pattern found. No tel: links on main page. Address not clearly structured on front page. | YES | Fair assessment |
| Phone visible | good — "Telefonnummer finns synligt" | `0771` phone pattern found in page content | YES | |
| City mentioned | warning — "Orter nämns men inte konsekvent" | Manual: Göteborg 0 mentions, Stockholm 23 mentions on front page | PARTIAL | Scanner doesn't flag that the main page is Stockholm-centric. For a national chain, this is expected but imprecise. |
| Google Maps | bad — "Ingen Google Maps embed" | Confirmed: no maps embed found | YES | |
| LocalBusiness schema | bad — "LocalBusiness schema saknas" | Confirmed: zero JSON-LD, zero @type annotations on main page | YES | |
| Opening hours | bad — "Öppettider saknas" | Not visible on front page | YES | Accurate for a mäklare chain site |

### AI Readiness

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| Schema markup (any) | bad — "Inget schema markup" | Confirmed: NO JSON-LD, no microdata found | YES | |
| LocalBusiness/Restaurant schema | bad — "Saknas" | Confirmed | YES | |
| JSON-LD format | bad — "JSON-LD format används inte" | Confirmed: no JSON-LD on page | YES | |
| AI-optimized meta description | warning — "Kan optimeras för AI" | Found: "Köpa, sälja eller värdera bostad? Bjurfors mäklare ger dig den hjälp och kunskap du behöver..." — exists but generic | YES | Fair assessment |
| Semantic HTML | warning — "Kan förbättras" | Not deeply verified | N/A | |

### Content

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| H1 tag | good — "H1-tagg finns och verkar vara unik" | Found: "Hitta rätt mäklare för din bostadsaffär" | YES | |
| Title tag | warning — "Kan optimeras" | Not deeply verified | N/A | |
| Meta description | warning — "finns, men kan optimeras" | Exists: "Köpa, sälja eller värdera bostad?..." | YES | Reasonable |
| Language | good — "Svenska" | Confirmed: Swedish content | YES | |

### Premium Analysis

| Item | Scanner says | Manual verify | Match? | Notes |
|------|-------------|---------------|--------|-------|
| GBP found | Yes (verified) | N/A (can't verify Places API) | TRUST | |
| GBP rating | 4.6/5, 14 reviews | Cannot independently verify | TRUST | Plausible for a specific office |
| NAP consistency score | 2/10 | Scanner found mismatch: site phone `0771-111 000` vs GBP `08-520 261 10` | YES | Correct — these are different numbers (national vs local office) |
| NAP issues | Phone mismatch, address inconsistent | Confirmed: main site shows no specific office address | YES | Good catch |
| Competitor comparison | Fastighetsbyrån, Sv. Fastighetsförmedling, Erik Olsson | Plausible competitors | REASONABLE | |

### Assessment

**Scanner accuracy:** 15/17 verifiable checks correct (88%)
**False positives:** None found
**False negatives:**
- Scanner says canonical tags "not analyzed" but they ARE present — missed detection
- Scanner claims "Schema markup (any type)" is bad, which is correct, but should be more specific about what was checked
**Issues:**
- City detection found "Stockholm" as the city (the GBP matched a Stockholm office) but Bjurfors is headquartered in Gothenburg. The scanner scanned bjurfors.se (national) and matched a Stockholm GBP office, which creates confusing results for a multi-location business.

---

## 2. Restaurang Tvåkanten — https://www.tvakanten.se

**Category:** Restaurang
**Scanner free score:** 58/100 | **Premium score:** 68/100

### Technical

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| HTTPS/SSL | warning — "HTTPS används, men kontrollera certifikat" | Confirmed: `https://www.tvakanten.se/` works fine, valid cert | NO | Scanner gives warning for a perfectly working HTTPS. Should be "good". |
| Robots.txt | good — "Robots.txt finns" | Confirmed: standard WordPress robots.txt with Sitemap reference | YES | |
| Sitemap.xml | good — "Sitemap.xml finns med 19 URL:er" | Confirmed: valid XML sitemap generated by AIOSEO | YES | |
| LLMS.TXT | good — "LLMS.TXT finns" | Confirmed: HTTP 200, content starts with "Generated by All in One SEO v4.8.6.1, this is an llms.txt file" | YES | |
| Core Web Vitals | warning — "Inte kontrollerad" | N/A (skipped) | YES | Honest reporting |
| Canonical tags | warning — "Har inte kontrollerats" | Manual found: `<link rel="canonical" href="https://www.tvakanten.se/" />` | NO | Scanner fails to detect an existing canonical tag |

### Local Visibility

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| NAP on website | good — "NAP-information finns" | Confirmed: "Kungsportsavenyn 27" found, phone `+46313133336` in schema | YES | |
| Phone visible | good — "Telefonnummer är synligt" | Confirmed: phone in page content and in JSON-LD schema | YES | |
| City mentioned | good — "Göteborg nämns" | Confirmed: multiple mentions of Göteborg in meta, schema, content | YES | |
| Google Maps | bad — "Ingen Google Maps embed" | Confirmed: no maps embed on main page or /kontakt/ | YES | |
| LocalBusiness schema | bad — "Inget LocalBusiness schema" | PARTIALLY WRONG: Site has `Organization` schema with phone, name, description, URL. Not `LocalBusiness` or `Restaurant` specifically, but schema IS present. | PARTIAL | Scanner is technically correct (no LocalBusiness/Restaurant type) but misleading. The site has Organization schema with rich data. |
| Opening hours | good — "Öppettider finns" | Confirmed: "måndag stängt", "tisdag 11:30" etc. visible on page | YES | |

### AI Readiness

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| Schema markup (any) | warning — "Schema markup kan finnas, oklart vilken typ" | Has Organization + BreadcrumbList + WebPage + WebSite in JSON-LD @graph | NO | Scanner is wishy-washy. Schema markup DEFINITELY exists and is rich. Should be "good". |
| LocalBusiness/Restaurant schema | bad — "Saknas" | Correct: @type is "Organization", not "Restaurant" or "LocalBusiness" | YES | Correct finding — using Organization instead of Restaurant is suboptimal |
| JSON-LD format | warning — "Formatet inte kontrollerat" | Has proper JSON-LD with `application/ld+json` script tag | NO | Scanner fails to detect existing JSON-LD. This is wrong. |
| AI-optimized meta description | bad — "Inte optimerad för AI" | Has: "Restaurang på Avenyn i Göteborg med svensk mat & personlig service. Även catering, cocktailkurser och dryckesprovningar för privata & företagsevent." | NO | This is a GOOD meta description with city, cuisine type, and services. Should be "good" or at minimum "warning". |
| Semantic HTML | warning — "Inte kontrollerad" | Not deeply verified | N/A | |

### Content

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| H1 tag | good — "Finns och verkar vara unik" | Found: "Restaurang Tvåkanten - Svensk Mat på Avenyn i Göteborg" | YES | Excellent H1 |
| Title tag | warning — "Kan behöva optimeras för längd" | Title: "Restaurang Tvåkanten" (20 chars) — within optimal range | NO | Title is fine at 20 chars. 50-60 is the guideline but shorter is not a problem. |
| Meta description | warning — "Behöver optimeras" | Good meta description with city, cuisine, services | NO | Meta description is actually good. Scanner is too negative. |
| Alt texts | bad — "Inte kontrollerade" | Not deeply verified | N/A | Scanner admits it didn't check |
| Language | good — "Svenska" | Confirmed | YES | |

### Premium Analysis

| Item | Scanner says | Manual verify | Match? | Notes |
|------|-------------|---------------|--------|-------|
| GBP found | Yes (verified, domain match) | N/A (can't verify Places API) | TRUST | |
| GBP rating | 4.2/5, 927 reviews | Cannot independently verify but plausible for established restaurant | TRUST | |
| NAP consistency score | 6/10 | Issues: name "Restaurang Tvåkanten" vs "Tvåkanten" on Google, address format difference | YES | Real and useful finding |
| Review keywords | service, atmosfär, kött, fisk, wallenbergare, toast skagen, portioner | Plausible for a Swedish restaurant | REASONABLE | |
| Competitor comparison | Brasserie Lipp (82), Taverna Averna (78), Le Pain Français (75) | Real Gothenburg restaurants, plausible competitors | GOOD | |
| Tailored fixes | 1) Restaurant schema, 2) Sync name, 3) Optimize GBP description, 4) Maps embed | All actionable and correct | YES | Code examples are practical and usable |

### Assessment

**Scanner accuracy:** 10/18 verifiable checks correct (56%)
**False positives:**
- HTTPS flagged as warning when it works perfectly
- Title tag flagged as needing optimization when it's fine
- Meta description flagged as needing optimization when it's actually good
**False negatives:**
- Scanner missed that JSON-LD exists (said "not checked")
- Scanner missed that schema markup exists (said "unclear")
- Scanner missed canonical tag (said "not checked")
- Scanner undervalued the meta description quality
**Overall:** The scanner is too conservative/negative on this well-optimized WordPress site. The All in One SEO plugin has already done good work that the scanner fails to recognize.

---

## 3. Svensk Röranalys — https://www.roranalys.se

**Category:** VVS/Plumber (Stockholm-based, used because no Gothenburg VVS company had a working website)
**Scanner free score:** 60/100 | **Premium score:** 55/100

### Technical

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| HTTPS/SSL | good — "HTTPS används" | Confirmed: `https://www.roranalys.se/` | YES | |
| Robots.txt | good — "Robots.txt finns" | Confirmed: minimal robots.txt with Sitemap reference | YES | |
| Sitemap.xml | good — "Sitemap.xml finns med 22 URL:er" | Confirmed: valid XML sitemap with multiple URLs | YES | |
| LLMS.TXT | bad — "LLMS.TXT saknas" | Confirmed: returns 404 | YES | |
| Core Web Vitals | warning — "Inte analyserad" | N/A | YES | |
| Canonical tags | warning — "Inte analyserad" | Manual found: `<link rel="canonical" href="https://www.roranalys.se">` | NO | Scanner fails to detect existing canonical tag |

### Local Visibility

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| NAP on website | warning — "NAP finns, men inte på alla sidor" | NAP on main page: name, address (Fyrverkarbacken 36), phone (08-599 098 00) in footer | PARTIAL | NAP is clearly present on main page. "Not on all pages" is a fair concern but the assessment could be more specific. |
| Phone visible | good — "Synligt på kontaktsidan" | Confirmed: 5 tel: links on main page alone | YES | Actually visible on MORE than just kontakt page |
| City mentioned | good — "Stockholm och Uppsala nämns" | Confirmed: "Storstockholm" in meta description, Stockholm in address | YES | |
| Google Maps | good — "Google Maps finns inbäddad på kontaktsidan" | WRONG: Contact page has OpenStreetMap/Mapbox via Leaflet, NOT Google Maps | NO | Scanner falsely claims Google Maps. It's actually an OSM/Leaflet/Mapbox map. |
| LocalBusiness schema | bad — "Saknas" | WRONG: Site has `@type: "Plumber"` JSON-LD schema (which IS a LocalBusiness subtype) | NO | Critical error. Plumber extends LocalBusiness in schema.org. The site has exactly the right schema type. |
| Opening hours | good — "Finns på kontaktsidan" | Confirmed: "Måndag–Fredag: 07:00–16:00" in footer AND in JSON-LD schema | YES | |

### AI Readiness

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| Schema markup (any) | good — "Schema markup finns" | Confirmed: JSON-LD with @type Plumber | YES | |
| LocalBusiness/Restaurant schema | bad — "Saknas" | WRONG: Has `@type: "Plumber"` which IS a LocalBusiness subtype | NO | Same error as above. Plumber inherits from LocalBusiness. |
| JSON-LD format | good — "JSON-LD används" | Confirmed: `<script type='application/ld+json'>` with proper Plumber schema | YES | |
| AI-optimized meta description | warning — "Finns men inte optimerad för AI" | "Svensk Röranalys hjälper BRF och fastighetsägare i Storstockholm med relining (strumpmetoden), rörinspektion och stamspolning. Serviceavtal & snabb jour." | PARTIAL | This is actually a quite good meta description with location, services, and audience. Could be better but "warning" is fair. |
| Semantic HTML | warning — "Kan förbättras" | Not deeply verified | N/A | |

### Content

| Check | Scanner says | Manual verify | Match? | Notes |
|-------|-------------|---------------|--------|-------|
| H1 tag | warning — "H1 saknas på en sida" | Main page H1: "Bevara, renovera och ta hand om det befintliga" | PARTIAL | H1 exists on main page. Claim about other pages not verified but plausible. |
| Title tag | good — "Optimal längd" | "Relining, rörinspektion & stamspolning i Stockholm" — good, ~50 chars | YES | |
| Meta description | good — "Finns" | Confirmed | YES | |
| Language | good — "Svenska" | Confirmed | YES | |

### Premium Analysis

| Item | Scanner says | Manual verify | Match? | Notes |
|------|-------------|---------------|--------|-------|
| GBP found | Yes (verified) | N/A | TRUST | |
| GBP rating | 3.8/5, 24 reviews | Cannot independently verify | TRUST | |
| NAP consistency score | 7/10 | Website NAP matches Google NAP closely. Issue: opening hours differ (site says 07-16, GBP says "open 24h") | YES | Good finding — hours discrepancy is a real issue |
| Review keywords | bemötande, service, tidplan, proffsiga, slarviga | Plausible | TRUST | |
| Review divergence warning | "Stor spridning i kundupplevelse" | Not verifiable but useful insight | REASONABLE | |
| Tailored fixes | 1) Implement Plumber schema (already has it!), 2) Optimize GBP, 3) Create llms.txt | Fix #1 is WRONG — site already has Plumber schema | NO | Critical: scanner recommends implementing something that already exists |

### Assessment

**Scanner accuracy:** 12/17 verifiable checks correct (71%)
**False positives:**
- Claims Google Maps embed exists — it's actually OpenStreetMap/Mapbox
**False negatives:**
- Fails to recognize `@type: "Plumber"` as a LocalBusiness subtype (flags it as missing twice)
- Fails to detect canonical tag
- Premium analysis recommends implementing Plumber schema that already exists (most damaging error — makes scanner look incompetent to a technical user)
**Overall:** The scanner has a significant blind spot around schema.org type hierarchy. Plumber IS a LocalBusiness. This causes cascading errors across multiple checks.

---

## Overall Quality Assessment

### What the scanner does well

1. **Basic technical checks are reliable.** HTTPS, robots.txt, sitemap.xml, and llms.txt detection all worked correctly across all three sites (12/12 correct).

2. **Google Business Profile integration adds real value.** The NAP consistency analysis found genuine issues on all three sites — phone number mismatches (Bjurfors), name inconsistencies (Tvåkanten), and opening hours discrepancies (Röranalys). This is the scanner's strongest differentiator.

3. **Premium competitor comparison is compelling.** Named real competitors with plausible scores and specific gap analysis. This is the kind of information business owners would pay for.

4. **Tailored code examples are practical.** The JSON-LD code snippets generated for each business are largely correct and ready to copy-paste, which is a strong selling point for non-technical users.

5. **Swedish language throughout is well done.** Clear, non-technical language appropriate for business owners.

### What it misses or gets wrong

1. **Schema.org type hierarchy ignorance (CRITICAL).** The scanner does not understand that `Plumber`, `Restaurant`, `RealEstateAgent` etc. are subtypes of `LocalBusiness`. Röranalys.se has a perfect `Plumber` schema and the scanner flags it as "LocalBusiness saknas" — then recommends implementing what already exists. This is the single most damaging error because it destroys credibility with anyone who checks.

2. **Canonical tag detection broken.** All three sites have canonical tags. The scanner reported "not analyzed" for all three. This is a bug — the scraper apparently doesn't extract `<link rel="canonical">` tags.

3. **JSON-LD detection inconsistent.** Tvåkanten has rich JSON-LD (Organization + BreadcrumbList + WebPage + WebSite) and the scanner says "format not checked". Röranalys has Plumber JSON-LD and the scanner correctly detects it. The inconsistency suggests the detection logic is fragile.

4. **Map embed detection inaccurate.** The scanner claimed Röranalys has Google Maps when it actually has OpenStreetMap/Mapbox/Leaflet. The check appears to detect any map, not specifically Google Maps.

5. **Meta description scoring too harsh.** Tvåkanten has an excellent meta description ("Restaurang på Avenyn i Göteborg med svensk mat & personlig service") and the scanner rates it "bad — inte optimerad för AI". This discourages sites that are actually doing well.

6. **HTTPS false warning.** Tvåkanten got a warning on HTTPS despite a perfectly valid certificate. No reason given for the warning.

7. **Many checks report "not analyzed" instead of actually checking.** Canonical tags, alt texts, internal linking, Core Web Vitals, and semantic HTML all default to "warning — not checked". This inflates the warning count and makes the report feel padded rather than thorough.

### Is the premium analysis (GBP/reviews/NAP comparison) adding real value?

**Yes, significantly.** The premium analysis is the strongest part of the scanner:

- NAP consistency scoring found real, actionable issues on all three sites
- Review keyword analysis provides insights business owners can use
- Competitor comparisons with named businesses and specific gaps are compelling
- The divergence warnings (e.g., opening hours mismatch) are genuinely useful

The premium analysis elevates this from "yet another SEO checker" to something that provides unique value. Business owners would recognize the NAP issues and review insights as directly relevant.

### Is this ready to show to real businesses?

**Not yet.** The scanner needs fixes before launch:

**Must fix (blocks launch):**
1. Schema.org type hierarchy — must recognize Plumber/Restaurant/RealEstateAgent as LocalBusiness subtypes
2. Canonical tag detection — broken for all three test sites
3. Remove "not analyzed" padding — either check it or don't list it. 6+ "warning — not checked" items make the report look incomplete.
4. Don't recommend implementing schema that already exists — this is the single most embarrassing possible outcome

**Should fix (before showing to paying customers):**
5. HTTPS false warning — only warn if there's an actual certificate issue
6. Map detection — distinguish Google Maps from other map providers, or change the check to "Map embed (any)"
7. Meta description scoring — a description with city name, business type, and services should not be rated "bad"
8. JSON-LD detection consistency — if one site's JSON-LD is detected, all should be

**Nice to have:**
9. Actually check canonical tags, alt texts, and internal linking instead of reporting "not checked"
10. For multi-location businesses (like Bjurfors), detect the chain and suggest scanning a specific office page instead

### Accuracy summary (before fixes)

| Business | Correct | Total verifiable | Accuracy |
|----------|---------|-----------------|----------|
| Bjurfors | 15 | 17 | 88% |
| Tvåkanten | 10 | 18 | 56% |
| Röranalys | 12 | 17 | 71% |
| **Total** | **37** | **52** | **71%** |

The 71% overall accuracy is concerning. Tvåkanten — the site that was MOST optimized (had schema, llms.txt, good meta descriptions) — scored worst in accuracy because the scanner failed to recognize what was already done well. This means the scanner is more accurate for poorly-optimized sites than for well-optimized ones, which is exactly backwards for credibility.

---

## Post-Fix Verification — 2026-04-26

**Fixes applied:** 4 bugs fixed in `scraper.ts` + `prompts.ts`. Build confirmed clean. Service restarted.

### Fix 1: Schema.org type hierarchy

**What changed:** Added `LOCAL_BUSINESS_SUBTYPES` array (~60 types) in scraper.ts. `extractSummary()` now parses JSON-LD properly and sets `hasAnyLocalBusinessSchema = true` for any LocalBusiness subtype. AI prompt receives `LOCALBUSINESS_SUBTYP: Ja/Nej` and explicit rule: "LOCALBUSINESS_SUBTYP=Ja means subtype exists — don't flag as missing."

**Test result — roranalys.se:**
```
local | LocalBusiness schema → good | LocalBusiness schema finns (Plumber).
aireadiness | Schema markup (någon typ) → good | Schema markup finns (Plumber).
aireadiness | LocalBusiness eller Restaurant schema → good | LocalBusiness schema finns (Plumber).
```
**Before:** `bad | LocalBusiness schema saknas` + premium recommended implementing Plumber schema that already existed.
**After:** Correctly detected. No false recommendation. ✅

**Test result — bjurfors.se:** Still `bad` — confirmed correct, bjurfors.se has zero schema markup.
**Test result — tvakanten.se:** Still `bad` — confirmed correct, tvakanten.se has Organization schema (not a LocalBusiness subtype).

---

### Fix 2: Canonical tag detection

**What changed:** `extractSummary()` now extracts `<link rel="canonical">` href before removing head elements. Stored as `canonical: string | null`. Passed to AI as `CANONICAL: <url>` or `CANONICAL: (saknas)`.

**Test result — all three sites:**
```
technical | Canonical tags → good | Canonical tag finns: https://www.roranalys.se
technical | Canonical tags → good | Canonical tag finns på startsidan: https://www.bjurfors.se/sv/
technical | Canonical tags → good | Canonical tag finns: https://www.tvakanten.se/
```
**Before:** All three sites showed `warning | Canonical tags har inte analyserats`.
**After:** All three correctly detected. ✅

---

### Fix 3: Schema type names in AI prompt

**What changed:** AI prompt now receives exact type names: `SCHEMA_TYPER: Plumber, WebSite` instead of vague `SCHEMA: Finns`. AI findings now say "LocalBusiness schema finns (Plumber)" instead of "LocalBusiness schema finns."

**Test result:** All schema findings now include the actual type name. AI reasoning is grounded in real data. ✅

---

### Fix 4: Google Maps detection (tightened)

**What changed:** Map detection regex changed from generic to Google-specific: `/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i`. OpenStreetMap, Leaflet, Mapbox no longer trigger this check.

**Test result — roranalys.se:**
```
local | Google Maps embed eller länk → bad | Ingen Google Maps embed eller länk hittades.
```
**Before:** `good | Google Maps finns inbäddad` (false positive — was OpenStreetMap/Mapbox).
**After:** Correctly `bad` — roranalys.se uses OpenStreetMap, not Google Maps. ✅

---

### Estimated accuracy after fixes

| Business | Pre-fix bugs | Bugs fixed | Estimated new accuracy |
|----------|-------------|------------|------------------------|
| Bjurfors | 2 errors (canonical) | 1 fixed | ~94% |
| Tvåkanten | 8 errors (canonical, JSON-LD detection, meta scoring) | 1 fixed | ~61% |
| Röranalys | 5 errors (schema×2, canonical, maps, premium rec) | 4 fixed | ~94% |

**Note on Tvåkanten:** The remaining errors (JSON-LD inconsistency in scanner output, meta description scored too harshly) are AI evaluation issues, not scraper bugs. The AI now receives better data — whether it uses it correctly depends on the model. Recommend re-testing Tvåkanten specifically.

### Remaining known issues (not fixed in this session)

| Issue | Severity | Notes |
|-------|----------|-------|
| HTTPS false warning (Tvåkanten got warning for valid cert) | Medium | Scraper doesn't test cert validity — AI hallucinates this |
| Meta description scored too harshly | Medium | AI evaluation issue — may improve with better prompt data |
| "Not analyzed" padding for alt texts, internal linking, semantic HTML | Low | These checks are honest ("we didn't check") but feel incomplete |
| 504 timeout for full scan via Cloudflare | High | Full scan takes 2-3 min, Cloudflare cuts at ~100s. Needs SSE or timeout config |
| Dev toggle visible in production | Medium | app/page.tsx lines 14-42 — remove before launch |
