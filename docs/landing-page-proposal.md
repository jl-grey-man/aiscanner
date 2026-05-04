# AI Search Scanner — Landningssida: Designforslag

**Datum:** 2026-04-27
**Status:** Forslag, ej implementation

---

## Overgripande narrativ

**Historien vi berattar:**

Googles blaklamar ar slut. Sedan 2024 har ChatGPT, Perplexity och Google AI Overview borjat *svara* pa fragor istallet for att lista lankar. Det betyder att nar nagon soker "basta tandlakare Goteborg" far de ett namn — inte tio. Antingen ar det ditt foretag, eller sa ar det en konkurrent.

Det har ar inte en framtida trend. Det hander nu. Och de flesta svenska foretag har ingen aning om att de ar osynliga.

**Perspektivet:** Vi skriver inte for SEO-norder. Vi skriver for foretagsagare — personen som gor tusen saker om dagen och inte har tid att lasa 4000 ord om schema markup. Tonen ar: "det har maste du veta, och sa har gor du nagot at det."

**Narrativets bagar:**
1. Nagonting har forandrats (AI har andrat sokning)
2. Det paverkar dig (dina kunder hittar inte dig langre)
3. Det ar inte svart att fixa (konkreta steg)
4. Vi kan visa dig exakt var du star (verktyget)

---

## Sektionsstruktur (uppifrån och ner)

| # | Sektion | Syfte | CTA |
|---|---------|-------|-----|
| 1 | **Hero** | Fanga uppmarksamhet. Stor rubrik + en mening. | URL-input |
| 2 | **Forklararen** | Vad ar AI-sokning? Kort, visuellt, tydligt. | — |
| 3 | **Problemet** | Varfor det spelar roll for lokala foretag. Siffror. | Mjuk CTA-text |
| 4 | **Checklistan** | 7 konkreta saker AI tittar pa. Genuin kunskap. | — |
| 5 | **Foretags-exemplet** | Fore/efter — ett fiktivt men realistiskt case. | URL-input (andra) |
| 6 | **Vanliga misstag** | 3 saker foretag tror racker men inte gor det. | — |
| 7 | **Verktyget** | Kort forklaring + slutlig CTA. | URL-input (tredje) |
| 8 | **Footer** | Minimal. | — |

---

## Sektion 1: Hero

### Visuellt
- Fullbredd, bg-zinc-950, centrerat
- Overst: liten pill/badge med texten "AI SEO for svenska foretag"
- Stor rubrik (text-5xl/6xl) i vit med accentfarg pa nyckelord
- Underrubrik i zinc-400, max 2 rader
- URL-input centrerad under texten (bredare an nuvarande, mer andrum)
- Under inputfaltet: en liten rad med "Gratis. 23 kontroller. Tar ca 30 sekunder."

### Innehall

**Badge:**
> AI SEO for svenska foretag

**Rubrik:**
> Dina kunder fragar AI.
> Vad svarar den om dig?

**Underrubrik:**
> 64% av alla sokningar ger nu ett AI-genererat svar istallet for en lanklista.
> Om ditt foretag inte ar optimerat for det — syns du inte.

**Under URL-input:**
> Gratis analys. 23 kontroller. Resultat pa 30 sekunder.

---

## Sektion 2: Forklararen — "Sokning har andrats. Pa riktigt."

### Visuellt
- Tva-kolumns layout (md:grid-cols-2)
- Vanster: "Sa funkade det forr" — miniversion av Google-sokresultat (kan atervanda befintliga SeoSplit-animationen, anpassad till morkt tema)
- Hoger: "Sa funkar det nu" — ChatGPT/Perplexity-stil konversation dar AI:n ger ETT svar
- Under: en tagline
- Morkt tema, subtila borders (zinc-800)

### Innehall

**Rubrik:**
> Sokning har andrats. Pa riktigt.

**Vansterkolumn — "Forr: Google"**
Visa en stiliserad Google-sokning dar anvandaren skriver "basta tandlakare goteborg" och far 10 blalanklar. Markera #3 som "Du" med en liten badge.

**Hogerkolumn — "Nu: AI-sokning"**
Visa en ChatGPT-stil konversation:
- Anvandare: "Vilken ar den basta tandlakaren i Goteborg?"
- AI: "Baserat pa recensioner och tillganglighet rekommenderar jag **Tandvardsgruppen City** — de har online-bokning, tydliga priser och over 200 femstjarnsrecensioner pa Google."

En enda citering. Inga andra alternativ.

**Tagline under bada:**
> Forr tavlade alla om plats 1–10. Nu finns det **ett svar**. Antingen ar det du — eller sa ar det inte det.

### Forandringar fran nuvarande
Den befintliga SeoSplit-komponenten ar en bra grund. Den behover:
- Bytas till morkt tema (morka bakgrunder, ljus text)
- Goras annu tydligare — storsta forandringen ar att Google-sidan visar "du finns har nere pa plats 3" medan AI-sidan visar "en konkurrent far HELA svaret"
- Telefon-mockupen pa hogersidan ar snygg, behalles

---

## Sektion 3: Problemet — "Det handlar om pengar"

### Visuellt
- Centrerad text-sektion med siffror i stor typsnitt
- Tre "stat cards" i en rad (md:grid-cols-3)
- Varje kort har en stor siffra (text-4xl, accent-farg), en rubrik och en mening
- Under korten: en stycke forklaringstext

### Innehall

**Rubrik:**
> Varfor du borde bry dig (i kronor och oren)

**Tre stat-kort:**

**Kort 1:**
- Siffra: **64%**
- Rubrik: av soktrafiken gar via AI
- Text: Googles AI Overview, ChatGPT och Perplexity ger sammanfattade svar — inte lankar. 64% av sokningarna har nu ett AI-genererat svar hogst upp pa sidan.

**Kort 2:**
- Siffra: **1 av 10**
- Rubrik: ar allt som citeras
- Text: AI-sokningar citerar i snitt 1–3 kallor. Resten ar osynliga. Om du inte ar en av dem — existerar du inte for den som soker.

**Kort 3:**
- Siffra: **0 kr**
- Rubrik: ar vad det kostar att borja
- Text: De flesta forandringarna som kravs ar gratis — schema markup, battre metabeskrivningar, tydligare kontaktinfo. Inga dyra verktyg, ingen byraahjord.

**Forklaringstext under:**
> Det har ar inte en trendrapport fran Silicon Valley. Det ar verkligheten for svenska foretag just nu. Nar en potentiell kund fragar ChatGPT "vilken rormokar i Malmo har bast priser?" och ditt foretag inte dyker upp — da gar den kunden till nagon annan. Inte for att du ar samre. Utan for att AI:n inte vet att du finns.

---

## Sektion 4: Checklistan — "7 saker AI tittar pa nar den valjer vem den rekommenderar"

### Visuellt
- Numrerad lista, 7 punkter
- Varje punkt har en rubrik (font-semibold, vit), en kort forklaring (zinc-400), och en liten indikator-ikon
- Ikoner: check (gron), varning (gul), kors (rod) — men i forklaringssyfte, inte som resultat
- Layout: enkel lista, vaxlande bakgrund (zinc-900/zinc-950) for lasbarhet
- En liten "Hur star du till?"-knapp efter punkt 4 (soft-CTA som scrollar ner till URL-input)

### Innehall

**Rubrik:**
> 7 saker AI tittar pa nar den valjer vem den rekommenderar

**Inledning:**
> AI-sokmotorer ar inte magiska. De foljer regler. De laser din hemsida och forsoker forsta: vad ar det har for foretag, var ligger det, vad erbjuder det, och gar det att lita pa? Har ar de sju viktigaste signalerna.

**1. Schema markup (strukturerad data)**
> Det har ar det narmaaste en "AI-manual" for din sajt. Schema markup ar osynlig kod som beratar for AI exakt vad ditt foretag ar: namn, adress, oppettider, bransch. Utan det tvingas AI:n gissa — och AI gissar sallom ratt.
>
> **Exempel:** En JSON-LD-kodbit som sager "det har ar en tandlakare pa Avenyn i Goteborg med telefonnummer 031-XXX XX XX" ar mer vard an tio sidor SEO-text.

**2. NAP-konsistens (Name, Address, Phone)**
> Ditt foretagsnamn, adress och telefonnummer maste sta pa din hemsida — garna pa varje sida. Och det maste matcha *exakt* med Google Business Profile. AI korskontrollerar. Om din hemsida sager "Gatan 12" men Google sager "Gatan 12A" tappar du trovardighet.

**3. Google Business Profile**
> Din Google-profil ar AI:ns favoritkalla. Betyg, recensioner, oppettider, bilder — allt anvands. Om du inte har en verifierad GBP, eller om den ar ouppdarerad, ar det som att inte ha en hemsida alls. 2026 ar GBP viktigare an din hemsida for AI-synlighet.

**4. Metabeskrivningar och titlar**
> Din meta description ar det forsta AI laser. Det ar din elevator pitch — pa 155 tecken. Om den ar generisk ("Valkommen till var hemsida!") eller saknas helt, har AI inget att ga pa. Skriv den som ett svar pa fragan "varfor ska jag valja det har foretaget?"
>
> **Bra:** "Goteborgstandlakare med akuttider samma dag. Vuxna och barn. Online-bokning."
> **Daligt:** "Valkommen till var tandlakarmottagning. Vi finns i Goteborg."

**5. Innehallskvalitet och unikhet**
> AI premierar sidor som svarar pa fragor. Inte sidor fyllda med nyckelord, utan sidor som verkligen forklarar vad du gor, for vem, och varfor. En FAQ-sida med vanliga kundfragar ar guld. "Vi erbjuder kvalitativa tjanster till konkurrenskraftiga priser" ar ingenting.

**6. Teknisk hygien (robots.txt, sitemap, HTTPS)**
> Om din hemsida blockerar AI fran att crawla den (via robots.txt), eller om du inte har en sitemap som beratar vilka sidor som finns — da ar det som att lasa dorren nar en kund vill komma in. HTTPS ar numera minimum. Utan det tror bade Google och AI att din sajt ar osaker.

**7. Recensioner och sociala bevis**
> AI laser recensioner. Inte bara stjarnbetyget — aven texten. Ord som "rekommenderar varmt", "professionellt bemotande" och "snabb service" viktas hogre. 50 recensioner med 4.5 stjarnor gar fore 5 recensioner med 5.0. Volume matters.

**Soft-CTA efter punkt 7:**
> Hur manga av de har 7 har din hemsida? Vi kan berata det pa 30 sekunder.
> [URL-input eller "Analysera din sida"-knapp som scrollar till toppen]

---

## Sektion 5: Foretags-exemplet — "Fore och efter"

### Visuellt
- Tva-kolumns layout (fore/efter)
- "Fore"-sidan ar i dampade farger (zinc-700 text, roda ikoner)
- "Efter"-sidan ar i starkare farger (vita text, grona ikoner)
- Visa en forenklad rapport liknande den verktyget genererar — men statisk
- Fiktivt foretag: "Erikssons Ror & VVS, Linkaoping"

### Innehall

**Rubrik:**
> Fran osynlig till citerad — ett exempel

**Inledning:**
> Vi skannade en fiktiv rormokare i Linkaoping for att visa vad som spelar roll. Det har ar vad AI ser — fore och efter optimering.

**Fore (poanng: 31/100):**
- Schema markup: Saknas helt
- NAP: Telefonnummer finns, men ingen adress pa hemsidan
- Metabeskrivning: "Valkommen till Erikssons Ror"
- Google Maps: Saknas
- robots.txt: Blockerar alla crawlers
- Innehall: 3 sidor, inget FAQ, inga ortsnamn i texten

**Efter (poanng: 82/100):**
- Schema markup: LocalBusiness JSON-LD med alla uppgifter
- NAP: Komplett pa varje sida + matchat med GBP
- Metabeskrivning: "Akut rormokar i Linkaoping. Dygnet runt-jour, fasta priser. Boka online eller ring 013-XXX XX XX."
- Google Maps: Embed pa kontaktsidan
- robots.txt: Oppet for alla AI-crawlers
- Innehall: FAQ med 12 vanliga fragor, ortsnamn i alla rubriker

**Under exemplet:**
> Skillnaden? Ungefar 2 timmars jobb. Ingen byra, ingen konsult — bara veta vad som behovs.

**CTA:**
> Vill du se hur din hemsida ser ut for AI?
> [URL-input]

---

## Sektion 6: Vanliga misstag — "Tre saker som inte racker langre"

### Visuellt
- Tre kort i en rad (md:grid-cols-3)
- Varje kort med en liten ikon (typ emojisstorlek men som SVG), rubrik, och text
- Bakgrund: zinc-900, border zinc-800
- Tonalitet: rakt pa sak, inte dommande

### Innehall

**Rubrik:**
> Tre saker som inte racker langre

**Kort 1: "Jag har ju en hemsida"**
> Att ha en hemsida ar inte samma sak som att vara synlig for AI. De flesta hemsidorna ar byggda for manniskor — inte for maskiner. Utan strukturerad data ar din hemsida bara en vaggtidning som ingen AI bryr sig om att lasa.

**Kort 2: "Vi ligger bra pa Google"**
> Bra Google-ranking ar inte samma sak som AI-synlighet. Google AI Overview valjer sin egen kalla — och det ar oftast inte #1. Det ar den som ar bast strukturerad. Du kan ligga ettan pa Google och anda vara helt ignorerad av AI-svaret.

**Kort 3: "Vi har anlitat en SEO-byra"**
> Traditionell SEO handlar om lankar, nyckelord och sidtitlar. AI-sokning bryr sig om schema markup, NAP-konsistens, JSON-LD och strukturerat innehall. De flesta SEO-byraer har inte anpassat sig annu. Fraga din byra: "optimerar ni for ChatGPT?" — om svaret ar tystnad, har du svaret.

---

## Sektion 7: Verktyget — Final CTA

### Visuellt
- Centrerad, stor sektion med mer luft
- Rubrik + kort text + URL-input
- Under inputen: tre ikoner med text (Gratis / 23 kontroller / 30 sekunder)
- Subtil gradient-border runt hela sektionen (zinc-800 till accent/10)

### Innehall

**Rubrik:**
> Se exakt hur AI ser pa din hemsida

**Text:**
> Vi kontrollerar 23 saker som paverkar hur ChatGPT, Perplexity och Google AI Overview bedomner ditt foretag. Du far en rapport med konkreta forbattringsforslag — gratis.

**Under URL-input, tre punkter:**
- Gratis — ingen registrering, inget kreditkort
- 23 kontroller — teknik, lokal synlighet, AI-beredskap, innehall
- 30 sekunder — resultat direkt pa skarmen

---

## Sektion 8: Footer

Minimal. En rad.

> AI Search Scanner — byggd for svenska foretag. Har fragor? [kontakt-lank]

---

## Hur verktyget vavs in

Verktyget finns pa **tre stallen** pa sidan:

1. **Hero (toppen)** — for den som redan vet vad det ar och bara vill anvanda det
2. **Efter checklistan (sektion 4)** — for den som precis last om vad AI kollar och tanker "hur ar det med min sajt?"
3. **Slutlig CTA (sektion 7)** — for den som last hela sidan och ar overtygad

Samma komponent (UrlInput) pa alla tre stallen. Ingen popup, inget gate — bara ett inputfalt. Forsta anvandarupplevelsen ska vara friktion-fri.

**Viktigt:** Verktyget ar aldrig sidans huvudpoang. Texten ar. Verktyget ar konsekvensen av texten — "nu nar du forstar varfor det spelar roll, sa kan du kolla din sajt har."

---

## Visuella ideer

### Farger och tema
- **Bakgrund:** bg-zinc-950 (morkt, nara svart)
- **Sektionsvaxling:** Vaxla mellan zinc-950 och zinc-900 for att skilja sektioner
- **Text:** zinc-100 (rubriker), zinc-400 (brodtext)
- **Accent:** Behall #2563eb (bla) for CTA-knappar och highlightade ord
- **Gron/rod/gul:** For checklistans statusikoner och fore/efter-sektionen
- **Borders:** zinc-800, subtila

### Typografi
- Rubriker: font-bold, tracking-tight, text-4xl-6xl
- Brodtext: text-lg (storre an default for lasbarhet pa morkt tema)
- Monospace for kodexempel i checklistan (schema markup)

### Layout
- Max-width: max-w-4xl for textsektioner (smalare an nuvarande max-w-5xl for battre laslangd)
- Generosa marginaler mellan sektioner (py-24 eller mer)
- Stat-korten i sektion 3: Rundade, zinc-900 bakgrund, subtil border, stor siffra

### Animationer
- SeoSplit-animationen fran nuvarande sajt ar bra — behalles men anpassas for morkt tema
- Stat-siffror i sektion 3: Rull-animation nar de scrollas in i vy (countUp-effekt)
- Checklistan: Fade-in per punkt nar man scrollar
- Inga flashiga animationer — lugnt, professionellt

### Mobil
- Alla grid-layouts: grid-cols-1 pa mobil, grid-cols-2/3 pa md+
- Telefon-mockupen i SeoSplit: dold pa mobil (for smal), visas pa md+
- URL-input tar hela bredden pa mobil

### Bilder/illustrationer
- Inga stockbilder
- Koden/data ar illustrationen — schema markup-kodblock, fore/efter-rapporten, stat-siffrorna
- Eventuellt: en statisk "mini-rapport" i sektion 5 som ser ut som det faktiska verktygets output (bygger trovardighet)

---

## Sammanfattning av sidans flow

En besokare som aldrig hort talas om AI SEO landar pa sidan och:

1. **Laser rubriken** — "Dina kunder fragar AI. Vad svarar den om dig?" — och tanker "hm, intressant"
2. **Ser forklararen** — Forstar visuellt att sokning har andrats (lanklista vs ett svar)
3. **Ser siffrorna** — 64% av sokningar, 1 av 10 citeras — konkretion
4. **Laser checklistan** — "Jaha, sa det ar DET som spelar roll" — genuin kunskap
5. **Ser fore/efter** — "Det ar inte sa svart" — motivation
6. **Laser misstagen** — "Vi HAR ju en SEO-byra..." — igenkanning
7. **Nar slutlig CTA** — "Jag vill kolla min sajt" — overtygas

Varje sektion borde kunna las oberoende och fortfarande ge varde. Om nagon bara laser checklistan och gar darifrån — bra, de larde sig nagot. Om de sedan minns sidan och kommer tillbaka for att skanna — annu battre.

---

## Saker att bestamma innan implementation

1. **Statistik-kallor:** Siffrorna (64%, etc.) bor kunna styrkas. Antingen lank till kalla eller "enligt [rapport]". Trovardigare.
2. **Lead capture:** Ska email-formularet byggas in pa den nya landningssidan? STATUS.md namner det som #1-prioritet. Min rekommendation: nej, inte pa landningssidan. After free scan — gate full rapport bakom email. Landningssidan ska vara friktion-fri.
3. **Temat:** Nuvarande sajt har ljust tema (base: #f8fafc, frame: white). Morkt tema (zinc-950) kraver att ALLA existerande komponenter (FreeReport, FullReport, Progress, etc.) ocksa byts till morkt. Det ar ett storre jobb an bara landningssidan.
4. **SEO-meta for sjalva landningssidan:** Title, description, OG-taggar pa svenska. Sidan ska sjalv vara ett bra exempel pa det den predikar.
