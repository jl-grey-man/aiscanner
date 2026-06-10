# Verifieringsprotokoll — manuell QA av scannerns 37 checks

Detta protokoll följs av blinda QA-agenter som manuellt verifierar var och en av AI Search Scanners
37 checks mot en riktig webbplats. Agenten känner INTE till scannerns resultat — den gör en egen
oberoende bedömning enligt exakt samma kriterier som koden använder.

## Gemensamma regler

### 1. Grundregel: du bedömer vad en AI-SÖKMOTOR ser
- All verifiering sker med **ren HTTP-fetch utan JavaScript-rendering** (curl / WebFetch).
  AI-crawlers (GPTBot, PerplexityBot, ClaudeBot) kör inte JS.
- Om innehåll (telefonnummer, schema, text) bara finns efter JS-rendering → det **syns inte**
  och ska bedömas som saknat.
- Scannern hämtar **startsidan + upp till 4 undersidor** (kontakt, om oss, tjänster/meny, boka,
  hitta hit — valda från sitemap eller interna länkar). Checks markerade "endast startsidan"
  nedan bedöms ENBART på startsidans HTML.
- Scannerns `bodyText` är hårt kapad till **800 tecken** efter att `<script> <style> <nav>
  <footer> <header> <aside> <iframe> <noscript>` strippats. Checks som söker i brödtext ser alltså
  bara de första ~800 tecknen av synlig text.

### 2. Svarsformat
Returnera en JSON-array med exakt ett objekt per verifierad check:

```json
[
  {
    "key": "https",
    "verdict": "good" | "warning" | "bad" | "notMeasured",
    "evidence": "1-2 meningar med konkret bevis — citat, URL eller HTTP-status.",
    "confidence": "high" | "medium" | "low"
  }
]
```

Obs: `verdict: "good"` motsvarar scannerns status `ok`. Check #37 (synthesis) rapporteras
som `notMeasured` (scannern sätter `notApplicable` — den poängsätts aldrig).

### 3. Var konservativ
Om du inte kan avgöra → sätt verdict enligt vad scannern skulle ge vid samma osäkerhet
(oftast `notMeasured` eller `warning`, se varje checks verdict-mappning) och `confidence: "low"`.
Gissa aldrig åt det positiva hållet.

---

## A. Technical (check 1–10)

### https — HTTPS
- **Scannern mäter:** om den scannade URL:en använder `https://`-schema (SSL-certifikat finns).
- **Så verifierar du:** `curl -sI https://<domän>/` — verifiera HTTP 200 (eller 30x till annan
  https-URL) utan certifikatfel. Testa även `curl -sI http://<domän>/` och se om den redirectar
  till https.
- **Verdict-mappning:** good = sajten serveras över fungerande HTTPS. bad = endast HTTP eller
  certifikatfel. (Aldrig warning/notMeasured.)

### robotsTxt — Robots.txt
- **Scannern mäter:** att `GET https://<domän>/robots.txt` svarar HTTP 2xx med icke-tomt innehåll
  (whitespace räknas inte).
- **Så verifierar du:** `curl -s -o /dev/null -w "%{http_code}" https://<domän>/robots.txt` +
  hämta innehållet. OBS: vissa sajter svarar 200 med en HTML-felsida — det räknas som "finns"
  av scannern (icke-tom body räcker).
- **Verdict-mappning:** good = 2xx + icke-tom body. bad = 404/fel eller tom fil.
  (Aldrig warning/notMeasured.)

### aiCrawlers — AI-crawler-blockering
- **Scannern mäter:** om robots.txt blockerar någon av: GPTBot, CCBot, Google-Extended,
  anthropic-ai, ClaudeBot, PerplexityBot, Bytespider, OAI-SearchBot, ChatGPT-User, cohere-ai,
  Applebot-Extended, FacebookBot, meta-externalagent. Block = `User-agent: <crawler>` följt av
  `Disallow:` med icke-tom path (`/` = fullblock). Tom `Disallow:` = tillåt. Gemini Flash sätter
  slutstatus utifrån listan.
- **Så verifierar du:** hämta robots.txt och gå igenom varje User-agent-block. Notera vilka av de
  13 crawlrarna som har en Disallow-rad, och om pathen är `/` (full blockering) eller partiell.
- **Verdict-mappning:** good = ingen av de 13 blockeras. bad = viktiga crawlers (GPTBot,
  PerplexityBot, ClaudeBot, OAI-SearchBot) fullblockerade. warning = partiella blockeringar eller
  endast mindre viktiga crawlers. notMeasured om robots.txt inte kunde hämtas.

### sitemap — Sitemap.xml
- **Scannern mäter:** att `GET /sitemap.xml` svarar och innehåller minst en `<url>`-tagg
  (räknar förekomster av exakt `<url>`).
- **Så verifierar du:** `curl -s https://<domän>/sitemap.xml | grep -c "<url>"`. VIKTIGT: en
  sitemap-INDEX (`<sitemapindex>` med `<sitemap>`-poster, inga `<url>`-taggar) ger 0 träffar →
  scannern bedömer den som saknad/tom. Rapportera detta som bad med evidence om att det är en
  indexfil, confidence medium.
- **Verdict-mappning:** good = `<url>`-taggar ≥ 1. bad = 404, tom, eller sitemap-index utan
  `<url>`-taggar. (Aldrig warning/notMeasured.)

### llmsTxt — llms.txt
- **Scannern mäter:** att `GET /llms.txt` finns; Gemini Flash bedömer kvaliteten på innehållet
  (struktur, beskrivning av sajten, länkar).
- **Så verifierar du:** `curl -s -w "%{http_code}" https://<domän>/llms.txt`. Om 200: bedöm om
  filen är välstrukturerad markdown med rubrik, beskrivning och relevanta länkar. OBS: 200 med
  HTML-felsida (SPA-fallback) räknas som att filen INTE är en riktig llms.txt.
- **Verdict-mappning:** good = finns och välstrukturerad. warning = finns men saknar viktigt
  innehåll. bad = saknas helt. notMeasured om AI-analysen inte kunde köras.

### canonical — Canonical-tagg
- **Scannern mäter:** att startsidans rå-HTML innehåller `<link rel="canonical" href="...">`
  (extraheras före all annan bearbetning). Endast startsidan.
- **Så verifierar du:** `curl -s https://<domän>/ | grep -io '<link[^>]*rel="canonical"[^>]*>'`.
  Måste finnas i serverns HTML-svar — canonical injicerad via JS räknas inte.
- **Verdict-mappning:** good = taggen finns med href. warning = saknas. (Aldrig bad —
  detta är scannerns mildaste tekniska check.)

### ogTags — Open Graph-taggar
- **Scannern mäter:** förekomst av `og:title`, `og:description`, `og:image` som
  `<meta property="og:...">` i startsidans HTML. Gemini Flash sätter status.
- **Så verifierar du:** `curl -s https://<domän>/ | grep -io 'property="og:[a-z:]*"'` och
  kontrollera vilka av de tre som finns med icke-tomt `content`.
- **Verdict-mappning:** good = alla tre finns. warning = någon saknas. bad = alla saknas.
  notMeasured om AI-analysen inte kunde köras.

### socialPresence — Social närvaro / sameAs
- **Scannern mäter:** unika sociala plattformar via `<a href>` och `<meta content>` på startsidan
  (instagram, facebook, linkedin, twitter/x, youtube, tiktok, pinterest, threads, bsky, mastodon,
  tripadvisor, yelp, trustpilot) + `sameAs`-länkar i JSON-LD. Flash sätter status.
- **Så verifierar du:** hämta startsidans HTML, lista alla länkar/meta-content som matchar
  plattformsdomänerna ovan + alla `sameAs`-värden i `application/ld+json`-block. Räkna unika
  PLATTFORMAR (inte länkar).
- **Verdict-mappning:** good = 3+ plattformar. warning = 1–2. bad = 0.
  notMeasured om AI-analysen inte kunde köras.

### hreflang — hreflang-taggar
- **Scannern mäter:** `<link rel="alternate" hreflang="...">`-taggar i startsidans HTML.
  Flash bedömer: behövs de (flerspråkig sajt?) och är implementationen korrekt?
- **Så verifierar du:** `curl -s https://<domän>/ | grep -io 'hreflang="[^"]*"'`. Avgör först om
  sajten är flerspråkig (finns /en/-sidor, språkväxlare i HTML?). Enspråkig sajt utan taggar är
  helt OK.
- **Verdict-mappning:** notMeasured (scannerns `notApplicable`) = sajten har bara ett språk.
  good = flerspråkig med korrekta, ömsesidiga hreflang-taggar. warning/bad = flerspråkig med
  felaktiga eller saknade taggar.

### cwv — Sidhastighet / Core Web Vitals
- **Scannern mäter:** PSI (mobil): LCP, CLS, INP. CrUX-fältdata föredras, annars Lighthouse-labb.
  Gränser: LCP good ≤2,5 s / poor >4,0 s; CLS good ≤0,1 / poor >0,25; INP good ≤200 ms / poor
  >500 ms.
- **Så verifierar du:** kör PSI:s publika API eller https://pagespeed.web.dev/ mot startsidan,
  strategi MOBILE. Notera käll-typ (fält vs labb) och klassa varje mått mot gränserna ovan.
- **Verdict-mappning:** good = alla mätta mått "good". warning = inget "poor" och max ett mått
  i "needs improvement". bad = övriga fall (≥1 poor eller ≥2 ni). notMeasured = PSI svarar inte
  eller returnerar ingen data.

---

## B. Local (check 11–17)

### phone — Telefonnummer synligt
- **Scannern mäter:** svenskt telefonnummer via regex `(?:\+46|0)\s?\d{1,3}[\s-]{0,3}\d{2,3}...`
  (separatorer som " - " tillåts) i **hela** startsidans strippade text (header/nav/footer
  strippade — 800-gränsen gäller bara AI-prompten, inte telefonsökningen) ELLER `telephone`-fält
  i JSON-LD (inkl. inuti `@graph`). Endast startsidan. *(Uppdaterad 2026-06-10 — tidigare söktes
  bara de första 800 tecknen och @graph/trunkerade scheman missades.)*
- **Så verifierar du:** hämta startsidans HTML utan JS. Leta svenskt nummer i synlig brödtext
  (kom ihåg: header/footer räknas INTE) samt `"telephone"` i `application/ld+json` (även i
  `@graph`). Nummer som bild, i JS-variabler eller bara i header/footer = syns inte.
- **Verdict-mappning:** good = minst ett nummer hittat i brödtext eller JSON-LD.
  bad = inget hittat. (Aldrig warning/notMeasured.)

### cityMentioned — Stad nämns
- **Scannern mäter:** att någon av ~50 svenska städer (Stockholm, Göteborg, Malmö, Uppsala, …
  ned till Alingsås) förekommer i startsidans `title + metaDescription + h1 + h2:or (max 3) +
  bodyText (800 tecken)`. Case-insensitive, ordgräns (matchar inte inuti andra ord).
- **Så verifierar du:** extrahera dessa fält ur startsidans rå-HTML och sök efter stadsnamn.
  OBS: stad som ENDAST står i header/footer/nav (utanför title/h1/h2) räknas inte. Små orter
  utanför listan (t.ex. Kungsbacka) räknas inte heller — då är verdict bad enligt scannern.
- **Verdict-mappning:** good = minst en stad ur listan hittad. bad = ingen.
  (Aldrig warning/notMeasured.)

### googleMaps — Google Maps-inbäddning
- **Scannern mäter:** regex `/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i` mot iframe-src
  eller rå-HTML på NÅGON av de skannade sidorna (startsida + upp till 4 undersidor).
  OpenStreetMap/Mapbox räknas INTE.
- **Så verifierar du:** hämta startsidan + kontaktsidan (och ev. "hitta hit"-sida) utan JS och
  grep:a efter mönstret. Kartor som laddas via JS-API utan att URL:en finns i HTML = syns inte.
- **Verdict-mappning:** good = mönstret hittat på någon sida. bad = inte hittat.
  (Aldrig warning/notMeasured.)

### localBusiness — LocalBusiness-schema
- **Scannern mäter:** att startsidans JSON-LD innehåller `@type` som matchar `LocalBusiness`
  eller någon av ~60 subtyper (Restaurant, Plumber, Dentist, RealEstateAgent, Store, Hotel, …).
  Matchning: gemener + substring mot whitelist. Endast startsidan. Typer inuti `@graph`
  räknas (sedan 2026-06-10).
- **Så verifierar du:** extrahera alla `<script type="application/ld+json">` ur startsidans
  rå-HTML, parsa och lista `@type`-värden (inkl. arrayer). `Organization` eller `WebSite` räcker
  INTE — det måste vara LocalBusiness eller en subtyp.
- **Verdict-mappning:** good = LocalBusiness/subtyp finns på startsidan. bad = saknas
  (även om det finns på en undersida!). (Aldrig warning/notMeasured.)

### directories — Katalogregistrering
- **Scannern mäter:** om företaget finns på Eniro och Hitta — via `sameAs`-länkar i JSON-LD
  eller Tavily-sökning `site:eniro.se "<företagsnamn>" <stad>` (rena kart-/sökträffar utan
  firmasida räknas inte).
- **Så verifierar du:** WebSearch `site:eniro.se "<företagsnamn>" <stad>` och
  `site:hitta.se "<företagsnamn>" <stad>`. En riktig profilsida (eniro.se/...firma...,
  hitta.se/foretag/...) = hittad. Kolla även sameAs i sajtens JSON-LD.
- **Verdict-mappning:** good = hittad på båda (2/2), med konsekvent eller ej jämförbar NAP.
  warning = hittad på exakt 1, ELLER på 2 men med inkonsekvent NAP. bad = hittad på 0.

### napConsistency — NAP-konsistens
- **Scannern mäter:** jämför telefon + adress extraherade ur Tavily-snippets från minst 2
  kataloger. Telefon normaliseras (mellanslag/bindestreck bort, +46→0); adress normaliseras
  (gemener, 5-siffrigt postnummer strippas). Alla värden måste vara identiska efter normalisering.
- **Så verifierar du:** från katalogprofilerna i föregående check: notera telefonnummer och adress
  på Eniro respektive Hitta. Normalisera enligt ovan och jämför. Jämför gärna även mot sajtens
  egna uppgifter (informativt, påverkar inte verdict).
- **Verdict-mappning:** good = ≥2 kataloger med data och allt konsekvent. bad = inkonsekvens i
  telefon eller adress. notMeasured = färre än 2 kataloger med extraherbar NAP-data.

### openingHours — Öppettider
- **Scannern mäter:** att företagets Google Business Profile har `regularOpeningHours.
  weekdayDescriptions` (via Places API). INTE sajtens egna öppettider.
- **Så verifierar du:** WebSearch `"<företagsnamn>" <stad> öppettider` / sök på Google Maps och
  kontrollera om GBP-kortet visar öppettider per veckodag.
- **Verdict-mappning:** good = GBP har öppettider. notMeasured = GBP saknas eller saknar
  öppettider. (Aldrig warning/bad — checken straffar inte, den exkluderas bara ur poängen.)

---

## C. AI-readiness (check 18–26)

### schemaAny — Schema markup (någon typ)
- **Scannern mäter:** att startsidans JSON-LD innehåller minst en parsebar `@type`
  (vilken typ som helst — Organization, WebSite, BreadcrumbList räcker). Endast startsidan.
- **Så verifierar du:** extrahera `application/ld+json`-block ur startsidans rå-HTML, parsa,
  lista `@type`-värden. Microdata/RDFa utan JSON-LD räknas INTE.
- **Verdict-mappning:** good = minst en @type. bad = inga. (Aldrig warning/notMeasured.)

### localSubtype — LocalBusiness-subtyp
- **Scannern mäter:** SAMMA flagga som #14 (`hasAnyLocalBusinessSchema` på startsidan) — i
  praktiken identisk semantik: LocalBusiness eller subtyp i startsidans JSON-LD.
- **Så verifierar du:** samma evidens som #14. Ditt verdict här ska följa #14:s verdict.
  (Etiketten antyder "specifik subtyp" men koden skiljer inte på generisk LocalBusiness och
  subtyp.)
- **Verdict-mappning:** good = LocalBusiness/subtyp finns. bad = saknas.
  (Aldrig warning/notMeasured.)

### jsonLd — JSON-LD format
- **Scannern mäter:** antal `<script type="application/ld+json">`-block med >10 tecken innehåll
  på startsidan.
- **Så verifierar du:** `curl -s https://<domän>/ | grep -c 'application/ld+json'`. Blocket
  behöver inte vara giltig JSON för att räknas — bara existera med innehåll.
- **Verdict-mappning:** good = ≥1 block. bad = 0. (Aldrig warning/notMeasured.)

### metaTags — Meta-taggar
- **Scannern mäter:** att startsidan har både `<title>` (icke-tom) och
  `<meta name="description">` (icke-tom).
- **Så verifierar du:** extrahera båda ur startsidans rå-HTML.
- **Verdict-mappning:** good = båda finns. warning = exakt en finns. bad = ingen finns.

### faqSchema — FAQ-schema
- **Scannern mäter:** `FAQPage`-schema i JSON-LD på NÅGON skannad sida (scraper-override → ok),
  annars Flash-bedömning: finns FAQ-innehåll i HTML (dl/dt, details/summary, class/id med "faq",
  accordion) utan schema?
- **Så verifierar du:** hämta startsidan + trolig FAQ-sida (/faq, /vanliga-fragor) utan JS.
  Sök `"@type": "FAQPage"` i JSON-LD (även inuti `@graph`). Om inget schema: leta synligt
  FAQ-innehåll i HTML.
- **Verdict-mappning:** good = FAQPage-schema finns (med frågor). warning = FAQ-innehåll i HTML
  men schema saknas. bad = inget FAQ alls. notMeasured om analysen inte kunde köras.

### contentDepth — Innehållsdjup
- **Scannern mäter:** antal URL:er i sitemap.xml (`<loc>`-taggar) + om någon URL matchar
  `/(blogg|blog|guide|guides|tips|nyheter|news|artikel|articles)/`. Flash sätter status enligt
  trösklarna nedan.
- **Så verifierar du:** `curl -s https://<domän>/sitemap.xml | grep -c "<loc>"` + grep efter
  blogg-mönstren. Saknas sitemap → bedöm grovt antal sidor via interna länkar.
- **Verdict-mappning:** good = 50+ sidor och blogg/guide-sektion. warning = 10–50 sidor, eller
  blogg utan schema. bad = <10 sidor utan blogg. notMeasured om analysen inte kunde köras.

### serviceSchema — Service/Product/Menu-schema
- **Scannern mäter:** JSON-LD med `Service`, `ProfessionalService`, `Product`, `Offer`, `Menu`/
  `MenuItem` (eller service-subtyper som PlumbingService, BeautySalon, MovingCompany m.fl.) på
  NÅGON skannad sida (scraper-override → ok), annars Flash-bedömning.
- **Så verifierar du:** sök i JSON-LD på startsidan + tjänste-/menysidan efter dessa @type-värden
  (även i `@graph`).
- **Verdict-mappning:** good = Service/Product/Menu-schema finns. warning = delvis (t.ex. tjänster
  beskrivs i text men schema saknas delvis). bad = saknas helt. notMeasured om analysen inte
  kunde köras.

### eatSignals — E-A-T-signaler
- **Scannern mäter:** fyra signaler: (1) Om oss-sida (URL-path matchar om-oss/about på skannade
  sidor), (2) organisationsnummer `\d{6}-\d{4}` i brödtext, (3) certifieringsord (auktoriserad,
  certifierad, legitimerad, godkänd, ISO, behörig, riksförbund — ordgräns), (4) Person-/
  Organization-schema med namngivna personer. Flash bedömer, scraper korrigerar falska "saknas".
- **Så verifierar du:** hämta startsidan + om oss-sidan utan JS. Bocka av varje signal med citat.
- **Verdict-mappning:** good = Om oss-sida + org.nr + minst en certifiering/namngiven person.
  warning = delvis (1–2 signaler saknas). bad = mycket svaga signaler (≥3 saknas).
  notMeasured om analysen inte kunde köras.

### semanticHtml — Semantisk HTML
- **Scannern mäter:** förekomst av `<main>`, `<nav>`, `<article>`, `<section>`, `<aside>` i
  startsidans rå-HTML (före strippning).
- **Så verifierar du:** `curl -s https://<domän>/ | grep -oE '<(main|nav|article|section|aside)[ >]' | sort | uniq -c`.
- **Verdict-mappning:** good = både `<main>` OCH `<nav>` finns. warning = minst ett av de fem
  elementen finns men main eller nav saknas. bad = inga semantiska element alls.
  notMeasured om sidan inte kunde analyseras.

---

## D. Content (check 27–32)

### h1 — H1-rubrik
- **Scannern mäter:** att startsidans första `<h1>` har icke-tom text i rå-HTML.
- **Så verifierar du:** `curl -s https://<domän>/` och extrahera första `<h1>`. JS-renderade
  rubriker (tom h1 i HTML som fylls av React) = saknas.
- **Verdict-mappning:** good = h1 med text finns. bad = saknas/tom. (Aldrig warning/notMeasured.)

### title — Title-tagg
- **Scannern mäter:** att startsidan har `<title>` med icke-tom text.
- **Så verifierar du:** extrahera `<title>` ur rå-HTML.
- **Verdict-mappning:** good = finns. bad = saknas/tom. (Aldrig warning/notMeasured.)

### metaDescription — Metabeskrivning
- **Scannern mäter:** att startsidan har `<meta name="description">` med icke-tomt content.
- **Så verifierar du:** extrahera ur rå-HTML. `og:description` räknas INTE — det måste vara
  `name="description"`.
- **Verdict-mappning:** good = finns. bad = saknas/tom. (Aldrig warning/notMeasured.)

### contactInfo — Kontaktinfo
- **Scannern mäter:** på startsidan: telefonnummer hittat (se #11) ELLER e-postadress (regex) i
  bodyText ELLER något av orden kontakt/contact/telefon/tel i bodyText (800 tecken, utan
  header/nav/footer).
- **Så verifierar du:** granska startsidans brödtext (första ~800 synliga tecken) efter nummer,
  e-post eller kontakt-ord. Mycket generös check — ordet "kontakt" i en länktext i brödtexten
  räcker (men länkar i nav/footer strippas).
- **Verdict-mappning:** good = någon signal hittad. bad = ingen. (Aldrig warning/notMeasured.)

### altTexts — Alt-texter på bilder
- **Scannern mäter:** andel `<img>` på startsidan med icke-tomt `alt`-attribut.
  0 bilder → ok ("inget att bedöma").
- **Så verifierar du:** räkna alla `<img>`-taggar i startsidans rå-HTML och hur många som har
  `alt="..."` med innehåll (tomt `alt=""` räknas som saknat). Beräkna procent.
- **Verdict-mappning:** good = ≥80 % (eller 0 bilder). warning = 50–79 %. bad = <50 %.
  notMeasured om sidan inte kunde analyseras.

### internalLinks — Internlänkning
- **Scannern mäter:** antal UNIKA interna sökvägar (samma värd — `www.` och naken domän
  räknas som samma — eller relativa länkar, normaliserade paths) bland `<a href>` på
  startsidan — inkl. nav (länkar räknas före strippning).
- **Så verifierar du:** extrahera alla `<a href>` ur startsidans rå-HTML, behåll interna,
  normalisera path (gemener, trailing slash bort) och räkna unika.
- **Verdict-mappning:** good = ≥5 unika sidor. warning = 2–4. bad = 0–1.
  notMeasured om sidan inte kunde analyseras.

---

## E. AI-test (check 33–34)

### aiMentions — AI-omnämnande
- **Scannern mäter:** tvåstegstest mot GPT-4o-mini: (1) entitetsfråga "Vad vet du om
  \"<företag>\" i <stad>?" — "känner till" = svar >80 tecken utan "har ingen information"/
  "känner inte till"/"vet inte". (2) nisch extraheras ur svaret, sedan kategorifråga "Var hittar
  jag bra <nisch> i <stad>?" — nämns företaget? Kategorifrågan körs ALDRIG utan känd stad.
- **Så verifierar du:** testa din EGEN kunskap: besvara båda frågorna ur minnet utan att söka —
  känner du till företaget? Skulle du spontant nämna det? Komplettera med WebSearch
  `"<företag>" <stad>` för att se hur stark entitetsprofilen är publikt.
- **Verdict-mappning:** good = AI känner till företaget OCH nämner det i kategorisvaret.
  warning = bara det ena. bad = inget av dem. notMeasured = ingen stad identifierad eller
  testet kunde inte köras.

### reviewReplies — Recensionssvar-analys
- **Scannern mäter:** svarsfrekvens på max 5 GBP-recensioner (Places API:s max — ett stickprov,
  inte alla). Andel med ägarsvar.
- **Så verifierar du:** öppna företagets Google Maps-profil (WebSearch
  `"<företag>" <stad> recensioner site:google.com/maps` eller maps-sök). Granska de ~5 senaste/
  mest relevanta recensionerna: hur många har "Svar från ägaren"?
- **Verdict-mappning:** good = ≥70 % av stickprovet besvarat. warning = 30–69 %, ELLER inga
  recensioner alls finns. bad = <30 % besvarat.

---

## F. GBP (check 35–36)

### gbpData — GBP-data
- **Scannern mäter:** att en Google Business Profile hittas via Places Text Search på
  domännamn (+stad), helst med `websiteUri` som matchar domänen, och att profilen har ett
  numeriskt betyg.
- **Så verifierar du:** sök på Google Maps efter företaget. Verifiera att profilen länkar till
  rätt webbplats. Notera betyg och antal recensioner.
- **Verdict-mappning:** good = GBP finns med betyg. warning = GBP finns men saknar betyg.
  notMeasured = ingen GBP hittad. (Aldrig bad.)

### competitors — Konkurrentanalys
- **Scannern mäter:** Places Nearby Search: företag med samma `primaryType` inom 1,5 km radie
  från GBP-positionen, max 5 efter namn-dedupe, sorterade på avstånd. Rent informativ check.
- **Så verifierar du:** sök på Google Maps på företagets bransch + ort/adress (t.ex.
  "restaurang nära <adress>") och lista närliggande företag av samma typ inom ~1,5 km med
  betyg/recensionsantal.
- **Verdict-mappning:** good = ≥1 konkurrent kunde listas (statusen är alltid ok när data finns —
  ingen kvalitetsbedömning). notMeasured = GBP/positionsdata saknas så ingen sökning kunde göras.
  (Aldrig warning/bad.)

---

## G. Synthesis (check 37)

### synthesis — Prioriterad åtgärdsplan
- **Scannern mäter:** ingenting — syntesen är en genererad rapportsektion (åtgärdsplan) och har
  alltid status `notApplicable`, vikt 0.
- **Så verifierar du:** ingen verifiering krävs. Om en syntes finns i rapporten kan du
  (informativt) kontrollera att den inte hittar på konkurrentnamn som inte finns i #36-listan.
- **Verdict-mappning:** rapportera alltid `notMeasured` med evidence
  "Poängsätts inte — syntessektion." och confidence high.
