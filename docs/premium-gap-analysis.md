# Premium-rapport: Gap-analys

Datum: 2026-04-27

---

## Del 1 -- Vad analyseras idag?

### Gratisscanning (23 kontroller, 4 kategorier)

**Teknisk grund (6 kontroller):**
1. HTTPS/SSL
2. Robots.txt (finns/saknas)
3. Sitemap.xml (finns/saknas, antal URL:er)
4. llms.txt (finns/saknas)
5. Sidhastighet / Core Web Vitals (kan ej matas automatiskt, flaggas som "manuell matning")
6. Canonical tags

**Lokal synlighet (6 kontroller):**
7. NAP-information pa hemsidan (namn, adress, telefon)
8. Telefonnummer synligt
9. Stad/ort namns i innehall
10. Google Maps embed eller lank
11. LocalBusiness-schema (inkl. subtyper som Plumber, RealEstateAgent, Restaurant)
12. Oppettider pa webbplatsen

**AI-beredskap (5 kontroller):**
13. Schema markup (nagon typ overhuvudtaget)
14. LocalBusiness/Restaurant-schema specifikt
15. JSON-LD format
16. AI-optimerad metabeskrivning
17. Semantisk HTML-struktur

**Innehall (6 kontroller):**
18. H1-tagg (finns, unik)
19. Title-tagg (langd, nyckelord)
20. Meta description
21. Alt-texter pa bilder (finns i prompten men saknas i scraper-data -- bedoms av AI utan hard data)
22. Internlankning (finns i prompten men saknas i scraper-data)
23. Sprak (svenska vs engelska)

### Premiumanalys (utover gratis)

- **NAP-konsistens** -- jamforelse webbplats vs Google Foretagsprofil (namn, adress, telefon), NAP-poang 0-10
- **GBP-analys** -- styrkor/svagheter i Google Foretagsprofil, verifieringsstatus
- **Recensionsanalys** -- antal, snittomdome, sentiment, nyckelord (positiva + negativa), divergens-varning
- **Konkurrentjamforelse** -- 2-3 konkurrenter med poang och gap-beskrivning
- **Skraddarsydda atgarder** -- prioriterad lista med kod, forvantad effekt
- **Detaljerade losningar** -- steg-for-steg med kopierbara kodexempel for varje atgard
- **Ordlista** -- forklaringar av tekniska termer

---

## Del 2 -- Vad saknas?

### 1. Omnamnanden i AI-motorer (faktisk AI-synlighet)

**Vad:** Kontrollera om foretaget faktiskt namns nar ChatGPT, Perplexity eller Google AI Overviews svarar pa relevanta fragor (t.ex. "basta maklare i Stockholm", "VVS-jour Goteborg").

**Varfor det paverkar AI-synlighet:** Hela rapporten analyserar forutsattningar for AI-synlighet, men mater aldrig det faktiska resultatet. En verksamhet kan ha perfekt teknisk grund men anda inte omnnamnas av AI. Skillnaden mellan "du borde synas" och "du syns" ar enorm for kunden.

**Tekniskt mojligt att detektera:** Delvis. Man kan anropa OpenAI/Perplexity API med bransch+ort-fragor och parsa svaren for foretagsnamnet. Kracver dock API-kostnader per scan och resultaten varierar mellan sessioner. Google AI Overviews ar svart att scrapa programmatiskt.

**Vikt for svensk SMF:** Hog. Det ar hela poangen -- "syns jag eller syns jag inte?"

**Verksamhetstyp:** Alla.

---

### 2. FAQ-schema och fragor-svar-innehall

**Vad:** Kontrollera om webbplatsen har FAQPage-schema eller strukturerat fragor-svar-innehall som AI-motorer kan anvanda direkt i sina svar.

**Varfor det paverkar AI-synlighet:** ChatGPT, Perplexity och Google AI Overviews extraherar fragor-svar-par direkt fran webbplatser med FAQPage-schema. Det ar ett av de enklaste satten att "komma in" i AI-genererade svar -- AI citerar garna tydliga Q&A-par. Utan FAQ-schema maste AI tolka lopande text, och valjer ofta en konkurrent som har tydligare struktur.

**Tekniskt mojligt att detektera:** Ja. Scrapern kan soka efter `FAQPage` i JSON-LD-scheman och aven detektera vanliga HTML-monster for FAQ-sektioner (dl/dt/dd, details/summary, div-strukturer med "faq" i klass/id).

**Vikt for svensk SMF:** Hog. Nastan alla lokala verksamheter far fragor ("vad kostar relining?", "hur lang tid tar en vardering?", "kan jag boka bord for storsta sallskap?"). FAQ-schema ar billigt att implementera och ger snabb effekt.

**Verksamhetstyp:** Alla, men sarskilt service (VVS, tandlakare, advokatbyra), restaurang (menyfragor, allergier) och halsa/skonhet.

---

### 3. Robots.txt-blockering av AI-crawlers

**Vad:** Kontrollera om robots.txt specifikt blockerar AI-crawlers (GPTBot, CCBot, Google-Extended, Anthropic, PerplexityBot, Bytespider) -- inte bara om robots.txt finns.

**Varfor det paverkar AI-synlighet:** Manga CMS-plugins och webbyraer laggar in breda Disallow-regler som blockerar AI-crawlers utan att foretagsagaren vet om det. Om GPTBot ar blockerad kan ChatGPT aldrig indexera sajten, oavsett hur bra schema och innehall ar. Idag kontrollerar scannern bara om robots.txt finns, inte vad den gor.

**Tekniskt mojligt att detektera:** Ja. Robots.txt hamtas redan -- behover bara parsas for kanda AI-bottar (GPTBot, CCBot, Google-Extended, anthropic-ai, PerplexityBot, ClaudeBot, Bytespider, Applebot-Extended).

**Vikt for svensk SMF:** Hog. Manga WordPress-sajter med sakerhetsplugins blockerar AI-crawlers som standard. Det ar en osynlig mur som foretaget inte vet om.

**Verksamhetstyp:** Alla.

---

### 4. Omdomen pa tredjepartsplattformar (utover Google)

**Vad:** Analysera foretagets narvaro och omdomen pa branschspecifika plattformar: TripAdvisor (restaurang), Hemnet/Booli (maklare), Reco.se (hantverkare), Trustpilot, Facebook-omdomen.

**Varfor det paverkar AI-synlighet:** AI-motorer tranas pa data fran manga kallor, inte bara Google. Perplexity citerar TripAdvisor direkt. ChatGPT kan referera till Reco.se och Trustpilot. Om ett foretag bara har Google-omdomen men noll pa TripAdvisor tappar restaurangen poang i AI-svar som aggregerar fran flera kallor.

**Tekniskt mojligt att detektera:** Delvis. Enklast via webbplatsens egen lankning (scrapa "sameAs"-attribut i schema, lankar till TripAdvisor/Trustpilot/Facebook i footer). Direkt sokning pa plattformarna kraver deras API:er eller scraping.

**Vikt for svensk SMF:** Medium-hog. Beror helt pa bransch.

**Verksamhetstyp:** Restaurang (TripAdvisor), maklare (Hemnet), hantverkare (Reco.se), e-handel (Trustpilot). Mindre relevant for B2B.

---

### 5. Strukturerat tjanste/produkt-schema (Service, Product, Menu)

**Vad:** Kontrollera om webbplatsen har schema.org Service, Product, Offer eller Menu-markup for sina specifika tjanster/produkter -- inte bara att foretaget existerar (LocalBusiness), utan vad det erbjuder.

**Varfor det paverkar AI-synlighet:** AI-motorer svarar allt oftare pa specifika fragor: "vad kostar relining av avloppsror i Stockholm?", "vilka maklare erbjuder digital vardering?", "vilken restaurang har wallenbergare i Goteborg?". Service/Product/Menu-schema gor att AI kan matcha foretaget mot specifika fragor. Utan detta matchar bara foretagstypen, inte utbudet.

**Tekniskt mojligt att detektera:** Ja. Scrapern hamtar redan JSON-LD -- behover bara utoka analysen till att kontrollera Service, Product, Offer, Menu, MenuItem-typer.

**Vikt for svensk SMF:** Hog. Specifika fragor om tjanster/priser okar kraftigt i AI-sokning.

**Verksamhetstyp:** Alla, men sarskilt restaurang (Menu/MenuItem), service (Service med priser), e-handel (Product/Offer).

---

### 6. E-A-T-signaler (Expertise, Authoritativeness, Trustworthiness)

**Vad:** Kontrollera om webbplatsen har tydliga fortroendesignaler: Om oss-sida med verkliga namn/foton, certifieringar/auktorisationer (t.ex. "auktoriserad maklare", "behorigin VVS-teknik"), organisationsnummer synligt, namngivna forfattare pa innehall, lankar till branschorganisationer.

**Varfor det paverkar AI-synlighet:** Google's riktlinjer for kvalitetsinnehall (E-E-A-T) paverkar AI Overviews direkt. ChatGPT och Perplexity vager ocksa trovardighetssignaler -- en sida med namngivna experter och certifieringar far foretrade framfor en anonym sida. Sarskilt i YMYL-branscher (halsa, juridik, finans).

**Tekniskt mojligt att detektera:** Delvis. Man kan detektera: Om oss-sida finns (scrapern soker redan efter about-sidor), organisationsnummer pa sidan (regex for 10 siffror med bindestreck), Person-schema med jobTitle, certifierings-nyckelord ("auktoriserad", "certifierad", "legitimerad", "godkand"). Subjektiv bedomning av kvalitet kraver AI.

**Vikt for svensk SMF:** Medium-hog. Kritisk for YMYL-branscher (tandlakare, advokat, revisor, finans), viktig for serviceforetag, lagre for restaurang.

**Verksamhetstyp:** Sarskilt halsa, juridik, finans, service. Lagre for restaurang/cafe.

---

### 7. Sociala medier-narvaro och sameAs-lankar

**Vad:** Kontrollera om webbplatsen lankar till sina sociala profiler (Facebook, Instagram, LinkedIn, X) och om dessa finns i schema markup via `sameAs`-attributet.

**Varfor det paverkar AI-synlighet:** AI-motorer anvander `sameAs` i schema for att koppla ihop foretagets narvaro over internet. Ju fler veriferbara kallor som pekar pa samma foretag, desto starkare entitetsstatus far foretaget i AI:s kunskapsgraf. Ett foretag med webbplats + GBP + Facebook + Instagram + LinkedIn ar en starkare "entitet" an ett med bara webbplats.

**Tekniskt mojligt att detektera:** Ja. Scrapa `sameAs` fran schema-data (finns redan i scrapern) och detektera sociala lankar i footer/header (regex for facebook.com, instagram.com, linkedin.com, twitter.com/x.com).

**Vikt for svensk SMF:** Medium. Grundlaggande hygien, men sjalvt inte tillrackligt for en stor poangskillnad.

**Verksamhetstyp:** Alla, men sarskilt restaurang (Instagram ar avgurande) och maklare (LinkedIn).

---

### 8. Mobilanpassning och responsivitet

**Vad:** Kontrollera om webbplatsen har viewport meta-tagg, responsiv design, och om mobilvanligheten ar tillracklig.

**Varfor det paverkar AI-synlighet:** Google har mobile-first indexering sedan 2021. AI Overviews prioriterar mobilvanligt innehall. Manga AI-fragor stalls fran mobilen ("hej Siri, hitta en VVS-jour nara mig"). En icke-mobilanpassad sajt rankas ner i Googles index, som i sin tur paverkar vilken data AI-motorerna lar sig fran.

**Tekniskt mojligt att detektera:** Ja. Viewport meta-tagg kan detekteras via HTML-parsing. Riktig responsivitets-bedomning kraver rendering (headless browser), men viewport-tagg ar en stark proxy.

**Vikt for svensk SMF:** Medium. De flesta moderna sajter ar mobilanpassade, sa det ar sallsynt att det saknas. Men nar det saknas ar effekten katastrofal.

**Verksamhetstyp:** Alla.

---

### 9. Hreflang och flersprakighet

**Vad:** Kontrollera om webbplatsen med flersprakigt innehall har korrekta hreflang-taggar som talar om vilken sprakversion som ar avsedd for vilken marknad.

**Varfor det paverkar AI-synlighet:** Scannern kollar redan om innehallet ar pa svenska vs engelska, men kontrollerar inte hreflang-taggar. Utan hreflang kan AI-motorer presentera engelska versionen for svenska anvandare eller vice versa. For foretag med internationell kundkrets (hotell, e-handel, tech-foretag) ar detta kritiskt.

**Tekniskt mojligt att detektera:** Ja. Scrapa `<link rel="alternate" hreflang="...">` fran HTML-head.

**Vikt for svensk SMF:** Lag for de flesta, men hog for turism, hotell, internationell e-handel.

**Verksamhetstyp:** Hotell, turism, internationell e-handel, tech. Irrelevant for lokal hantverkare/restaurang.

---

### 10. Recensionssvarsmonstrer (response rate och kvalitet)

**Vad:** Analysera hur foretaget svarar pa recensioner -- svarar de alls? Hur snabbt? Ar svaren generiska eller personliga? Svarar de pa negativa recensioner?

**Varfor det paverkar AI-synlighet:** AI-motorer laser foretagets svar pa recensioner, inte bara sjalva recensionerna. Google AI Overviews visar ibland foretagets svar. Ett foretag som svarar pa varje recension med personliga svar signalerar "aktivt och engagerat foretag" -- AI viktar detta. Bjurfors-rapporten namner att "AI laser era svar", men svarsbeteendet kvantifieras aldrig.

**Tekniskt mojligt att detektera:** Delvis. Google Places API returnerar `authorAttribution` pa recensionssvar. Man kan rakna andelen recensioner med svar och identifiera generiska vs personliga svar via enkel textanalys.

**Vikt for svensk SMF:** Medium-hog. De flesta svenska SMF svarar sallan pa recensioner. Att borja gora det ar en enkel win.

**Verksamhetstyp:** Alla med kundkontakt, sarskilt restaurang och service.

---

### 11. Innehallsdjup och E-E-A-T-innehall

**Vad:** Bedoma om webbplatsen har substantiellt innehall som visar expertis -- blogg, kunskapsbank, guides, fallstudier, "sa har gor vi"-sidor -- inte bara en startsida och kontaktsida.

**Varfor det paverkar AI-synlighet:** AI-motorer foredrar att citera kallor med djupt, original innehall. En VVS-sajt med en guide "Vad kostar relining? Prisguide 2026" har storsta chansen att citeras av ChatGPT an en sajt med bara "vi gor relining, ring oss". Google's Helpful Content Update (som matar in i AI Overviews) belonar sajter med genuint hjalpfullt innehall.

**Tekniskt mojligt att detektera:** Delvis. Antal undersidor i sitemap (redan tillgangligt). Detektera /blogg/, /guide/, /kunskapsbank/ i URL-monster. Textlangd pa sidor. Scraper-datan har bodyText (800 chars) -- tunn text pa alla sidor = varning.

**Vikt for svensk SMF:** Hog. De flesta svenska SMF-sajter har 3-5 sidor med tunn text. Att bygga innehallsdjup ar den enskilt storsta AI-synlighetsatgarden pa lang sikt.

**Verksamhetstyp:** Alla, men sarskilt service och B2B. Lagre for restaurang (dar meny och recensioner ar viktigare).

---

### 12. Open Graph och social metadata

**Vad:** Kontrollera om sajten har Open Graph-taggar (og:title, og:description, og:image, og:type) och Twitter Card-metadata.

**Varfor det paverkar AI-synlighet:** AI-motorer som Perplexity visar forhandsvisningar med bild och beskrivning fran OG-taggar. Nar AI genererar svar med lankar visas OG-data som preview. Utan OG-taggar visas en generisk preview eller ingen alls -- foretaget ser oprofessionellt ut i AI-genererade lanklister.

**Tekniskt mojligt att detektera:** Ja. Scrapa `<meta property="og:*">` och `<meta name="twitter:*">` fran HTML-head.

**Vikt for svensk SMF:** Medium. Paverkar klickfrekvens fran AI-svar snarare an ranking.

**Verksamhetstyp:** Alla, men sarskilt restaurang (bilder ar avgurande), maklare och e-handel.

---

### 13. Backlink-profil och extern auktoritet

**Vad:** Kontrollera om foretaget har lankar fran trovaerdiga externa kallor -- branschorganisationer, nyhetsmedier, kommunens foretags-katalog, lokaltidningar.

**Varfor det paverkar AI-synlighet:** AI-motorers traning viktar information fran auktoritativa kallor. Om Goteborgs-Posten namner en restaurang citerar AI den mer an om bara foretagets egen sajt sager samma sak. Extern auktoritet ar en av de starkaste signalerna for om AI valjer att citera ett foretag.

**Tekniskt mojligt att detektera:** Nej, inte automatiskt utan tredjepartstjanst. Skulle krava Ahrefs/Moz API (kostar pengar) eller Google Search API for att hitta omnamnanden.

**Vikt for svensk SMF:** Hog, men svart att paverka direkt.

**Verksamhetstyp:** Alla.

---

## Del 3 -- Prioritering

### Topp 5 att lagga till i premiumrapporten

**1. FAQ-schema och fragor-svar-innehall**

Motivering: Enklast att implementera (bade detektering och atgard), hogst ROI for kunden, och direkt kopplat till hur AI-motorer extraherar svar. Detekteras helt automatiskt fran befintlig scraper-data (JSON-LD-typer + HTML-monster). Ger konkret, kopierbar kod i premiumrapporten (FAQPage-schema med verksamhetens vanligaste fragor). Relevant for alla branscher.

**2. AI-crawler-blockering i robots.txt**

Motivering: Kostar noll att implementera i scannern (robots.txt-data hamtas redan -- behover bara parsas for GPTBot/CCBot/etc). Avsljojar en av de vanligaste osynliga problemen for svenska SMF med WordPress + sakerhetsplugins. Hogsta dramatiska varde i rapporten: "Er sajt blockerar ChatGPT fran att lasa er" ar en okej-rubrik. En kritisk check som gar fran "saknas helt" till "fullt implementerad" pa 15 minuter.

**3. Strukturerat tjanste/produkt-schema (Service, Product, Menu)**

Motivering: Direkt kopplat till den trend att AI-fragor blir alltmer specifika ("vad kostar X i Y?"). Detekteras automatiskt fran befintlig scraper-data. Ger premiumrapporten en dimension som gratisrapporten inte har: inte bara "ar du ett foretag?" utan "vet AI vad du erbjuder?". Sarskilt starkt for restaurang (Menu-schema) och service (Service med priser).

**4. Recensionssvarsmonstrer**

Motivering: Unik insikt som ingen annan SEO-scanner ger. Google Places API returnerar redan recensioner med svar -- behover bara analyseras. Ger en tydlig, actionable atgard ("svara pa 15 obesvarade recensioner denna vecka"). Forstaarker den befintliga recensionsanalysen fran "vad sager folk?" till "hur engagerad ar du?". AI-motorer laser svaren -- det har dokumenterats.

**5. Omnamnanden i AI-motorer (faktisk AI-synlighet)**

Motivering: Den enda punkten som faktiskt svarar pa fragan "syns jag i AI?". Extremt starkt salj-argument for premiumrapporten. Tekniskt mojligt men kostar API-anrop (OpenAI/Perplexity). Kan goras som en premium-only-funktion dar scannern staller 3 relevanta fragor till ChatGPT-API:t och kollar om foretagsnamnet namns. Kvantifierar skillnaden mellan "du borde synas" och "du syns". Placeras sist av topp 5 eftersom det ar dyrast att implementera och resultaten varierar mellan sessioner.
