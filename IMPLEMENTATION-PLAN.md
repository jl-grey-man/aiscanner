# Implementationsplan: Vattentät scannerrapport

> **Datum:** 2026-04-28
> **Källa:** `.planning/SCANNER-AUDIT-FULL.md` — komplett audit av alla 37 kontroller, gapanalys, strategi
> **Mål:** Varje scan → validerad ScanResult → identisk rapportstruktur varje gång
> **Princip:** Varje steg är atomärt, fristående, testbart, och lämnar projektet fungerande
>
> **VIKTIGT:** Läs `.planning/SCANNER-AUDIT-FULL.md` FÖRST. Den innehåller:
> - Detaljerad audit av alla 37 kontroller (sektion A–G) med exakta filreferenser och radnummer
> - Identifierade buggar, varningar, mönster
> - ScanResult-kontraktet (Zod-schema, poängvikter, TypeScript-typer)
> - Demo-rapportens exakta struktur (gratis + premium)
> - Gapanalys: API-svar vs typer vs renderer vs demo
>
> Utan den kontexten saknas motivering och detalj för varje steg nedan.

---

## ⛔ Overseer-instruktioner (MANDATORY — läs innan du gör NÅGOT)

**Du som kör denna plan som overseer MÅSTE:**

1. **Läs HELA denna fil** innan du spawnar en enda agent. Inte bara aktuell fas. Hela filen. Modellstrategin finns längst ned.
2. **Använd rätt modell per steg** — se tabellen "Modellval per steg" i avsnittet "Modell- & agentstrategi" längst ned. Modellvalen är inte förslag, de är krav.
3. **Spawna aldrig agenter som delar fil** parallellt — gruppera tasks per fil, en agent per fil.
4. **MANDATORY-TESTS-blocket MÅSTE kopieras ordagrant** till sub-agentens prompt — inte sammanfattat, inte omskrivet, inte förkortat. Copy-paste hela bash-blocket.
5. **Sub-agenten MÅSTE visa PASS-output** för varje testrad. Om agenten rapporterar "klar" utan att visa PASS för alla tester → skicka tillbaka agenten med instruktion att köra testerna.
6. **OVERSEER-GATE körs av DIG (overseern)** — inte av sub-agenten. Det är dina tester. Kör curl, kör python3-verifiering, granska output. "Agent said success" är INTE verifiering.
7. **Deklarera ALDRIG ett steg klart** utan att varje PASS-rad (både agentens och dina gate-tester) har bekräftats med faktisk terminal-output.

**Hur du grupperar Fas 1 (rätt modell + rätt fil):**

| Agent | Tasks | Fil | Modell |
|-------|-------|-----|--------|
| A | 1.1 + 1.10 | `app/lib/scanResult.ts` (ny) | **Opus** |
| B | 1.2 + 1.3 + 1.4 | `app/lib/scraper.ts` | **Sonnet** |
| C | 1.6 + 1.11 | `app/lib/scraper.ts` | **Haiku** (kör efter B är klar) |
| D | 1.12 + 1.13 | `app/api/enhanced-scan/route.ts` + `app/lib/enhancedScraper.ts` | **Sonnet** |
| E | 1.5 + 1.9 | `app/api/enhanced-scan/route.ts` | **Haiku** (kör efter D är klar) |
| F | 1.7 + 1.8 + 1.14 | `directoryChecker.ts` + `enhancedScraper.ts` | **Haiku** |

> OBS: scraper.ts-agenter (B och C) kan inte köras parallellt — C beror på att B är klar.
> route.ts-agenter (D och E) kan inte köras parallellt — E beror på att D är klar.

---

## Fasöversikt

```
Fas 1: Grunden        — Zod-schema + poängberäkning + scraper-fixes
Fas 2: AI-kontraktet  — Flash-prompter → strukturerad JSON, validerad
Fas 3: Rapporten      — Template-driven FreeReport + PremiumReport
Fas 4: Leveranskedja  — Email, PDF, webbsida med inlogg, betalning
```

Varje fas levererar ett fungerande system. Fas 1 kan deployeras utan fas 2.

---

## Fas 1: Grunden

> **Mål:** ScanResult-typer + Zod-validering + deterministisk poäng + alla 37 scraper-fält finns

### 1.1 — Definiera ScanResult Zod-schema

**Scope:** Ny fil `app/lib/scanResult.ts`

**Vad:**
- Definiera `CheckResult` Zod-schema (id, key, status, source, finding, fix, data, codeExample, priority, tier)
- Definiera `ScanResult` Zod-schema (meta, scores, checks[37], synthesis, gbp, directories, aiMentions, reviewReplies)
- Definiera alla 37 check-keys som enum
- Exportera TypeScript-typer från Zod: `type ScanResult = z.infer<typeof ScanResultSchema>`
- Inkludera `CHECK_REGISTRY`: statisk array med alla 37 kontroller (id, key, label, category, tier, weight)

**Filer:**
- Skapa: `app/lib/scanResult.ts`
- Installera: `zod` (npm i zod)

**Verifiering:**
```bash
npx tsx -e "import { ScanResultSchema } from './app/lib/scanResult'; console.log('Schema OK, keys:', ScanResultSchema.shape.checks.element.shape.key.options?.length || 'array')"
```

**Levererar:** Typesafe kontrakt som alla andra steg bygger på.

---

### 1.2 — Scraper: Lägg till alt-texter (#31)

**Scope:** `app/lib/scraper.ts` — `extractSummary()`

**Vad:**
- Räkna `$('img')` totalt
- Räkna `$('img[alt]')` med icke-tomt alt-attribut (filtrera `alt=""`)
- Lägg till i `PageSummary`:
  ```typescript
  altTextCoverage: { total: number; withAlt: number; percentage: number }
  ```
- Om `total === 0`: `{ total: 0, withAlt: 0, percentage: 100 }` (inga bilder = inget problem)

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se"}' --max-time 140 | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('enhancedData',{}).get('altTextCoverage','SAKNAS'))"
```
- Manuellt jämför siffran mot sajten (devtools → `document.querySelectorAll('img').length`)

**Levererar:** Ground truth för alt-text — eliminerar hallucination i check #31.

---

### 1.3 — Scraper: Lägg till internlänkning (#32)

**Scope:** `app/lib/scraper.ts` — `extractSummary()`

**Vad:**
- Samla alla `<a href>` som pekar till samma domän (relativa + absoluta)
- Dedup → räkna unika interna sidor
- Kolla nyckelsidor: kontakt, om-oss, tjänster (regex med vanliga svenska/engelska varianter)
- Lägg till i `PageSummary`:
  ```typescript
  internalLinks: {
    total: number
    uniquePages: number
    hasContactLink: boolean
    hasAboutLink: boolean
    hasServicesLink: boolean
  }
  ```

**Verifiering:**
```bash
# Test 1: Fältet finns i API-svaret
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
il = d.get('enhancedData',{}).get('internalLinks')
assert il is not None, 'FAIL: internalLinks saknas'
assert isinstance(il['total'], int), 'FAIL: total inte int'
assert isinstance(il['hasContactLink'], bool), 'FAIL: hasContactLink inte bool'
print(f'OK: {il[\"total\"]} länkar, {il[\"uniquePages\"]} unika, kontakt={il[\"hasContactLink\"]}, om-oss={il[\"hasAboutLink\"]}, tjänster={il[\"hasServicesLink\"]}')
"
# Test 2: Manuellt — jämför total mot devtools: document.querySelectorAll('a[href]').length
# PASS-kriterie: internalLinks.total > 0 för sajt med navigation
```

**Levererar:** Ground truth för internlänkning — eliminerar hallucination i check #32.

---

### 1.4 — Scraper: Lägg till semantisk HTML + språk (#26)

**Scope:** `app/lib/scraper.ts` — `extractSummary()`

**Vad:**
- Detektera: `<main>`, `<article>`, `<section>`, `<nav>`, `<aside>`
- Extrahera: `$('html').attr('lang')`
- Lägg till i `PageSummary`:
  ```typescript
  semanticHTML: {
    hasMain: boolean
    hasArticle: boolean
    hasSection: boolean
    hasNav: boolean
    hasAside: boolean
    langAttribute: string | null
  }
  ```

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
sh = d.get('enhancedData',{}).get('semanticHTML')
assert sh is not None, 'FAIL: semanticHTML saknas i API-svaret'
assert isinstance(sh['hasMain'], bool), 'FAIL: hasMain inte bool'
assert sh['langAttribute'] is None or isinstance(sh['langAttribute'], str), 'FAIL: langAttribute fel typ'
print(f'OK: main={sh[\"hasMain\"]}, article={sh[\"hasArticle\"]}, nav={sh[\"hasNav\"]}, lang={sh[\"langAttribute\"]}')
"
# PASS-kriterie: langAttribute = 'sv' för svenska sajter. hasNav = true för sajt med navigation.
```

**Levererar:** Faktisk semantisk HTML-detektion + språk-attribut.

---

### 1.5 — Scraper: HTTPS-kontroll (#1)

**Scope:** `app/api/enhanced-scan/route.ts`

**Vad:**
- Tidigt i route-hanteringen: `const isHttps = url.startsWith('https://')`
- Inkludera i data som skickas till Flash #1

**Verifiering:**
```bash
# Test 1: HTTPS-sajt → ska vara ok
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
# isHttps ska finnas i enhancedData eller technical
print('URL:', d.get('url'))
assert d.get('url','').startswith('https'), 'FAIL: URL är inte https'
print('OK: HTTPS-sajt korrekt identifierad')
"
# Test 2: Om möjligt testa http-URL — status ska vara 'bad'
# PASS-kriterie: isHttps=true för https-URL, isHttps=false för http-URL
```

**Levererar:** HTTPS-check baserad på faktisk URL.

---

### 1.6 — Scraper: Kontaktinfo-precision (#30)

**Scope:** `app/lib/scraper.ts` ~rad 287

**Vad:**
- Byt `bodyText.includes('@')` till email-regex: `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/`
- Byt `/tel/i` till `/\btel\b/i` (word-boundary, undvik "television")

**Verifiering:**
```bash
node -e "
const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
console.log(re.test('info@example.se'));  // true
console.log(re.test('user@2024'));         // false
console.log(/\btel\b/i.test('telefon'));   // true (tel är prefix i telefon — behöver kolla)
console.log(/\btel\b/i.test('television')); // false
"
```

**Levererar:** Färre false positives i kontaktinfo-detektion.

---

### 1.7 — DirectoryChecker: NAP false positive (#16)

**Scope:** `app/lib/directoryChecker.ts` ~rad 206-212

**Vad:**
- Ändra: `found.length < 2` → returnera `consistent: null` (inte `true`)
- Uppdatera TypeScript-typ: `consistent: boolean | null`
- `finding` ska förklara: "För få datakällor för NAP-jämförelse"

**Verifiering:**
```bash
# Test 1: TypeScript-kompilering
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | head -5
# PASS: inga type-errors

# Test 2: Kör scan mot litet företag (troligen ≤1 katalog)
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://litet-lokalt-foretag.se","city":"Umeå"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
nap = d.get('directories',{}).get('napConsistency',{})
if not nap.get('checked'):
    assert nap.get('consistent') is None, f'FAIL: consistent={nap.get(\"consistent\")} borde vara null/None'
    print('OK: otestad NAP = consistent:null (inte true)')
else:
    print(f'OK: NAP testad, consistent={nap.get(\"consistent\")}')
"
# PASS-kriterie: checked=false → consistent=null (aldrig true)
```

**Levererar:** NAP rapporterar inte "OK" utan faktisk jämförelse.

---

### 1.8 — E-A-T: Word-boundary för certifieringar (#25)

**Scope:** `app/lib/enhancedScraper.ts` ~rad 413-420

**Vad:**
- Byt `.includes(keyword)` till `new RegExp('\\b' + keyword + '\\b', 'i').test(text)`
- Verifiera att "ISO 9001" fortfarande matchar men "isolation" inte gör det

**Verifiering:**
```bash
node -e "
const kw = ['certifierad','ISO','auktoriserad'];
const tests = [['ISO 9001',['ISO']],['isolation',[]],['decertifierad',[]]];
tests.forEach(([t,exp]) => {
  const found = kw.filter(k => new RegExp('\\\\b'+k+'\\\\b','i').test(t));
  console.log(JSON.stringify(found)===JSON.stringify(exp)?'OK':'FAIL', t, found);
});
"
```

**Levererar:** Inga false positives i E-A-T certifierings-detektion.

---

### 1.9 — Recensionssvar: Sanity-check disclaimer (#34)

**Scope:** `app/api/enhanced-scan/route.ts` ~rad 273-278

**Vad:**
- Om `totalReviewCount < reviews.length`: använd null istället för vilseledande siffra
- `sampleNote` ska aldrig säga "X av totalt Y" där Y < X

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json,re; d=json.load(sys.stdin)
rr = d.get('reviewReplies',{})
sn = rr.get('sampleNote','')
print(f'sampleNote: {sn}')
# Kolla att 'X av totalt Y' aldrig har X > Y
m = re.search(r'(\d+) av totalt (\d+)', sn)
if m:
    sample, total = int(m.group(1)), int(m.group(2))
    assert sample <= total, f'FAIL: stickprov {sample} > totalt {total}'
    print(f'OK: {sample} <= {total}')
else:
    print('OK: ingen X-av-Y-formulering (acceptabelt)')
"
# PASS-kriterie: Aldrig "stickprov av X av totalt Y" där X > Y
```

**Levererar:** Korrekt disclaimer utan logiska motsägelser.

---

### 1.10 — Poängberäkning

**Scope:** Ny funktion i `app/lib/scanResult.ts`

**Vad:**
- Definiera vikter per check (free + full)
- `calculateScores(checks: CheckResult[]): { free: number, full: number }`
- ok=100%, warning=50%, bad=0%, notMeasured=exkludera från max, notApplicable=exkludera
- Normalisera till 0-100

**Verifiering:**
```bash
npx tsx -e "
import { calculateScores } from './app/lib/scanResult';
const mockChecks = [/* 37 checks med kända status */];
const scores = calculateScores(mockChecks);
console.log('Free:', scores.free, 'Full:', scores.full);
// Verifiera manuellt att poängen är rimliga
"
```

**Levererar:** Deterministisk poäng — samma data → samma siffra, varje gång.

---

### 1.11 — Städer: Utöka till 50 (#12)

**Scope:** `app/lib/scraper.ts` ~rad 69-72

**Vad:**
- Ersätt 12-stads-listan med SCB:s 50 största kommuner
- Behåll samma word-boundary regex

**Verifiering:**
```bash
# Test 1: Nya städer fungerar i regex
node -e "
const SWEDISH_CITIES = ['Stockholm','Göteborg','Malmö','Uppsala','Linköping','Örebro','Västerås','Norrköping','Helsingborg','Jönköping','Umeå','Lund','Borås','Huddinge','Eskilstuna','Gävle','Södertälje','Karlstad','Täby','Växjö','Halmstad','Sundsvall','Luleå','Trollhättan','Östersund','Borlänge','Falun','Kalmar','Skövde','Kristianstad','Karlskrona','Skellefteå','Uddevalla','Varberg','Örnsköldsvik','Nyköping','Lidingö','Motala','Landskrona','Visby','Kiruna','Ystad','Mora','Arvika','Katrineholm','Enköping','Trelleborg','Ängelholm','Mariestad','Alingsås'];
const regex = new RegExp('\\\\b(' + SWEDISH_CITIES.join('|') + ')\\\\b', 'g');
const tests = ['Vi finns i Karlstad','Kontor i Trollhättan och Östersund','Stockholm är bra'];
tests.forEach(t => { const m = t.match(regex); console.log(m ? 'OK' : 'FAIL', ':', t, '→', m); });
console.log('Total städer:', SWEDISH_CITIES.length);
"
# PASS-kriterie: 50 städer, Karlstad/Trollhättan/Östersund matchas
```

**Levererar:** Stadsigenkänning för 50 istället för 12 städer.

---

### 1.12 — llms.txt: Skicka till AI (#5)

**Scope:** `app/api/enhanced-scan/route.ts` — Flash #1 prompt

**Vad:**
- Inkludera `scrapedData.llmsTxt` i Flash #1:s prompt
- Flash #1 ska returnera `llmsTxt.status` + `finding` + `fix`

**Verifiering:**
```bash
# Test 1: llms.txt-data skickas till Flash
grep -n 'llmsTxt\|llms' /mnt/storage/aiscanner/app/api/enhanced-scan/route.ts | head -10
# PASS: llmsTxt nämns i buildTechnicalPrompt()

# Test 2: API-svar innehåller llmsTxt-analys
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
tech = d.get('technical',{})
llms = tech.get('llmsTxt')
assert llms is not None, 'FAIL: technical.llmsTxt saknas i svaret'
assert 'status' in llms, 'FAIL: llmsTxt har ingen status'
print(f'OK: llmsTxt.status={llms[\"status\"]}, exists={llms.get(\"exists\")}')
"
# PASS-kriterie: technical.llmsTxt finns med status + exists-fält
```

**Levererar:** llms.txt-analys med kvalitetsbedömning.

---

### 1.13 — AI-crawlers: Utöka + partiella block (#3)

**Scope:** `app/lib/enhancedScraper.ts` ~rad 9-18, 86-116

**Vad:**
- Utöka till 13 crawlers (+ChatGPT-User, cohere-ai, Applebot-Extended, FacebookBot, meta-externalagent)
- Detektera partiella block (inte bara `Disallow: /`)
- Returnera strukturerat objekt: `{ crawler, path, full: boolean }[]`

**Verifiering:**
```bash
# Test 1: Nya crawlers finns i listan
grep -c 'AI_CRAWLERS' /mnt/storage/aiscanner/app/lib/enhancedScraper.ts
node -e "
// Simulera parsing med partiella block
const robotsTxt = 'User-agent: GPTBot\nDisallow: /api/\nUser-agent: ClaudeBot\nDisallow: /';
// Din nya parseRobotsTxt ska returnera: [{crawler:'GPTBot',path:'/api/',full:false},{crawler:'ClaudeBot',path:'/',full:true}]
console.log('Manuell verifiering: parsa ovanstående robots.txt och kontrollera output');
"
# Test 2: API-svar visar utökad crawler-data
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
crawlers = d.get('enhancedData',{}).get('aiCrawlersBlocked',[])
print(f'Blockerade crawlers: {crawlers}')
print(f'OK: data returneras (tom lista = inga blockerade)')
"
# PASS-kriterie: >=13 crawlers i AI_CRAWLERS-listan, partiella block rapporteras
```

**Levererar:** Bredare crawler-detektion.

---

### 1.14 — Social-plattformar: Utöka (#8)

**Scope:** `app/lib/enhancedScraper.ts` ~rad 118-127

**Vad:**
- Lägg till: threads.net, bsky.app, mastodon.social, tripadvisor.com, yelp.com, trustpilot.com

**Verifiering:**
```bash
# Test: Nya plattformar finns i listan
grep -c 'socialPatterns\|threads\|bsky\|trustpilot' /mnt/storage/aiscanner/app/lib/enhancedScraper.ts
# PASS-kriterie: threads.net, bsky.app, trustpilot.com finns i socialPatterns-arrayen
node -e "
const patterns = ['instagram.com','facebook.com','linkedin.com','twitter.com','x.com','youtube.com','tiktok.com','pinterest.com','threads.net','bsky.app','mastodon.social','tripadvisor.com','yelp.com','trustpilot.com'];
console.log('Antal plattformar:', patterns.length);
console.log(patterns.length >= 14 ? 'OK' : 'FAIL: för få plattformar');
"
```

**Levererar:** Bredare social-plattforms-detektion.

---

## Fas 2: AI-kontraktet

> **Mål:** Flash-prompter returnerar strukturerad JSON som mappar direkt till CheckResult. Valideras med Zod.

### 2.1 — Bygg checkResultBuilder

**Scope:** Ny fil `app/lib/checkBuilder.ts`

**Vad:**
- Funktion `buildCheckResults(scraperData, flashResults, directoryResult, aiMentions, reviewReplies, gbpData): CheckResult[]`
- Mappar alla 37 checks:
  - Checks med scraper-källa (1-7, 9, 11-14, 18-21, 27-30): status direkt från data (finns/saknas → ok/bad)
  - Checks med AI-källa (3, 7-8, 22-25): merge scraper ground truth + Flash-bedömning
  - Checks med API-källa (15-17, 33-35): från Tavily/Places/GPT-4o-mini
  - Check 36 (konkurrenter): computed, branschanalys (ej specifika namn)
  - Check 37 (syntes): computed, referens till synthesis-objekt
- Varje check garanteras ha alla CheckResult-fält
- Om data saknas → `status: 'notMeasured'`, `finding: 'Kunde inte mäta'`

**Verifiering:**
```bash
# Kör scan → kontrollera att alla 37 checks finns
curl ... | python3 -c "import sys,json; d=json.load(sys.stdin); checks=d.get('checks',[]); print(f'{len(checks)} checks'); missing=[c for c in checks if not c.get('finding')]; print(f'{len(missing)} utan finding')"
```

**Levererar:** Garanterad 37-check-array i varje API-svar.

---

### 2.2 — Refaktorera Flash #1 prompt (Teknisk)

**Scope:** `app/api/enhanced-scan/route.ts` — `buildTechnicalPrompt()`

**Vad:**
- Ändra prompt att kräva exakt JSON-format som matchar CheckResult
- Inkludera ALLA data-fält som scrapern extraherar men som idag ignoreras:
  - `canonical` (extraheras i scraper.ts:252 men skickas aldrig till Flash)
  - `hasGoogleMaps` (extraheras i scraper.ts:254-268 men nämns ej i prompt)
  - `menuSummary` (extraheras men aldrig skickat till AI)
  - `llmsTxt` (fixat i 1.12)
  - Plus befintliga: robots.txt, OG, social, hreflang, HTTPS
- Strikt output-format:
  ```json
  {
    "checks": {
      "aiCrawlers": { "status": "ok|warning|bad", "finding": "...", "fix": "...", "data": {...} },
      "ogTags": { "status": "...", "finding": "...", "fix": "...", "codeExample": "..." },
      ...
    }
  }
  ```
- Parsa med Zod. Retry 1 gång vid parse-fail. Fallback till `status: 'notMeasured'`.

**Verifiering:**
```bash
# Test 1: Prompt returnerar parsbar JSON
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
tech = d.get('technical',{})
required = ['aiCrawlers','ogTags','socialPresence','hreflang','llmsTxt','https']
for key in required:
    assert key in tech, f'FAIL: technical.{key} saknas'
    assert 'status' in tech[key], f'FAIL: technical.{key} har ingen status'
    assert tech[key]['status'] in ['ok','warning','bad','notMeasured','notApplicable'], f'FAIL: technical.{key}.status={tech[key][\"status\"]} ogiltig'
print(f'OK: alla {len(required)} tekniska checks har giltig status')
"
# Test 2: Kör samma scan 2 gånger → samma nycklar (konsistent struktur)
# PASS-kriterie: alla required-nycklar finns, alla har status i godkänd enum
```

**Levererar:** Flash #1 returnerar validerad JSON, aldrig fri text.

---

### 2.3 — Refaktorera Flash #2 prompt (FAQ/Innehåll)

**Scope:** `app/api/enhanced-scan/route.ts` — `buildFAQContentPrompt()`

**Vad:**
- Samma princip som 2.2 men för checks: faqSchema, contentDepth, serviceSchema
- Kodexempel MÅSTE inkludera `<!-- ANPASSA: ... -->` disclaimer
- Strikt JSON-output

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
faq = d.get('faqContent',{})
required = ['faqSchema','contentDepth','serviceSchema']
for key in required:
    assert key in faq, f'FAIL: faqContent.{key} saknas'
    assert 'status' in faq[key], f'FAIL: faqContent.{key} har ingen status'
# Kolla disclaimer i kodexempel
ce = faq.get('faqSchema',{}).get('codeExample','')
if ce:
    assert 'ANPASSA' in ce or 'anpassa' in ce.lower(), f'FAIL: codeExample saknar ANPASSA-disclaimer'
    print('OK: codeExample har disclaimer')
else:
    print('OK: inget codeExample (schema fanns redan)')
print(f'OK: alla {len(required)} FAQ-checks har giltig status')
"
# PASS-kriterie: alla required finns, kodexempel innehåller ANPASSA
```

**Levererar:** Flash #2 returnerar validerad JSON + disclaimer i kodexempel.

---

### 2.4 — Refaktorera Flash #3 prompt (E-A-T)

**Scope:** `app/api/enhanced-scan/route.ts` — `buildEATPrompt()`

**Vad:**
- Samma princip som 2.2 men för checks: eatSignals, orgNumber, certifications

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
eat = d.get('eat',{})
required = ['eatSignals','orgNumber','certifications']
for key in required:
    assert key in eat, f'FAIL: eat.{key} saknas'
    assert 'status' in eat[key], f'FAIL: eat.{key} har ingen status'
print(f'OK: alla {len(required)} E-A-T-checks har giltig status')
"
# PASS-kriterie: alla 3 fält finns med status
```

**Levererar:** Flash #3 returnerar validerad JSON.

---

### 2.5 — Refaktorera syntesprompt (Gemini Pro)

**Scope:** `app/api/enhanced-scan/route.ts` — `buildSynthesisPrompt()`

**Vad:**
- Pro returnerar 4 namngivna sektioner istället för fri markdown:
  ```json
  {
    "actionPlan": "markdown — prioriterad åtgärdsplan (## Kritiskt, ## Viktigt, ## Bra att ha)",
    "competitorNote": "markdown — branschanalys UTAN specifika konkurrentnamn",
    "reviewAnalysis": "markdown — recensionsanalys baserat på reviewReplies-data",
    "summary": "markdown — 3-5 meningar sammanfattning"
  }
  ```
- Konkurrentanalys-instruktion:
  ```
  VIKTIGT: Du har INGEN verifierad data om specifika konkurrenter.
  Skriv aldrig konkreta företagsnamn.
  Beskriv istället vad typiska konkurrenter i [bransch] i [stad] tenderar att göra bra.
  ```
- Parsa med Zod. Fallback per sektion om parsning misslyckas.
- Validera att actionPlan innehåller minst en `##`-rubrik

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
syn = d.get('synthesis',{})
# Test 1: Syntes är objekt med 4 fält, INTE en sträng
assert isinstance(syn, dict), f'FAIL: synthesis är {type(syn).__name__}, ska vara dict'
required = ['actionPlan','competitorNote','reviewAnalysis','summary']
for key in required:
    assert key in syn, f'FAIL: synthesis.{key} saknas'
    assert isinstance(syn[key], str) or syn[key] is None, f'FAIL: synthesis.{key} är {type(syn[key]).__name__}'
# Test 2: actionPlan har minst en rubrik
assert '##' in syn.get('actionPlan',''), 'FAIL: actionPlan saknar ##-rubrik'
# Test 3: competitorNote nämner inte specifika företagsnamn (svårt att testa automatiskt)
cn = syn.get('competitorNote','')
print(f'OK: synthesis har {len(required)} fält, actionPlan {len(syn[\"actionPlan\"])} tecken')
print(f'competitorNote (50 tecken): {cn[:50]}...')
print('MANUELL CHECK: verifiera att competitorNote INTE nämner specifika företagsnamn')
"
# PASS-kriterie: synthesis = dict med 4 nycklar, actionPlan har ##, competitorNote har inga firmnamn
```

**Levererar:** Strukturerad syntes med ärlig konkurrentanalys.

---

### 2.6 — AI-omnämnande: Korsvalidering (#33)

**Scope:** `app/lib/aiMentionChecker.ts`

**Vad:**
- `extractNiche()` tar emot `placesTypes` som parameter
- Om Places-kategorier finns: korsvalidera AI-extraherad nisch
- Vid mismatch → logga warning, fallback till `bransch`

**Verifiering:**
```bash
# Test: Kör scan mot företag med GBP-kategori
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
ai = d.get('aiMentions')
if ai:
    niche = ai.get('extractedNiche','')
    print(f'Extraherad nisch: {niche}')
    print('MANUELL CHECK: matchar nischen företagets faktiska bransch (fastighetsmäklare)?')
else:
    print('aiMentions = null (GBP saknas eller stad saknas — acceptabelt)')
"
# PASS-kriterie: nisch matchar bransch, inte nonsens som 'nightclub' för en mäklare
```

**Levererar:** Nisch-extraktion som inte kan vara helt felklassad.

---

### 2.7 — Öppettider: Schema-fallback (#17)

**Scope:** `app/lib/enhancedScraper.ts`

**Vad:**
- I `extractSchemaInfo()`: sök efter `openingHoursSpecification` i JSON-LD
- Returnera i EnhancedData
- I route.ts: GBP-öppettider primärt, schema-fallback sekundärt

**Verifiering:**
```bash
# Test: Fältet finns i enhancedData
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
ed = d.get('enhancedData',{})
ohs = ed.get('openingHoursFromSchema')
print(f'openingHoursFromSchema: {ohs}')
print('null = sajten har ingen openingHoursSpecification i schema (OK)')
print('array = öppettider hittade i JSON-LD (bör stämma med GBP)')
"
# PASS-kriterie: fältet finns (null eller array), inget crash
```

**Levererar:** Öppettider från 2 källor istället för 1.

---

### 2.8 — Assemblera ScanResult i route.ts

**Scope:** `app/api/enhanced-scan/route.ts`

**Vad:**
- Efter alla analyser: anropa `buildCheckResults()` (från 2.1)
- Anropa `calculateScores()` (från 1.10)
- Assemblera `ScanResult`-objekt
- Validera med `ScanResultSchema.parse()` — om det failar, logga fel och returnera 500
- Returnera validerad ScanResult som API-svar

**Verifiering:**
```bash
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
print('meta:', bool(d.get('meta')))
print('scores:', d.get('scores'))
print('checks:', len(d.get('checks',[])))
print('synthesis keys:', list(d.get('synthesis',{}).keys()))
"
```
- `checks` ska vara exakt 37
- `scores.free` och `scores.full` ska vara tal 0-100
- `synthesis` ska ha 4 nycklar

**Levererar:** Komplett, validerad ScanResult — kontraktet mellan scan och rapport.

---

## Fas 3: Rapporten

> **Mål:** Template-driven rapport som renderar ScanResult deterministiskt. Gratis + premium.

### 3.1 — ReportRenderer: gemensamma komponenter

**Scope:** Nya filer under `app/components/report/`

**Vad:**
- `ScoreCircle.tsx` — poängcirkel (0-100, färgkodad)
- `CheckBadge.tsx` — OK/FEL/~ badge
- `PriorityCard.tsx` — åtgärd med prioritet-kant (röd/orange/blå)
- `SolutionCard.tsx` — detaljerad lösning (vad/varför/hur/kod)
- `LockedSection.tsx` — blurrad sektion med lock-overlay + CTA
- `CheckTable.tsx` — tabell med alla kontroller per kategori
- `Glossary.tsx` — ordlista (statisk data)

Design: matcha exakt rapport-demo.html (dark theme, Inter/JetBrains Mono, badges, prioritet-kant)

### MANDATORY-TESTS-3.1
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Alla komponentfiler existerar
ls -la /mnt/storage/aiscanner/app/components/report/
# PASS: ScoreCircle.tsx, CheckBadge.tsx, PriorityCard.tsx, SolutionCard.tsx,
#       LockedSection.tsx, CheckTable.tsx, Glossary.tsx, index.ts finns (8 filer)

# Test 2: TypeScript-kompilering
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep -c "error" || echo "0 errors"
# PASS: 0 errors

# Test 3: Komponenter importeras korrekt
cd /mnt/storage/aiscanner && npx tsx -e "
import { ScoreCircle, CheckBadge, PriorityCard, SolutionCard, LockedSection, CheckTable, Glossary } from './app/components/report';
console.log('PASS: alla 7 komponenter importeras utan fel');
"
# PASS: alla 7 komponenter importeras utan fel
```

**Levererar:** Återanvändbara rapportkomponenter.

---

### 3.2 — FreeReport-komponent

**Scope:** `app/components/report/FreeReport.tsx`

**Vad:**
Renderar ScanResult som gratisrapport (matchar demo-sektion 3.1):

1. Header (meta.domain, meta.companyName, meta.bransch, meta.city, meta.scanDate, [GRATISANALYS]-badge)
2. Poängcirklar (scores.free + låst scores.full)
3. Sammanfattning (top 3 findings, estimerad förbättring)
4. Åtgärdsplan (checks filtrerade på priority, grupperade critical/important/nice — rubrik + 1-rad, inga detaljer)
5. Detaljerade lösningar — LÅST (2 blurrade + lock-overlay + CTA)
6. Konkurrentanalys — LÅST (blurrad + CTA)
7. Recensionsanalys — LÅST (blurrad + CTA)
8. 29 kontroller (checks filtrerade på tier=free, grupperade per category)
9. Ordlista
10. Footer med CTA

**Ren funktion:** `FreeReport({ scanResult }: { scanResult: ScanResult }) → JSX`
Samma ScanResult → samma rapport. Alltid.

### MANDATORY-TESTS-3.2
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: TypeScript-kompilering
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep "FreeReport" || echo "OK: inga FreeReport-errors"
# PASS: 0 errors relaterade till FreeReport

# Test 2: Räkna free-tier checks i koden
cd /mnt/storage/aiscanner && npx tsx -e "
import { CHECK_REGISTRY } from './app/lib/scanResult';
const free = CHECK_REGISTRY.filter(r => r.tier === 'free');
console.log('Free checks:', free.length);
console.assert(free.length === 29, 'FAIL: förväntat 29 free checks');
console.log('PASS: 29 free-tier checks');
"
# PASS: 29 free-tier checks

# Test 3: Komponenten accepterar ScanResult och renderar utan crash
cd /mnt/storage/aiscanner && npx tsx -e "
import { FreeReport } from './app/components/report/FreeReport';
console.log('PASS: FreeReport importeras utan fel, typeof:', typeof FreeReport);
"
# PASS: FreeReport importeras utan fel

# Test 4: Starta dev-server och hämta sidan (overseern kör detta)
cd /mnt/storage/aiscanner && timeout 15 npm run dev 2>&1 | tail -3
# PASS: "Ready in" utan errors
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Kör riktig scan → verifiera att FreeReport renderas
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
checks = d.get('checks', [])
free = [c for c in checks if c.get('tier') == 'free']
print(f'Free checks i API-svar: {len(free)}')
assert len(free) == 29, f'FAIL: {len(free)} free checks, förväntat 29'
print('PASS: API returnerar 29 free-tier checks')
"
# PASS: API returnerar 29 free-tier checks

# Gate 2: Visuell kontroll (manuell)
# Öppna http://100.72.180.20:3000 → kör scan → verifiera:
#   PASS: Header med domän + företagsnamn + [GRATISANALYS]-badge
#   PASS: Poängcirkel (gratispoäng) + låst cirkel (fullständig)
#   PASS: Sammanfattning med 3 viktigaste fynd
#   PASS: Åtgärdsplan: Kritiskt (röd) / Viktigt (orange) / Bra att ha (blå)
#   PASS: Detaljerade lösningar: 2 blurrade + lock-overlay + CTA 499 kr
#   PASS: Konkurrentanalys: LÅST med blur + CTA
#   PASS: Recensionsanalys: LÅST med blur + CTA
#   PASS: 29 kontroller: 4 tabeller med OK/FEL/~-badges
#   PASS: Ordlista
#   PASS: Footer med CTA
```

**Levererar:** Komplett gratisrapport.

---

### 3.3 — PremiumReport-komponent

**Scope:** `app/components/report/PremiumReport.tsx`

**Vad:**
Renderar ScanResult som premiumrapport (matchar demo-sektion 3.2):

1. Header + [FULLSTÄNDIG RAPPORT]-badge (guld)
2. Tre poängcirklar (free + full + Google-betyg)
3. Sammanfattning med konkurrentref
4. Åtgärdsplan med ankarlänkar till lösningar
5. ALLA detaljerade lösningar (vad/varför/hur/kod) — per check med fix !== null
6. Konkurrentanalys (synthesis.competitorNote, branschanalys)
7. Recensionsanalys (reviewReplies + synthesis.reviewAnalysis)
8. 32 kontroller med ankarlänkar
9. Ordlista
10. Footer med rapport-ID + datum

### MANDATORY-TESTS-3.3
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: TypeScript-kompilering
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep "PremiumReport" || echo "OK: inga PremiumReport-errors"
# PASS: 0 errors relaterade till PremiumReport

# Test 2: Räkna alla scoreable checks (exkl synthesis #37)
cd /mnt/storage/aiscanner && npx tsx -e "
import { CHECK_REGISTRY } from './app/lib/scanResult';
const scoreable = CHECK_REGISTRY.filter(r => r.key !== 'synthesis');
console.log('Scoreable checks:', scoreable.length);
console.assert(scoreable.length === 36, 'FAIL: förväntat 36 scoreable checks');
console.log('PASS: 36 scoreable checks (exkl synthesis)');
"
# PASS: 36 scoreable checks

# Test 3: Komponenten importeras utan crash
cd /mnt/storage/aiscanner && npx tsx -e "
import { PremiumReport } from './app/components/report/PremiumReport';
console.log('PASS: PremiumReport importeras utan fel, typeof:', typeof PremiumReport);
"
# PASS: PremiumReport importeras utan fel

# Test 4: Ankarlänkar — verifiera att SolutionCard sätter id och PriorityCard länkar
cd /mnt/storage/aiscanner && grep -c 'id=.*fix-' app/components/report/SolutionCard.tsx && \
  grep -c 'href=.*fix-' app/components/report/PriorityCard.tsx
# PASS: båda returnerar >= 1 (ankarlänkar kopplade)
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Kör riktig scan → verifiera alla 37 checks
curl -s -X POST http://localhost:3000/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
checks = d.get('checks', [])
print(f'Totalt checks: {len(checks)}')
assert len(checks) == 37, f'FAIL: {len(checks)} checks, förväntat 37'
synthesis = d.get('synthesis', {})
assert isinstance(synthesis, dict), 'FAIL: synthesis inte dict'
assert 'actionPlan' in synthesis, 'FAIL: synthesis.actionPlan saknas'
print('PASS: 37 checks + strukturerad synthesis')
"
# PASS: 37 checks + strukturerad synthesis

# Gate 2: Visuell kontroll via dev-toggle (manuell)
# Öppna http://100.72.180.20:3000 → kör scan → klicka dev-toggle → verifiera:
#   PASS: Header med [FULLSTÄNDIG RAPPORT]-badge (guld)
#   PASS: Tre poängcirklar (gratis + full + Google-betyg)
#   PASS: Sammanfattning med estimerad förbättring
#   PASS: Åtgärdsplan med klickbara ankarlänkar
#   PASS: ALLA lösningar upplåsta (vad/åtgärd/kod per check)
#   PASS: Konkurrentanalys (branschtext, inga fabricerade namn)
#   PASS: Recensionsanalys (svarsfrekvens + analys)
#   PASS: 36 kontroller i tabeller (exkl synthesis)
#   PASS: Ordlista
#   PASS: Footer med rapport-ID + datum
```

**Levererar:** Komplett premiumrapport.

---

### 3.4 — Integrera i page.tsx

**Scope:** `app/page.tsx` + `app/hooks/useAnalysis.ts`

**Vad:**
- `useAnalysis` returnerar `ScanResult` (inte rå API-data)
- page.tsx renderar `FreeReport` direkt efter scan
- "Beställ fullständig analys"-knapp (CTA) synlig i gratisrapporten
- Dev-mode: toggle för att visa premium-rapport (för testning)

### MANDATORY-TESTS-3.4
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Production build
cd /mnt/storage/aiscanner && npm run build 2>&1 | tail -5
# PASS: "Compiled successfully" i output

# Test 2: TypeScript clean
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1; echo "EXIT: $?"
# PASS: EXIT: 0

# Test 3: useAnalysis exporterar scanResult
cd /mnt/storage/aiscanner && grep -n 'scanResult' app/hooks/useAnalysis.ts
# PASS: scanResult finns som state + i return-objektet

# Test 4: Dev-server startar utan crash
cd /mnt/storage/aiscanner && timeout 15 npm run dev 2>&1 | tail -3
# PASS: "Ready in" utan errors
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Deploya och kör end-to-end scan
npm run build && cp -r public .next/standalone/public && sudo systemctl restart ai-scanner-api
sleep 3
curl -s -X POST http://localhost:8010/api/enhanced-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bjurfors.se","city":"Göteborg"}' --max-time 140 | \
  python3 -c "
import sys,json; d=json.load(sys.stdin)
assert 'checks' in d, 'FAIL: checks saknas'
assert len(d['checks']) == 37, f'FAIL: {len(d[\"checks\"])} checks'
assert 'scores' in d, 'FAIL: scores saknas'
assert 0 <= d['scores']['free'] <= 100, 'FAIL: free score utanför 0-100'
print(f'PASS: {len(d[\"checks\"])} checks, free={d[\"scores\"][\"free\"]}, full={d[\"scores\"][\"full\"]}')
"
# PASS: 37 checks + scores inom 0-100

# Gate 2: Verifiera att sidan laddar (HTML innehåller rapportkomponenter)
curl -s http://localhost:8010/ | python3 -c "
import sys; html=sys.stdin.read()
assert len(html) > 1000, 'FAIL: sidan är tom'
print(f'PASS: sidan laddar ({len(html)} bytes)')
"
# PASS: sidan laddar

# Gate 3: Visuell end-to-end (manuell)
# Öppna https://analyze.pipod.net → skriv bjurfors.se + Göteborg → Analysera
#   PASS: Progress-indikator visas under scan
#   PASS: Gratisrapport renderas med alla 10 sektioner
#   PASS: Poängcirkel visar tal 0-100
#   PASS: 29 kontroller visas med badges
#   PASS: Låsta sektioner har blur + CTA
#   PASS: Ingen crash, inga tomma sektioner
#   PASS: Dev-toggle → premiumrapport med 36 kontroller
```

**Levererar:** Fungerande rapportvisning på sidan.

---

## Fas 4: Leveranskedja

> **Mål:** Email, PDF, webbsida med inlogg, betalning

### 4.1 — Email: Gratis-rapport

**Scope:** Ny API-route `app/api/send-report/route.ts`

**Vad:**
- POST med `{ email, scanId }` → hämta ScanResult → rendera FreeReport som HTML → skicka email
- Använd samma FreeReport-komponent (server-side rendered)
- Email-provider: Resend/Nodemailer (TBD)

### MANDATORY-TESTS-4.1
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: API-route existerar och kompilerar
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep "send-report" || echo "OK: inga send-report errors"
# PASS: inga send-report errors

# Test 2: Spara en testrapport (kräver 4.2 persistens först), skicka till test-email
SCAN_ID="test-$(date +%s)"
# Skapa mock ScanResult i data/scans/${SCAN_ID}.json först (se 4.2)
curl -s -X POST http://localhost:8010/api/send-report \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"jens@example.com\",\"scanId\":\"${SCAN_ID}\"}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert r.get('success') == True, f'FAIL: success={r.get(\"success\")}'
assert 'messageId' in r or 'id' in r, 'FAIL: inget messageId i svar'
print('PASS: email skickad')
"
# PASS: email skickad
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Kontrollera att emailen faktiskt anlände
# (manuell check — öppna testmailbox, verifiera att rapporten ser korrekt ut)
#   PASS: Email mottagen inom 30s
#   PASS: Ämnesrad: "Din AI-analys av {domain}"
#   PASS: HTML-body renderar rapport med badges, poängcirkel, etc.
#   PASS: Alla 29 gratiskontroller visas
#   PASS: Låsta premiumsektioner har CTA (inte blur — email stöder inte CSS blur)
```

**Levererar:** Gratis-rapport via email.

---

### 4.2 — Persistens: Spara ScanResult

**Scope:** `app/lib/storage.ts`

**Vad:**
- Spara validerad ScanResult till fil (`/mnt/storage/aiscanner/data/scans/{scanId}.json`)
- `saveScanResult(result: ScanResult): string` → returnerar scanId
- `loadScanResult(scanId: string): ScanResult | null`

### MANDATORY-TESTS-4.2
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Filstruktur
ls -la /mnt/storage/aiscanner/app/lib/storage.ts
# PASS: filen existerar

# Test 2: TypeScript-kompilering
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep "storage" || echo "OK: inga storage errors"
# PASS: inga storage errors

# Test 3: Spara + ladda roundtrip via Node.js
cd /mnt/storage/aiscanner && node -e "
const { saveScanResult, loadScanResult } = require('./app/lib/storage');
const { ScanResultSchema } = require('./app/lib/schema');

// Skapa minimal valid ScanResult (måste matcha Zod-schema)
const mockResult = { /* ... full mock from 1.1 test fixture ... */ };

// Spara
const scanId = saveScanResult(mockResult);
console.assert(typeof scanId === 'string', 'FAIL: scanId inte sträng');
console.assert(scanId.length > 10, 'FAIL: scanId för kort');

// Ladda tillbaka
const loaded = loadScanResult(scanId);
console.assert(loaded !== null, 'FAIL: loadScanResult returnerade null');

// Zod-validera laddad data
const parsed = ScanResultSchema.safeParse(loaded);
console.assert(parsed.success, 'FAIL: laddad data passerar inte Zod');

// Kontrollera att filen finns på disk
const fs = require('fs');
const path = '/mnt/storage/aiscanner/data/scans/' + scanId + '.json';
console.assert(fs.existsSync(path), 'FAIL: JSON-fil saknas på disk');

// Rensa testfil
fs.unlinkSync(path);
console.log('PASS: save → load → Zod roundtrip OK');
"
# PASS: save → load → Zod roundtrip OK

# Test 4: Ogiltigt scanId returnerar null
cd /mnt/storage/aiscanner && node -e "
const { loadScanResult } = require('./app/lib/storage');
const result = loadScanResult('nonexistent-id-12345');
console.assert(result === null, 'FAIL: borde returnera null för ogiltigt ID');
console.log('PASS: ogiltigt ID → null');
"
# PASS: ogiltigt ID → null

# Test 5: Path traversal-skydd
cd /mnt/storage/aiscanner && node -e "
const { loadScanResult } = require('./app/lib/storage');
const result = loadScanResult('../../../etc/passwd');
console.assert(result === null, 'FAIL: path traversal borde blockeras');
console.log('PASS: path traversal blockerad');
"
# PASS: path traversal blockerad
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Verifiera att data/scans/ katalogen skapas korrekt
ls -la /mnt/storage/aiscanner/data/scans/
# PASS: katalogen existerar

# Gate 2: Full TypeScript-kompilering utan errors
cd /mnt/storage/aiscanner && npx tsc --noEmit
# PASS: 0 errors
```

**Levererar:** ScanResult som kan hämtas efter scan för review/PDF/email.

---

### 4.3 — PDF-generering

**Scope:** Ny API-route `app/api/generate-pdf/route.ts`

**Vad:**
- Ladda ScanResult → rendera PremiumReport → Playwright/Puppeteer → PDF
- Playwright redan installerat (enligt CLAUDE.md: "NEVER remove. Required by ClaudeBot /bv plugin.")
- A4-layout, header/footer med rapport-ID + datum

### MANDATORY-TESTS-4.3
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: API-route existerar
ls -la /mnt/storage/aiscanner/app/api/generate-pdf/route.ts
# PASS: filen existerar

# Test 2: TypeScript OK
cd /mnt/storage/aiscanner && npx tsc --noEmit 2>&1 | grep "generate-pdf" || echo "OK: inga generate-pdf errors"
# PASS: inga generate-pdf errors

# Test 3: Generera PDF från sparad ScanResult
# Förutsätter att 4.2 (persistens) har en sparad scan — använd ID från test
SCAN_ID="<id-från-4.2-test>"
curl -s -X POST http://localhost:8010/api/generate-pdf \
  -H "Content-Type: application/json" \
  -d "{\"scanId\":\"${SCAN_ID}\"}" \
  -o /tmp/test-rapport.pdf

# Verifiera PDF
python3 -c "
import os
path = '/tmp/test-rapport.pdf'
assert os.path.exists(path), 'FAIL: PDF-fil skapades inte'
size = os.path.getsize(path)
assert size > 50000, f'FAIL: PDF för liten ({size} bytes) — troligen tom/trasig'
# Kontrollera PDF-header
with open(path, 'rb') as f:
    header = f.read(5)
assert header == b'%PDF-', f'FAIL: inte en giltig PDF (header: {header})'
print(f'PASS: PDF genererad ({size} bytes)')
"
# PASS: PDF genererad
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Öppna PDF manuellt — verifiera visuellt
# Checklista:
#   PASS: A4-format
#   PASS: Header med rapport-ID + datum
#   PASS: Alla 32 kontroller synliga
#   PASS: Poängcirklar renderade korrekt (inte tomma SVG)
#   PASS: Inga avklippta sektioner
#   PASS: Footer med rapport-ID
```

**Levererar:** PDF av premiumrapport.

---

### 4.4 — Premium webbsida med inlogg

**Scope:** `app/report/[scanId]/page.tsx`

**Vad:**
- Dynamisk route: `/report/{scanId}`
- Ladda ScanResult → rendera PremiumReport
- Enkel autentisering: scanId + email-token (skickas via email)
- Ingen användarregistrering — token-baserad access

### MANDATORY-TESTS-4.4
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Route existerar
ls -la /mnt/storage/aiscanner/app/report/\[scanId\]/page.tsx
# PASS: filen existerar

# Test 2: Build OK (dynamisk route kompilerar)
cd /mnt/storage/aiscanner && npm run build 2>&1 | tail -10
# PASS: "✓ Compiled successfully" + /report/[scanId] listad i output

# Test 3: Sida renderar med giltig token
SCAN_ID="<id-från-4.2-test>"
TOKEN="<genererad-token-för-test>"
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8010/report/${SCAN_ID}?token=${TOKEN}"
# PASS: HTTP 200

# Test 4: Ogiltig token → nekad
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8010/report/${SCAN_ID}?token=invalid-token"
# PASS: HTTP 401 eller 403

# Test 5: Ogiltigt scanId → 404
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8010/report/nonexistent-id?token=anything"
# PASS: HTTP 404

# Test 6: Utan token → redirect eller login-sida
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8010/report/${SCAN_ID}"
# PASS: HTTP 401 eller 302
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Visuell verifiering i browser
# Öppna http://100.72.180.20:8010/report/${SCAN_ID}?token=${TOKEN}
# Checklista:
#   PASS: PremiumReport renderas komplett
#   PASS: Alla 32 kontroller synliga
#   PASS: Ankarlänkar fungerar (klick → scrollar till rätt lösning)
#   PASS: Rapport-ID + datum i footer
#   PASS: Ingen tillgång utan token
```

**Levererar:** Webbsida med premiumrapport.

---

### 4.5 — Betalflöde

**Scope:** Integration med Stripe/Swish

**Vad:**
- CTA "Beställ fullständig analys — 499 kr" → betalformulär
- Efter betalning: spara order, skicka notis till Jens
- Jens reviewar → godkänner → trigger email + PDF

### MANDATORY-TESTS-4.5
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Stripe/Swish webhook endpoint existerar
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8010/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# PASS: HTTP 400 (bad request, inte 404) — endpointen finns men avvisar ogiltiga payloads

# Test 2: CTA-knapp renderar med korrekt pris
curl -s http://localhost:8010 | python3 -c "
import sys
html = sys.stdin.read()
assert '499' in html, 'FAIL: priset 499 kr saknas på sidan'
print('PASS: CTA med 499 kr finns')
"
# PASS: CTA med 499 kr finns

# Test 3: Webhook-signatur validering
# Skicka webhook utan korrekt Stripe-signatur
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8010/api/payment/webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: invalid" \
  -d '{"type":"checkout.session.completed"}'
# PASS: HTTP 400 (signatur avvisad)
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Betalflöde — testläge (Stripe test mode / mock)
# Kör en testbetalning med Stripe test-kort (4242 4242 4242 4242)
# Checklista:
#   PASS: CTA öppnar betalformulär (Stripe Checkout / embedded form)
#   PASS: Testbetalning med 4242-kort → success
#   PASS: Order sparas i data/orders/{orderId}.json
#   PASS: Jens får notis (Telegram eller email)
#   PASS: ScanResult kopplas till order

# Gate 2: Verifiera order-persistens
ls -la /mnt/storage/aiscanner/data/orders/
# PASS: JSON-fil skapad för testordern

# Gate 3: Dubblettskydd — samma webhook 2x
# Skicka samma event_id 2 gånger → andra ska ignoreras
# PASS: Bara en order skapad
```

**Levererar:** Komplett betalflöde.

---

### 4.6 — Review-verktyg för Jens

**Scope:** `app/admin/[scanId]/page.tsx` eller CLI-verktyg

**Vad:**
- Visa premiumrapport
- Jens kan: godkänna, justera poäng, lägga till kommentar
- "Skicka till kund"-knapp → trigger email + PDF

### MANDATORY-TESTS-4.6
> **OVERSEER:** Kopiera ALLT nedan till sub-agentens prompt. Agenten är INTE klar
> förrän varje rad som börjar med PASS har bekräftats med faktisk output.

```bash
# Test 1: Admin-route existerar
ls -la /mnt/storage/aiscanner/app/admin/\[scanId\]/page.tsx
# PASS: filen existerar

# Test 2: Build OK
cd /mnt/storage/aiscanner && npm run build 2>&1 | tail -10
# PASS: "✓ Compiled successfully" + /admin/[scanId] listad

# Test 3: Admin-sida renderar
SCAN_ID="<id-från-4.2-test>"
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8010/admin/${SCAN_ID}"
# PASS: HTTP 200

# Test 4: Godkänn-flöde
curl -s -X POST "http://localhost:8010/api/admin/approve" \
  -H "Content-Type: application/json" \
  -d "{\"scanId\":\"${SCAN_ID}\"}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert r.get('approved') == True, 'FAIL: approve returnerade inte approved=true'
print('PASS: rapport godkänd')
"
# PASS: rapport godkänd

# Test 5: "Skicka till kund" → trigger email + PDF
curl -s -X POST "http://localhost:8010/api/admin/deliver" \
  -H "Content-Type: application/json" \
  -d "{\"scanId\":\"${SCAN_ID}\",\"email\":\"jens@example.com\"}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert r.get('emailSent') == True, 'FAIL: email inte skickad'
assert r.get('pdfGenerated') == True, 'FAIL: PDF inte genererad'
print('PASS: leverans triggad (email + PDF)')
"
# PASS: leverans triggad (email + PDF)
```

**OVERSEER-GATE (körs av overseern, INTE sub-agenten):**
```bash
# Gate 1: Admin-sida visar premiumrapport + review-kontroller
# Öppna http://100.72.180.20:8010/admin/${SCAN_ID}
# Checklista:
#   PASS: PremiumReport renderas komplett (alla 32 kontroller)
#   PASS: "Godkänn"-knapp synlig
#   PASS: "Justera poäng"-kontroll (slider/input för varje sektion)
#   PASS: "Lägg till kommentar"-textarea
#   PASS: "Skicka till kund"-knapp synlig

# Gate 2: Admin kräver autentisering (valfritt — basic auth eller IP-whitelist)
# Verifiera att admin-sidorna inte är publikt tillgängliga
# PASS: admin ej åtkomlig utan autentisering
```

**Levererar:** Manuellt review-steg innan leverans.

---

## Modell- & agentstrategi

> **Regel:** Opus tänker, Sonnet kodar, Haiku verifierar. Aldrig låt Sonnet/Haiku göra arkitekturbeslut.

### Modellval per steg

```
Opus    → Arkitektur, kontrakt, integration, code review
Sonnet  → Implementera steg, skriva kod, refaktorera prompter
Haiku   → Verifiering, mekaniska ändringar, tester, listor
```

#### Fas 1

| Steg | Modell | Motivering |
|------|--------|------------|
| 1.1 Zod-schema | **Opus** | Schemat är kontraktet allt bygger på. Fel här = allt faller. |
| 1.2 Alt-texter | **Sonnet** | Cheerio-selektor + nytt fält i interface. Rakt på. |
| 1.3 Internlänkning | **Sonnet** | Samma typ av arbete som 1.2. |
| 1.4 Semantisk HTML | **Sonnet** | Samma typ av arbete som 1.2. |
| 1.5 HTTPS | **Haiku** | En rad: `url.startsWith('https://')`. |
| 1.6 Kontaktinfo | **Haiku** | Regex-byte, en rad. |
| 1.7 NAP false positive | **Haiku** | Boolean → null, ändra finding-sträng. |
| 1.8 E-A-T word-boundary | **Haiku** | Regex-byte. |
| 1.9 Recensionssvar | **Haiku** | Sanity-check, 3 rader. |
| 1.10 Poängberäkning | **Opus** | Vikter + algoritm kräver domänförståelse. Måste vara rätt. |
| 1.11 Städer 50 | **Haiku** | Kopiera lista. Mekaniskt. |
| 1.12 llms.txt | **Sonnet** | Modifiera Flash-prompt + lägga till fält. |
| 1.13 AI-crawlers | **Sonnet** | Utöka lista + ändra parse-logik. |
| 1.14 Social-plattformar | **Haiku** | Lägg till strängar i array. |

#### Fas 2

| Steg | Modell | Motivering |
|------|--------|------------|
| 2.1 checkResultBuilder | **Opus** | Centralt — mappar 37 checks från alla datakällor. Logikfel här = hela rapporten fel. |
| 2.2 Flash #1 prompt | **Sonnet** | Prompt-refaktorering efter tydlig spec. |
| 2.3 Flash #2 prompt | **Sonnet** | Samma som 2.2. |
| 2.4 Flash #3 prompt | **Sonnet** | Samma som 2.2. |
| 2.5 Syntesprompt | **Opus** | Svåraste prompten — strukturerad output + ärlig konkurrentanalys. |
| 2.6 AI-omnämnande | **Sonnet** | Korsvalidering — medium komplexitet. |
| 2.7 Öppettider fallback | **Sonnet** | Schema-extraktion — medium komplexitet. |
| 2.8 Assemblera ScanResult | **Opus** | Integrationspunkt. Allt ska passa ihop, Zod-validering passera. |

#### Fas 3

| Steg | Modell | Motivering |
|------|--------|------------|
| 3.1 Rapportkomponenter | **Sonnet** | UI-komponenter efter spec. Tydlig mall (demo-sidan). |
| 3.2 FreeReport | **Opus** | Måste matcha demo pixel-perfekt + hantera 29 checks + låslogik. |
| 3.3 PremiumReport | **Opus** | Måste matcha demo + 32 checks + alla lösningar + ankarlänkar. |
| 3.4 Integration | **Sonnet** | Koppla ihop page.tsx + useAnalysis. |

#### Fas 4

| Steg | Modell | Motivering |
|------|--------|------------|
| 4.1 Email gratis | **Sonnet** | API-route + SSR av FreeReport. |
| 4.2 Persistens | **Sonnet** | Filsystem-spara/ladda med Zod-validering. |
| 4.3 PDF-generering | **Sonnet** | Playwright render → PDF. |
| 4.4 Premium webbsida | **Sonnet** | Dynamisk route + token-auth. |
| 4.5 Betalflöde | **Opus** | Pengar = nolltolerans för buggar. |
| 4.6 Review-verktyg | **Sonnet** | Admin-UI. |

### Sub-agent-mönster

#### Mönster 1: Implementera + Verifiera (varje steg)

```
Opus (orchestrator) ger instruktion
  → Sonnet/Haiku-agent implementerar steget
  → Haiku-agent kör verifieringskommandot från planen
  → Opus reviewar diff:en innan commit
```

#### Mönster 2: Parallella oberoende steg

Steg som rör OLIKA filer kan köras parallellt. Steg som rör SAMMA fil körs sekventiellt.

```
OK att parallellisera (olika filer):
  Agent A (Sonnet): 1.2 alt-texter      [scraper.ts]
  Agent B (Haiku):  1.7 NAP             [directoryChecker.ts]
  Agent C (Haiku):  1.8 E-A-T           [enhancedScraper.ts]
  Agent D (Haiku):  1.5 HTTPS           [route.ts]

INTE parallellt (samma fil — scraper.ts):
  1.2 → 1.3 → 1.4 → 1.6 → 1.11  (sekventiellt)

INTE parallellt (samma fil — route.ts):
  1.5 → 1.9 → 1.12  (sekventiellt)
```

Om worktrees används (`isolation: "worktree"`) kan fler köras parallellt, men merge-konflikter måste hanteras efteråt.

#### Mönster 3: Fas-gate med Opus review

**OBLIGATORISKT** efter varje fas, innan nästa börjar:

```
Opus-review:
  1. Läs ALLA ändrade filer
  2. Kör full scan mot testdomän (curl → JSON)
  3. Verifiera att alla nya fält finns i API-svaret
  4. Verifiera att befintlig funktionalitet inte gått sönder
  5. Kör npm run build — inga TypeScript-errors
  6. Commit fas-checkpoint med sammanfattning
```

Utan fas-gate → starta INTE nästa fas.

### Sessionsstrategi

#### Session 1: Fas 1 (Opus orchestrator)

```
1. Opus skapar Zod-schema (1.1) — själv, inte delegerat
2. Dispatcha parallellt:
   - Sonnet: 1.2 alt-texter [scraper.ts]
   - Haiku:  1.7 NAP [directoryChecker.ts]
   - Haiku:  1.8 E-A-T [enhancedScraper.ts]
3. Sekventiellt i scraper.ts: 1.3, 1.4, 1.6, 1.11
4. Sekventiellt i route.ts: 1.5, 1.9, 1.12
5. Parallellt: 1.13 [enhancedScraper.ts], 1.14 [enhancedScraper.ts] (sekventiellt sinsemellan)
6. Opus: 1.10 poängberäkning — själv
7. Fas-gate: full scan + build + review
8. Commit
```

#### Session 2: Fas 2 (Opus gör 2.1, 2.5, 2.8 själv)

```
1. Opus: 2.1 checkResultBuilder — själv
2. Dispatcha parallellt:
   - Sonnet: 2.2 Flash #1
   - Sonnet: 2.3 Flash #2
   - Sonnet: 2.4 Flash #3
3. Opus: 2.5 syntesprompt — själv
4. Dispatcha parallellt:
   - Sonnet: 2.6 AI-omnämnande
   - Sonnet: 2.7 öppettider
5. Opus: 2.8 assemblera — själv
6. Fas-gate: full scan → Zod-validering passerar → alla 37 checks i svaret
7. Commit
```

#### Session 3: Fas 3 (Opus designar, Sonnet bygger)

```
1. Sonnet: 3.1 rapportkomponenter
2. Opus: 3.2 FreeReport — själv (pixel-match mot demo)
3. Opus: 3.3 PremiumReport — själv (pixel-match mot demo)
4. Sonnet: 3.4 integration
5. Fas-gate: visuell jämförelse med rapport-demo.html
6. Commit
```

#### Session 4: Fas 4 (Sonnet implementerar, Opus reviewar)

```
1. Sonnet: 4.1 email + 4.2 persistens (parallellt)
2. Sonnet: 4.3 PDF + 4.4 webbsida (parallellt)
3. Opus: 4.5 betalflöde — själv
4. Sonnet: 4.6 review-verktyg
5. Fas-gate: end-to-end test (scan → betala → review → leverans)
6. Commit
```

### Tumregler

| Fråga | Svar |
|-------|------|
| Ska jag tänka? | **Opus** |
| Ska jag koda? | **Sonnet** |
| Ska jag kolla? | **Haiku** |
| Är det mekaniskt? | **Haiku** |
| Kan det gå fel subtilt? | **Opus** |
| Rör det pengar? | **Opus** |
| Är stegen oberoende? | Parallella agenter |
| Rör de samma fil? | Sekventiellt |
| Är fasen klar? | Fas-gate med Opus review |

---

## Beroenden mellan steg

```
Fas 1 (alla steg parallella, inga beroenden):
  1.1 ──────┐
  1.2-1.14 ─┤
             │
Fas 2 (beror på 1.1):
  2.1 ← 1.1
  2.2 ← 1.1 + 1.5 + 1.12 + 1.13
  2.3 ← 1.1
  2.4 ← 1.1 + 1.8
  2.5 ← 1.1
  2.6 ← (fristående)
  2.7 ← (fristående)
  2.8 ← 2.1 + 2.2 + 2.3 + 2.4 + 2.5 (samlar allt)

Fas 3 (beror på 2.8):
  3.1 ← 1.1 (bara typer behövs)
  3.2 ← 3.1 + 2.8
  3.3 ← 3.1 + 2.8
  3.4 ← 3.2 + 3.3

Fas 4 (beror på 3.2-3.3):
  4.1 ← 3.2
  4.2 ← 2.8
  4.3 ← 3.3 + 4.2
  4.4 ← 3.3 + 4.2
  4.5 ← 4.4
  4.6 ← 4.2 + 4.4
```

---

## Sammanfattning

| Fas | Steg | Levererar |
|-----|------|-----------|
| **1** | 14 steg | Zod-schema, alla 37 scraper-fält, poängberäkning, bugfixes |
| **2** | 8 steg | Strukturerad AI-output, validerad JSON, ärlig konkurrentanalys |
| **3** | 4 steg | Template-driven gratis + premiumrapport, pixel-perfekt |
| **4** | 6 steg | Email, PDF, webbsida, betalning, review-verktyg |
| **Totalt** | **32 steg** | Vattentät pipeline: scan → validering → rapport → leverans |

Varje steg har scope, verifiering, och leveranskriterie. Inga steg kräver att hela systemet byggs om — varje fas bygger på föregående och lämnar projektet fungerande.
