# QA-körning juni 2026 — resultat

**Datum:** 2026-06-10
**Metod:** 4 riktiga sajter scannades (paid tier) och jämfördes mot oberoende, blinda QA-agenter som verifierade var och en av de 36 poängsatta checkarna enligt `VERIFICATION-PROTOCOL.md`. Truth-agenterna kände inte till scannerns resultat.

| Sajt | Typ | Stad (input) | Match |
|------|-----|--------------|-------|
| tvakanten.se | Restaurang | Göteborg | 30/36 |
| roranalys.se | VVS/relining | Stockholm | 26/36 |
| bjurfors.se | Mäklarkedja (nationell) | *(ingen — medvetet)* | 30/36 |
| sprej.nu | Frisörsalong | Sundsvall | 33/36 |
| **Totalt** | | | **119/144 (83 %)** |

> Första körningen (förmiddagen 10 juni) gav bara 92/144 (64 %) — se rotorsak 0 nedan. Gamla scan-filer ligger kvar som `*.scan.old.json`.

---

## Rotorsak 0 — döda Gemini-modell-id:n (FIXAD)

`google/gemini-2.0-flash-001` och `google/gemini-2.0-flash-lite-001` finns inte längre på OpenRouter (`404 No endpoints found`). Alla tre Flash-anropen (technical, FAQ, E-A-T) misslyckades i varje scan → 8 checks × 4 sajter blev `notMeasured` ("Kunde inte analyseras"). `enhanced-scan/route.ts` anropar `callOpenRouter(FLASH_MODEL, …)` direkt utan fallback-kedja, så Mistral-fallbacken i `gemini.ts` hjälpte inte.

**Fix (genomförd + verifierad med riktiga scans):**
- `app/api/enhanced-scan/route.ts:18–19` → `google/gemini-2.5-flash` / `google/gemini-2.5-pro`
- `app/lib/gemini.ts` → FLASH_MODELS/PRO_MODELS uppdaterade; död fallback `anthropic/claude-3.5-sonnet` → `anthropic/claude-sonnet-4.6`
- `app/lib/reportWriter.ts:71` → `google/gemini-2.5-pro`
- CLAUDE.md uppdaterad med varning: verifiera modell-id:n mot `GET https://openrouter.ai/api/v1/models` när "Kunde inte analyseras" dyker upp brett.

---

## Bekräftade scannerbuggar (rotorsak verifierad i kod + mot live-HTML)

> **STATUS 2026-06-10 (em): ALLA FIXADE.** BUG 1–4 nedan plus två följdbuggar som hittades
> under verifieringen (BUG 5–6). Verifierat i två lager: (1) direktanrop mot
> `scrapeWebsite`/`extractSummary` (syntetiskt + live mot tvakanten/roranalys/sprej),
> (2) partiella free-scans via `/api/enhanced-scan` — alla 8 berörda check-statusar
> flippade till `ok`: tvakanten schemaAny/jsonLd/internalLinks/googleMaps,
> roranalys phone/contactInfo, sprej phone/contactInfo.

### BUG 1 — `@graph` packas inte upp vid schema-detektering
**Fil:** `app/lib/scraper.ts:229–246`
**Symptom:** tvakanten `schemaAny` = bad trots att startsidan har JSON-LD (verifierat: 1 684 tecken, `{"@context":…,"@graph":[BreadcrumbList, Organization, WebSite, WebPage]}`).
**Orsak:** @type-extraktionen itererar bara över toppnivå-items. WordPress/Yoast lägger ALLT i `@graph` utan toppnivå-`@type` → `schemaTypes` blir tom → `schemaAny`, `localBusiness`, `localSubtype` blir falskt negativa. Detta drabbar en mycket stor andel av svenska småföretagssajter (Yoast är de facto-standard).
**Fix:** om parsed objekt har `@graph` (array) → iterera över dess items i stället. (faqSchema-checken hanterar redan @graph — samma mönster.)

### BUG 2 — telefon ur JSON-LD parsas från trunkerad kopia
**Fil:** `app/lib/scraper.ts:232` (trunkering) + `373–375` (parse)
**Symptom:** roranalys `phone` = bad trots `"telephone":"08-599 098 00"` i Plumber-schemat.
**Orsak:** `schemaScripts` kapas till 500 tecken/block. Telefon-extraktionen kör `JSON.parse()` på den **kapade** strängen — roranalys block är 1 111 tecken → `Unterminated string` → hela parsen kastas trots att `telephone` ligger på position 326. @type-parsen (rad 234) använder fulltexten; telefon-parsen måste göra detsamma.
**Fix:** extrahera `telephone` från fulltexten innan trunkering (och packa upp `@graph`, se BUG 1 — telephone kan ligga där).

### BUG 3 — telefonregex klarar inte "space-streck-space"
**Fil:** `app/lib/scraper.ts:371`
**Symptom:** sprej `phone`/`contactInfo` = bad trots "060 - 61 45 00" i brödtexten (inom 800-fönstret).
**Orsak:** separatorn `[-\s]?` matchar max ETT tecken — "060 - 61" har tre (" - ").
**Fix:** `[-\s]?` → `\s?-?\s?` eller `[\s-]{0,3}` i alla separatorpositioner.

### BUG 4 — www/naked-host-mismatch nollar internlänkningen (med kaskad)
**Fil:** `app/lib/scraper.ts:305–335`
**Symptom:** tvakanten `internalLinks` = "0 unika sidor" trots 20 interna länkar.
**Orsak:** input-URL:en var `https://tvakanten.se`; sajten 301-redirectar till `https://www.tvakanten.se/` och alla länkar i HTML är absoluta mot `www.`-värden. Jämförelsen `parsed.hostname === pageHostname` använder **input-värden** → 0 träffar.
**Kaskad:** när länklistan är tom väljs undersidor sämre → `googleMaps` (bad, men inbäddning finns på `/hitta-till-oss/` enligt truth) och sannolikt `faqSchema`-missen på bjurfors (`/sv/faq/` skannades inte) delar denna rotorsak.
**Fix:** använd slutlig URL efter redirect (response.url) som hostname-källa, och/eller normalisera bort `www.` på båda sidor av jämförelsen.

### BUG 5 — CDATA i sitemap-`<loc>` ger ogiltiga URL:er *(hittad under fixverifieringen)*
**Fil:** `app/lib/scraper.ts` (loc-parsningen i `scrapeWebsite`)
**Symptom:** tvakanten fick 0 undersidor även efter BUG 4-fixen.
**Orsak:** All in One SEO (och fler sitemap-pluginer) wrappar URL:er i `<![CDATA[...]]>`. Scannerns regex behöll wrappern → `new URL()` kastade → alla poster filtrerades bort.
**Fix:** strippa `<![CDATA[` / `]]>` innan URL-parsning.

### BUG 6 — undersidor hämtas med avskalad User-Agent → WAF-block *(hittad under fixverifieringen)*
**Fil:** `app/lib/scraper.ts` (extra-sidehämtningen)
**Symptom:** tvakantens undersidor svarade 466 (WAF) trots att huvudsidan gick bra.
**Orsak:** undersidehämtningen overridade headers med bara `User-Agent: Mozilla/5.0` i stället för de fulla `BROWSER_HEADERS` som huvudsidan använder — naken UA triggar WAF:ar.
**Fix:** ta bort overriden så alla sidor hämtas med samma browser-headers.

### Semantikförbättring — telefon söks i hela sidtexten
Telefonregexen körs nu på **hela** den strippade sidtexten i stället för det 800-tecken-kapade `bodyText` (kapningen finns bara för AI-promptens skull; regexen går aldrig till AI:n). Detta gjorde att sprejs nummer på textposition 1 272 hittas. `VERIFICATION-PROTOCOL.md` §phone är uppdaterad.

---

## Miljö-/infraproblem (ej kodfel i checklogiken)

- **PSI-dagskvoten är slut** på Google Cloud-projektet (`project_number:583797351490` → HTTP 429 "Queries per day"). `cwv` har varit `notMeasured` i samtliga 8 scans i dag — kvoten behöver höjas/verifieras i Cloud Console. Dessutom är `getCwvMetrics`-timeouten 12 s (`pageSpeed.ts:45`), vilket är snålt för Lighthouse-fallet; överväg ~30 s (PSI körs parallellt med AI-anropen i paid-scans, så det kostar ingen total-latens där).
- **Transient Flash-JSON-fel:** sprejs första omkörning fick "Kunde inte tolka AI-svaret som JSON" i EAT-batchen; omkörning gav rent resultat. Enstaka — men en retry på JSON-parse-fel i `callOpenRouter` vore billig försäkring.

---

## Kvarvarande avvikelser — klassificering (25 st)

### Förklaras av bekräftade buggar (7)
| Sajt | Check | Bugg |
|------|-------|------|
| tvakanten | schemaAny | BUG 1 |
| tvakanten | internalLinks | BUG 4 |
| tvakanten | googleMaps | BUG 4 (kaskad) |
| roranalys | phone | BUG 2 (+ nummer på pos 1 087 i bodyText, utanför 800-gränsen) |
| roranalys | contactInfo | BUG 2/3 (följdfel av phone) |
| sprej | contactInfo | BUG 3 |
| bjurfors | faqSchema | BUG 4-kaskad (sannolik — `/sv/faq/` skannades ej; verifiera efter fix) |

### Flash-bedömning för hård: `bad` där protokollet säger `warning` (5)
eatSignals (tvakanten, roranalys, bjurfors), faqSchema (roranalys — accordion-FAQ i HTML missades), contentDepth (roranalys — `/blogg` finns men Flash sa "saknar blogg"). Mönster: Flash sätter `bad` när 1–2 signaler saknas i stället för `warning`. Åtgärd: skärp verdict-trösklarna i Flash-prompterna (samma trösklar som i VERIFICATION-PROTOCOL.md).

### Kända begränsningar — dokumenterade i protokollet, inga kodfel (6)
| Sajt | Check | Begränsning |
|------|-------|-------------|
| tvakanten, roranalys | directories | Gränsfall: profil finns under bolagsnamn ≠ varumärke ("Mialda Restaurang") |
| roranalys, bjurfors | napConsistency | Tavily-snippets ger <2 extraherbara NAP-källor; truth fann via webbläsning faktiska inkonsekvenser scannern inte ser |
| bjurfors | aiMentions | Ingen stad → kategoritest hoppas över (by design). Kedja utan stad-input är ett strukturellt problem, se nedan |
| sprej | internalLinks | Enpagesajt med ankarlänkar — scanner 0, truth bedömde generöst warning |

### Truth-agenten fel / scannern hade bättre data (4)
roranalys `openingHours` + `reviewReplies`, bjurfors `reviewReplies` (Places API ger data agenten inte når via HTTP; truth-confidence var low), sprej `aiMentions` (gränsfall: GPT-4o-mini-entitetssvaret kan vara bluff — scanner warning, truth bad; svårt att avgöra objektivt).

### Behöver vidare undersökning (3)
- **roranalys `competitors` = notMeasured** trots att gbpData=ok och openingHours hämtades från GBP — `location`/`primaryType` verkar saknas i Place Details-svaret för just denna profil. Undersök `places.ts`.
- **bjurfors `contactInfo` = good** men truth (high conf) säger att första 800 tecknen brödtext saknar kontaktsignaler — möjligen olika HTML-varianter (cookiebanner/geo) eller ordet "kontakt" i scannerns fönster. Logga bodyText vid scan för att avgöra.
- **tvakanten `hreflang` = notMeasured** men sajten har EN-sidor + språkväxlare — växlaren ligger sannolikt i nav som strippas innan Flash-analysen.

---

## Strukturellt fynd — kedjeföretag utan stad

bjurfors.se scannades medvetet utan stad. Resultat: Places Text Search matchade **fel kontor båda gångerna** — först Bjurfors Costa Blanca (Spanien! `meta.city` blev "Orihuela" via postnummer-regexen), i omkörningen Bjurfors Kungälv (3,5/5, 4 recensioner) i stället för HQ Göteborg (3,1, 27 recensioner). Konsekvens: gbpData/reviewReplies/competitors mäter ett godtyckligt kontor och aiMentions tappar kategoritestet. För nationella kedjor bör UI:t antingen kräva stad eller scannern flagga "flera kontor hittade — ange stad".

---

## Övrigt åtgärdat under körningen

- `checkBuilder.ts:443`: "Inga oppettider tillgangliga (krav …)" → "Inga öppettider tillgängliga (kräver …)" (å/ä/ö-regeln).
- `sprej.truth.premium.json` saknades efter sessionsavbrottet — skapad via ny blind agent.

## Rekommenderad åtgärdsordning

1. **BUG 1 (@graph)** — störst träffyta (alla Yoast/WordPress-sajter), liten fix
2. **BUG 4 (host-mismatch)** — nollar tre checks per drabbad sajt, liten fix
3. **BUG 2 + 3 (telefon)** — phone/contactInfo är säljkritiska checks i gratisrapporten
4. PSI-kvot i Cloud Console + timeout 12→30 s
5. Flash-promptkalibrering bad/warning (eatSignals, faqSchema, contentDepth)
6. Kedjeföretags-UX (kräv stad vid flera kontor)
