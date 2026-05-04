# Rapport-specifikation — AI Search Scanner

> Komplett referens: allt enhanced-scan mäter, var koden finns, vad som fungerar,
> vad som inte fungerar, och exakt hur det ska presenteras i gratis- och premiumrapporten.
>
> **Senast uppdaterad:** 2026-04-28
>
> **Visuell referens:** [rapport-demo.html](https://analyze.pipod.net/hub/rapport-demo.html) — side-by-side gratis vs premium (design source of truth)
> **Kodaudit:** [scan-audit.html](https://analyze.pipod.net/hub/scan-audit.html) — vad koden kör vs vad som visas

---

## 1. Scanflöde — vad som händer vid POST /api/enhanced-scan

```
Steg 1 — Parallell scraping
  ├── scrapeEnhanced(url)          → enhancedData    [enhancedScraper.ts]
  └── scrapeWebsite(url)           → scrapedData     [scraper.ts]

Steg 2 — Google Places API
  ├── findBusinessByUrl(url, city) → place           [places.ts]
  └── getPlaceDetails(place.id)    → placeDetails    [places.ts]

Steg 3 — Parallella analyser (5 st)
  ├── Gemini Flash #1: Teknisk     → technicalResult [route.ts → callOpenRouter]
  ├── Gemini Flash #2: FAQ/Innehåll→ faqResult       [route.ts → callOpenRouter]
  ├── Gemini Flash #3: E-A-T       → eatResult       [route.ts → callOpenRouter]
  ├── checkSwedishDirectories()     → directoryResult [directoryChecker.ts]
  └── checkAIMentions()             → aiMentionResult [aiMentionChecker.ts]

Steg 4 — Recensionssvar
  └── analyzeReviewReplies()       → reviewReplyResult [route.ts rad 264-313]

Steg 5 — Syntes
  └── Gemini 2.5 Pro               → synthesis (markdown) [route.ts rad 315-423]
```

### API-svar (JSON-nycklar returnerade till frontend)

```typescript
{
  url: string
  city: string
  timestamp: string
  enhancedData: EnhancedScrapeResult   // rådata från scraping
  technical: TechnicalResult           // Flash #1
  faqContent: FAQContentResult         // Flash #2
  eat: EATResult                       // Flash #3
  directories: DirectoryResult         // Tavily-check
  reviewReplies: ReviewReplyResult     // beräknad i route.ts
  aiMentions: AIMentionResult | null   // GPT-4o-mini
  synthesis: string                    // Gemini Pro markdown
  hasPlaceData: boolean
  placeData: PlaceData | null          // GBP-sammanfattning
}
```

---

## 2. Alla 32 datapunkter — komplett checklista

### Kolumn-legend

| Symbol | Betydelse |
|--------|-----------|
| **G** | Visas i gratisrapporten |
| **P** | Visas i premiumrapporten |
| **G+P** | Visas i båda (gratis = check, premium = detalj/kod) |
| **KOD OK** | Koden mäter detta idag |
| **BUGG** | Koden har ett känt problem |
| **EJ MÄTT** | Rapport visar det men koden mäter det inte ännu |

---

### A. Teknisk grund (10 datapunkter)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 1 | **HTTPS** | G | Implicit | — | — (härleds från URL) | Badge OK/FEL. `url.startsWith('https')`. Ingen redirect-check. |
| 2 | **Robots.txt** | G | KOD OK | `scraper.ts` rad ~355 | `scrapedData.robotsTxt` | Badge OK om filen finns, FEL om 404. |
| 3 | **AI-crawler-blockering** | G+P | KOD OK | `enhancedScraper.ts` → `route.ts` Flash #1 | `technical.aiCrawlers` | **Gratis:** Badge OK/FEL + "X crawlers blockerade". **Premium:** Lista vilka crawlers (GPTBot, ClaudeBot etc.), fix-text, vad de ska ändra i robots.txt. |
| 4 | **Sitemap.xml** | G | KOD OK | `scraper.ts` rad ~358 | `scrapedData.sitemapUrls` (antal) | Badge OK + sidantal, FEL om saknas. |
| 5 | **llms.txt** | G | BUGG | `scraper.ts` rad ~361 | `scrapedData.llmsTxt` | Badge OK/FEL (finns/saknas). **Bugg:** Filen hämtas men innehållet skickas aldrig till AI-prompten. Kvaliteten analyseras inte. Fix: skicka `llmsTxt` till synthes-prompten eller lägg till dedikerad Flash-check. |
| 6 | **Canonical-tagg** | G | KOD OK | `scraper.ts` `extractSummary()` | `page.canonical` | Badge OK + visar URL, FEL om saknas. |
| 7 | **Open Graph-taggar** | G+P | KOD OK | `enhancedScraper.ts` → Flash #1 | `technical.ogTags` | **Gratis:** Badge OK/FEL + "X taggar saknas". **Premium:** Lista saknade taggar (og:title/desc/image), fix-text, färdig HTML-kod att klistra in. |
| 8 | **Social närvaro / sameAs** | P | KOD OK | `enhancedScraper.ts` → Flash #1 | `technical.socialPresence` | **Bara premium:** Lista hittade plattformar (Instagram, Facebook, LinkedIn etc.), status (OK om 3+, warning 1-2, bad 0), fix-förslag. Inkluderar sameAs från JSON-LD. |
| 9 | **hreflang-taggar** | P | KOD OK | `enhancedScraper.ts` → Flash #1 | `technical.hreflang` | **Bara premium:** Status `notApplicable` om bara ett språk, annars bedöm implementation. Visas bara om relevant. |
| 10 | **Sidhastighet / CWV** | G | EJ MÄTT | — | — | Badge "Ej kontrollerat" / ~. Kräver Lighthouse/browser — out of scope. Behåll som informativ punkt eller ta bort helt. |

---

### B. Lokal synlighet (7 datapunkter)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 11 | **Telefonnummer synligt** | G | KOD OK | `scraper.ts` regex i `extractSummary()` | `page.phones[]` | Badge OK om hittad, FEL om inte. Visar nummret. |
| 12 | **Stad nämns** | G | KOD OK | `scraper.ts` 12 svenska städer | `page.cities[]` | Badge OK/FEL. Visa vilka städer som nämns och hur ofta. |
| 13 | **Google Maps-inbäddning** | G | KOD OK | `scraper.ts` regex (Google-specifik) | `page.hasGoogleMaps` | Badge OK/FEL. Detekterar iframe src och goo.gl/maps-länkar. **OBS:** Bara Google Maps, inte OpenStreetMap. |
| 14 | **LocalBusiness-schema** | G | KOD OK | `scraper.ts` ~60 subtypes | `page.hasAnyLocalBusinessSchema` | Badge OK/FEL. Kollar hela LOCAL_BUSINESS_SUBTYPES-listan (Plumber, RealEstateAgent, Restaurant, Dentist etc.). |
| 15 | **Katalogregistrering (Eniro/Hitta)** | G+P | KOD OK | `directoryChecker.ts` via Tavily API | `directories.directories[]` | **Gratis:** Per katalog: "Hittad" / "Ej hittad" badge. **Premium:** Profil-URL (klickbar länk), extraherad NAP (telefon + adress) per katalog, jämförelsetabell. |
| 16 | **NAP-konsistens** | G+P | KOD OK | `directoryChecker.ts` | `directories.napConsistency` | **Gratis:** Badge OK/FEL + "NAP-poäng X/10". **Premium:** Tabell med telefon + adress per källa (sajt, GBP, Eniro, Hitta), markera avvikelser i rött, normaliserade jämförelser. |
| 17 | **Öppettider** | G | KOD OK | `places.ts` | `placeData.weekdayDescriptions` | Badge OK/FEL. **OBS:** Hämtas bara från GBP (Places API), inte från sajten. Om GBP saknas → "Ej kontrollerat". |

---

### C. AI-beredskap (9 datapunkter)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 18 | **Schema markup (någon typ)** | G | KOD OK | `scraper.ts` | `page.schemaTypes[]` | Badge OK/FEL. Lista alla hittade @type-värden. |
| 19 | **LocalBusiness-subtyp** | G | KOD OK | `scraper.ts` | `page.hasAnyLocalBusinessSchema` | Badge OK/FEL. Specifikt: har sajten en schema.org-subtyp (inte bara generisk LocalBusiness)? |
| 20 | **JSON-LD format** | G | KOD OK | `scraper.ts` | `page.schemaScripts[]` | Badge OK/FEL. Finns `<script type="application/ld+json">`? |
| 21 | **Meta-taggar (title + desc)** | G | KOD OK | `scraper.ts` | `page.title`, `page.metaDescription` | Badge OK/varning/FEL. Visa titeln och metabeskrivningen. Varning om generisk/kort. |
| 22 | **FAQ-schema** | G+P | KOD OK | `enhancedScraper.ts` → Flash #2 | `faqContent.faqSchema` | **Gratis:** Badge OK/FEL + "X FAQ-frågor hittade". **Premium:** Lista hittade frågor, status, fix-förslag, färdig FAQPage JSON-LD-kod (branschanpassad, 3 frågor på svenska). |
| 23 | **Innehållsdjup** | G+P | KOD OK | `enhancedScraper.ts` → Flash #2 | `faqContent.contentDepth` | **Gratis:** Badge OK/FEL + "X sidor, blogg: Ja/Nej". **Premium:** Sidantal i sitemap, blogg/guide-detektion (/blogg/, /tips/, /nyheter/), fix-förslag (starta blogg, skriv guider). |
| 24 | **Service/Product/Menu-schema** | P | KOD OK | `enhancedScraper.ts` → Flash #2 | `faqContent.serviceSchema` | **Bara premium:** Vilka typer hittade (Service, Product, Menu), fix-kod om saknas, branschanpassat kodexempel. |
| 25 | **E-A-T-signaler** | G+P | KOD OK | `enhancedScraper.ts` → Flash #3 | `eat.eatSignals`, `eat.orgNumber`, `eat.certifications` | **Gratis:** Badge OK/FEL + "X av Y signaler hittade". **Premium:** Lista hittade/saknade signaler (om-oss, org.nr, certifieringar, person-schema), fix-förslag per signal. |
| 26 | **Semantisk HTML** | G | EJ MÄTT | — | — | Badge ~/FEL. **Koden gör ingen detektion** av `<article>`, `<section>`, `<main>`. AI:n gissar baserat på kontext. **Fix:** Lägg till i `extractSummary()`: kolla förekomst av article, section, main, aside, nav. |

---

### D. Innehåll (6 datapunkter)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 27 | **H1-rubrik** | G | KOD OK | `scraper.ts` `$('h1').first()` | `page.h1` | Badge OK/FEL. Visa rubrikens text. FEL om saknas eller är tom. |
| 28 | **Title-tagg** | G | KOD OK | `scraper.ts` `$('title')` | `page.title` | Badge OK/varning. Visa texten. Varning om generisk (saknar stad/nyckelord). |
| 29 | **Metabeskrivning** | G | KOD OK | `scraper.ts` `meta[name=description]` | `page.metaDescription` | Badge OK/varning/FEL. Visa texten (max 300 tecken). FEL om saknas. |
| 30 | **Kontaktinfo** | G | KOD OK | `scraper.ts` telefon + @ + nyckelord | `page.hasContactInfo` | Badge OK/FEL. |
| 31 | **Alt-texter på bilder** | G | EJ MÄTT | — | — | Badge visas men **koden mäter inte detta**. Scraper extraherar inte `<img alt>`. **Fix:** Lägg till i `extractSummary()`: räkna bilder med/utan alt, returnera `altTextCoverage: { total, withAlt, percentage }`. |
| 32 | **Internlänkning** | G | EJ MÄTT | — | — | Badge visas men **koden mäter inte detta**. Scraper följer interna länkar men analyserar inte struktur. **Fix:** Räkna unika interna länkar per sida, kolla om kontakt/om-oss/tjänster är länkade. |

---

### E. AI-synlighetstest (2 datapunkter — premium only)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 33 | **AI-omnämnande** | P | KOD OK | `aiMentionChecker.ts` via GPT-4o-mini | `aiMentions` | **Bara premium.** Tre steg: (1) Entity-fråga "Vad vet du om [namn] i [stad]?" → visar AI:ns svar + sentiment. (2) Nisch-extraktion (1-3 ord). (3) Kategori-fråga "Var hittar jag bra [nisch] i [stad]?" → nämns företaget spontant? **Presentation:** Visa entity-fråga + svar, kategori-fråga + svar, resultat: "AI känner till er" / "AI känner inte till er", "Nämns spontant" / "Nämns ej". **City guard:** Kategorifråga skippas om ingen stad — visa "Ej testat (stad saknas)". |
| 34 | **Recensionssvar-analys** | P | KOD OK | `route.ts` rad 264-313 | `reviewReplies` | **Bara premium.** Svarsfrekvens i % (med/utan svar i stickprov). Trösklar: ≥70% = OK, 30-69% = varning, <30% = dålig. Visa sampleNote-disclaimer om stickprov < totalt antal recensioner. **Presentation:** "Svarar på X% av recensioner (Y/Z i stickprov)". Fix-förslag om låg frekvens. |

---

### F. Google Business Profile (2 datapunkter — premium only)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 35 | **GBP-data** | P | KOD OK | `places.ts` | `placeData` | **Bara premium.** Företagsnamn, adress, telefon, betyg (X.X), antal recensioner, öppettider, domän-match (verifierad/ej verifierad). **Presentation:** Kort med betyg, stjärnor, adress, telefon. Varning om domän inte matchar URL. |
| 36 | **Konkurrentanalys** | P | KOD OK | `route.ts` → Gemini Pro syntes | `synthesis` (del av markdown) | **Bara premium.** AI-genererad jämförelse med 3 troliga konkurrenter. Ingår i syntesens `## Konkurrentanalys`-sektion. **Presentation:** Stapeldiagram med poäng per konkurrent, kort beskrivning av vad de gör bättre, "Vad krävs för att gå om?"-ruta. |

---

### G. Syntes (1 datapunkt — premium only)

| # | Datapunkt | Rapport | Kod OK? | Kodfil | API-fält | Presentation |
|---|-----------|---------|---------|--------|----------|-------------|
| 37 | **Prioriterad åtgärdsplan** | P | KOD OK | `route.ts` rad 315-423 → Gemini Pro | `synthesis` | **Bara premium.** Markdown-dokument med sektioner: Prioriterad åtgärdsplan (Kritiskt/Viktigt/Bra att ha), AI-synlighetstest, GBP-analys, Konkurrentanalys, Sammanfattning. Renderas via `SynthesisMarkdown` i `EnhancedReport.tsx`. **OBS:** Syntesen är fri markdown — AI:n strukturerar efter eget omdöme. Inga garanterade sektioner. Preamble strippas med regex före första `##`. |

---

## 3. Rapportstruktur — hur det ska se ut

### 3.1 Gratisrapporten

Syfte: ge tillräckligt för att väcka intresse, inte tillräckligt för att lösa problemet.

```
┌─────────────────────────────────────────────────┐
│  HEADER                                          │
│  ├── analyze.pipod.net / [domän]                │
│  ├── Företagsnamn                                │
│  ├── bransch · stad · datum                     │
│  └── [GRATISANALYS]-badge                       │
│                                                  │
│  TOTALPOÄNG                                      │
│  ├── Cirkeldiagram: Gratispoäng (0-100)         │
│  └── Låst cirkel: "Fullständig poäng 🔒 Premium"│
├─────────────────────────────────────────────────┤
│  SAMMANFATTNING                                  │
│  ├── Gratispoäng (cirkel)                       │
│  ├── Fullständig poäng (låst, blurrad)          │
│  ├── "De 3 viktigaste fynden" (rubrik + text)   │
│  └── Estimerad förbättring (grön ruta)          │
├─────────────────────────────────────────────────┤
│  ÅTGÄRDSPLAN (utan lösningar)                   │
│  ├── 🔴 Kritiskt (rubrik + 1-rad-beskrivning)  │
│  ├── 🟡 Viktigt (rubrik + 1-rad-beskrivning)   │
│  └── 🔵 Bra att ha (rubrik + 1-rad)            │
│  (Inga steg-för-steg, inga kodexempel, inga     │
│   klickbara länkar till lösningar)               │
├─────────────────────────────────────────────────┤
│  DETALJERADE LÖSNINGAR — 🔒 LÅST               │
│  ├── Blurrad förhandsvisning (2 lösningar)      │
│  ├── Lock-overlay: "11 steg-för-steg-lösningar" │
│  └── CTA: "Beställ fullständig analys — 499 kr" │
├─────────────────────────────────────────────────┤
│  KONKURRENTANALYS — 🔒 LÅST                    │
│  ├── Blurrade staplar (3 konkurrenter + kund)   │
│  ├── Lock-overlay: namn på konkurrenter         │
│  └── CTA: "Beställ fullständig analys — 499 kr" │
├─────────────────────────────────────────────────┤
│  RECENSIONSANALYS — 🔒 LÅST                    │
│  ├── Blurrad förhandsvisning (teman, svagheter) │
│  ├── Lock-overlay: "X recensioner analyserade"  │
│  └── CTA: "Beställ fullständig analys — 499 kr" │
├─────────────────────────────────────────────────┤
│  ALLA 29 KONTROLLER                              │
│  ├── Teknisk (8 kontroller)                     │
│  │   ├── HTTPS          [OK/FEL]               │
│  │   ├── Robots.txt     [OK/FEL]               │
│  │   ├── Sitemap.xml    [OK/FEL]  + sidantal   │
│  │   ├── Canonical tag  [OK/FEL]               │
│  │   ├── AI-crawlers    [OK/~]   + kort text   │
│  │   ├── Open Graph     [OK/~/FEL]             │
│  │   ├── LLMS.TXT       [OK/FEL]               │
│  │   └── Sidhastighet   [~] "Ej kontrollerat"  │
│  ├── Lokal synlighet (7 kontroller)             │
│  │   ├── NAP-information[~/FEL] + poäng        │
│  │   ├── Telefonnummer  [OK/FEL]               │
│  │   ├── Stad nämns     [OK/~/FEL]             │
│  │   ├── Google Maps    [OK/FEL]               │
│  │   ├── LocalBusiness  [OK/FEL]               │
│  │   ├── Öppettider     [OK/FEL]               │
│  │   └── Katalogregistr.[OK/~/FEL]             │
│  ├── AI-beredskap (8 kontroller)                │
│  │   ├── Schema markup  [OK/FEL]               │
│  │   ├── Bransch-schema [OK/FEL]               │
│  │   ├── JSON-LD        [OK/FEL]               │
│  │   ├── Metabeskrivning[OK/~]                 │
│  │   ├── Semantisk HTML [~]    (planerad mätn.) │
│  │   ├── FAQ-schema     [OK/FEL]               │
│  │   ├── Innehållsdjup  [OK/~/FEL]             │
│  │   └── E-A-T-signaler [OK/~/FEL]             │
│  └── Innehåll (6 kontroller)                    │
│      ├── H1-tagg        [OK/FEL]               │
│      ├── Title-tagg     [OK/~]                 │
│      ├── Metabeskrivning[OK/~]                 │
│      ├── Alt-texter     [OK/FEL] (planerad m.) │
│      ├── Internlänkning [OK/FEL] (planerad m.) │
│      └── Språk          [OK]     (planerad m.) │
├─────────────────────────────────────────────────┤
│  ORDLISTA                                        │
│  (Schema markup, NAP, llms.txt, Canonical,       │
│   GBP, Semantisk HTML, Metabeskrivning etc.)     │
├─────────────────────────────────────────────────┤
│  FOOTER                                          │
│  ├── "Vill ha lösningarna?"                     │
│  ├── CTA: "Beställ fullständig analys — 499 kr" │
│  └── Rapport-ID + datum                         │
└─────────────────────────────────────────────────┘
```

### 3.2 Premiumrapporten

Syfte: komplett rapport som kan ges direkt till en webbutvecklare. Allt upplåst.

```
┌─────────────────────────────────────────────────┐
│  HEADER                                          │
│  ├── analyze.pipod.net / [domän]                │
│  ├── Företagsnamn                                │
│  ├── bransch · stad · datum                     │
│  └── [FULLSTÄNDIG RAPPORT]-badge (premium)      │
│                                                  │
│  TRE POÄNGCIRKLAR                                │
│  ├── Gratispoäng (0-100)                        │
│  ├── Fullständig poäng (0-100, upplåst)         │
│  └── Google-betyg (X.X ★ + antal rec.)          │
├─────────────────────────────────────────────────┤
│  SAMMANFATTNING                                  │
│  ├── Tre cirklar igen (gratis + full + Google)  │
│  ├── "De 3 viktigaste fynden"                   │
│  └── Estimerad förbättring (med konkurrentref)  │
├─────────────────────────────────────────────────┤
│  ÅTGÄRDSPLAN (med klickbara länkar)             │
│  ├── 🔴 Kritiskt → klicka hoppar till lösningen│
│  ├── 🟡 Viktigt → klicka hoppar till lösningen │
│  └── 🔵 Bra att ha → klicka till lösningen     │
├─────────────────────────────────────────────────┤
│  DETALJERADE LÖSNINGAR (alla upplåsta)          │
│  ├── Per åtgärd:                                │
│  │   ├── Prioritet-badge (Kritiskt/Viktigt/Bra) │
│  │   ├── "Vad är detta?" (förklaring)           │
│  │   ├── "Varför spelar det roll för [namn]?"   │
│  │   ├── "Så här fixar ni det" (steg-för-steg) │
│  │   └── "Kod att kopiera" (färdig JSON-LD etc) │
│  └── + placeholder: "X ytterligare lösningar"   │
├─────────────────────────────────────────────────┤
│  KONKURRENTANALYS (upplåst)                     │
│  ├── 3 konkurrenter + kunden, var med:          │
│  │   ├── Namn                                    │
│  │   ├── Poäng-stapel (0-100)                   │
│  │   └── Kort sammanfattning av styrkor         │
│  ├── Kunden highlighted (blå bakgrund)          │
│  └── "Vad krävs för att gå om?" (amber ruta)   │
├─────────────────────────────────────────────────┤
│  RECENSIONSANALYS (upplåst)                     │
│  ├── Betyg + stjärnor                           │
│  ├── Antal recensioner (jämfört med konkurrent) │
│  ├── Teman (badges: Professionalism etc.)       │
│  ├── Svagheter att adressera                    │
│  ├── Svarsfrekvens (från reviewReplies)         │
│  └── Rekommendation (grön ruta)                 │
├─────────────────────────────────────────────────┤
│  ALLA 32 KONTROLLER                              │
│  ├── Teknisk (10 kontroller)                    │
│  │   ├── allt från gratis (8 st)                │
│  │   ├── + Social närvaro / sameAs              │
│  │   └── + hreflang-taggar                      │
│  ├── Lokal synlighet (7 kontroller)             │
│  │   └── samma som gratis                       │
│  ├── AI-beredskap (9 kontroller)                │
│  │   ├── allt från gratis (8 st)                │
│  │   └── + Service/Product/Menu-schema          │
│  └── Innehåll (6 kontroller)                    │
│      └── samma som gratis                       │
│                                                  │
│  Alla kontroller har klickbara länkar till       │
│  motsvarande lösning i "Detaljerade lösningar". │
├─────────────────────────────────────────────────┤
│  ORDLISTA                                        │
│  (samma som gratis, utökat med E-A-T, FAQ etc.) │
├─────────────────────────────────────────────────┤
│  FOOTER                                          │
│  └── Rapport-ID + datum                         │
└─────────────────────────────────────────────────┘
```

---

## 4. Nuvarande UI (EnhancedReport.tsx)

Komponenten renderar idag en **flat vy utan gratis/premium-uppdelning**:

```
1. Mörk header med domän + stad + 6 status badges
   (AI-omnämnanden, Kataloger, Recensionssvar, Teknisk, FAQ & Innehåll, E-A-T)
2. GBP-kort (namn, adress, telefon, betyg, domän-match)
3. Syntes-markdown (SynthesisMarkdown-komponent)
```

**Vad som saknas i nuvarande UI jämfört med rapport-demo:**
- Poängcirklar (totalpoäng)
- Gratis/premium-uppdelning
- De 29/32 individuella kontrollerna med badges
- Låsta sektioner i gratisversionen
- Detaljerade steg-för-steg-lösningar
- Konkurrentanalys (stapeldiagram)
- Recensionsanalys (teman, svagheter)
- Ordlista
- CTA-knappar

---

## 5. Kända buggar och brister

### 5.1 llms.txt hämtas men används inte

| | |
|---|---|
| **Fil** | `scraper.ts` rad ~361 |
| **Problem** | `llmsTxt = llmsRes?.ok ? await llmsRes.text() : null` — hämtas och returneras i `scrapedData.llmsTxt`, men `route.ts` refererar aldrig till `scrapedData.llmsTxt`. Synthes-prompten får inte innehållet. |
| **Konsekvens** | Rapporten kan säga "llms.txt saknas" (om filen inte finns), men om filen finns analyseras innehållet aldrig. Dåligt skriven llms.txt fångas inte. |
| **Fix** | Skicka `llmsTxt` till synthes-prompten. Alternativt: dedikerad Flash-check som analyserar innehållet och föreslår förbättringar. |

### 5.2 Omätta kontroller visas som OK

Dessa kontroller har badge i rapport-demo men koden gör ingen mätning:

| Check | Visas som | Vad som saknas | Fix |
|-------|-----------|----------------|-----|
| **Alt-texter** | OK | Scraper extraherar inte `<img alt>`. Ingen räkning. | `extractSummary()`: räkna bilder med/utan alt → `altTextCoverage` |
| **Internlänkning** | OK | Scraper följer interna länkar men analyserar inte struktur. | Räkna unika interna länkar per sida, kolla om nyckel-sidor är länkade. |
| **Semantisk HTML** | Delvis | Ingen detektion av `<article>`, `<section>`, `<main>`. AI gissar. | `extractSummary()`: kolla förekomst av article, section, main, aside, nav. |
| **Språk (lang=sv)** | OK | `<html lang="...">` extraheras aldrig. | `extractSummary()`: `$('html').attr('lang')` |
| **HTTPS** | OK | Implicit — härleds från URL. Ingen redirect-check http→https. | Acceptabelt, men kan lägga till redirect-check. |

### 5.3 Öppettider bara från GBP

Öppettider hämtas bara från Google Places API (`weekdayDescriptions`), inte från sajten. Om GBP saknas kan rapporten inte bedöma öppettider alls.

### 5.4 Syntes har ingen garanterad struktur

Gemini Pro-syntesen är fri markdown. Prompten kräver sektioner (Åtgärdsplan, AI-synlighetstest, GBP-analys, Konkurrentanalys, Sammanfattning) men AI:n kan utelämna eller omdöpa. Preamble strippas med `synthesisRaw.replace(/^[\s\S]*?(##\s)/m, '$1').trim()` — om Pro inte skriver något `##` heading alls blir resultatet tom sträng. Catch returnerar `## Syntesfel`.

---

## 6. Filreferens

| Fil | Syfte | Rad |
|-----|-------|-----|
| `app/api/enhanced-scan/route.ts` | POST-endpoint, Flash-prompter, syntes, reviewReplies | ~650 rader |
| `app/lib/enhancedScraper.ts` | robots.txt, OG, social, sameAs, hreflang, FAQ, E-A-T | ~449 rader |
| `app/lib/scraper.ts` | Huvudsida + undersidor, schema, LocalBusiness, canonical, maps, llms.txt | ~419 rader |
| `app/lib/directoryChecker.ts` | Tavily: Eniro/Hitta-sökning, NAP-extraktion, konsistens-jämförelse | ~343 rader |
| `app/lib/aiMentionChecker.ts` | GPT-4o-mini: entity → nisch → kategorifråga | ~188 rader |
| `app/lib/places.ts` | Google Places API: Text Search + Place Details (2×5 reviews) | — |
| `app/components/EnhancedReport.tsx` | UI: status badges + syntes-markdown | ~245 rader |
| `app/hooks/useAnalysis.ts` | State: `EnhancedReportData` typedefinition + analyze() | — |

---

## 7. Sammanfattning

| | Gratis | Premium |
|---|--------|---------|
| **Kontroller** | 29 st (8+7+8+6) | 32 st (10+7+9+6) |
| **Mäts av koden** | 24 av 29 | 27 av 32 |
| **Ej mätt ännu** | 5 (alt, intern, sem.HTML, språk, CWV) | 5 (samma) |
| **Åtgärdsplan** | Rubriker + 1-rads-beskrivning | Steg-för-steg + kod |
| **Lösningar** | 🔒 Låst (blurrad) | Alla upplåsta |
| **Konkurrentanalys** | 🔒 Låst | 3 konkurrenter + staplar |
| **Recensionsanalys** | 🔒 Låst | Teman + svagheter + fix |
| **AI-omnämnande** | — | Entity + kategori-test |
| **GBP-data** | — | Betyg + adress + telefon |
| **Syntes** | — | Gemini Pro markdown |
| **Poäng** | Gratispoäng (cirkel) | Gratis + Full + Google-betyg |
| **CTA** | "Beställ — 499 kr" (×4) | — |
| **Premium-only checks** | — | Social/sameAs, hreflang, Service/Product |
