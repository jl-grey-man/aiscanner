# Lead Generation Pipeline — AI Search Scanner
**Datum:** 2026-04-27
**Syfte:** Design och teknikval för automatiserad lead-sökning av svenska lokala företag som kan gynnas av analyze.pipod.net

---

## Sammanfattning

Rekommenderad pipeline: Google Places API (redan aktiv) som primär lead-källa, kompletterat med scraping av Eniro.se för e-postadresser. Leads filtreras via en snabb pre-scan (robots.txt + schema-kontroll) innan fullständig analys. E-post skickas via befintlig Proton/Hydroxide SMTP med personaliserat innehåll baserat på faktiska brister funna i pre-scanen.

**Viktigaste val:**
- Datakälla: Google Places API + Eniro.se-scraping
- Kontaktinfo: scraping av företagets egna webbsida (enklast, bäst GDPR-läge)
- E-postverktyg: Python + smtplib via Hydroxide (redan på Pi)
- GDPR: B2B cold outreach är tillåtet i Sverige under legitima intresset, med opt-out

---

## 1. Hitta leads automatiskt

### Tillgängliga datakällor — jämförelse

| Källa | Täckning | Kostnad | Teknisk svårighet | Ger e-post? | Rekommendation |
|---|---|---|---|---|---|
| **Google Places API** | Bred, verifierad, med webbplats-URL | $0.017/req (Text Search), $0.017 (Details) | Låg — du har API:n | Nej | **Primär källa** |
| **Eniro.se** | God täckning, svenska SME | Gratis (scraping) | Medel | Ibland ja | **Komplement** |
| **Hitta.se** | God täckning | Gratis (scraping) | Medel | Ibland ja | Alternativ |
| **AllaBranscher.se** | Branschindelad | Gratis (scraping) | Medel | Nej | Sekundär |
| **Bolagsverket API** | Officiell, alla org-nr | Gratis | Låg | Nej (ej webb) | Filtrering |
| **PRH/SCB-register** | Statistik | Gratis | Hög | Nej | Nej |
| Köpt lista (t.ex. Bisnode/Creditsafe) | Komplett | 5 000–50 000 kr | Låg | Ja (men gammal) | Ej rekommenderat |

### Rekommendation: Google Places API som primär källa

Du har redan API-nyckeln aktiv. Google Places Text Search returnerar:
- Företagsnamn
- Webbplats-URL (det vi behöver som ingångspunkt till scannern)
- Adress, telefon, kategori, betyg

**Kostnad:** Text Search = $0.017/anrop, Details = $0.017/anrop. Att köra 500 leads/månad kostar ca $17 — försumbart.

**Strategi:** Söka per bransch + stad. Exempel:

```python
CATEGORIES = [
    "tandläkare",
    "elektriker",
    "rörmokare",
    "restaurang",
    "fastighetsmäklare",
    "advokatbyrå",
    "redovisningsbyrå",
    "fysioterapeut",
    "frisör",
    "bilverkstad",
]

CITIES = [
    "Stockholm", "Göteborg", "Malmö", "Uppsala",
    "Linköping", "Örebro", "Västerås", "Helsingborg",
    "Norrköping", "Jönköping", "Umeå", "Lund",
    "Borås", "Eskilstuna", "Gävle", "Sundsvall",
]
```

Varje kombination (bransch × stad) = ett Places Text Search-anrop. 10 branscher × 16 städer = 160 anrop = **$2.72** för hela Sverige. Varje anrop ger upp till 20 resultat.

---

## 2. Hämta kontaktuppgifter

### Strategi: Scrapa företagets egna webbsida

Det enklaste och GDPR-säkraste alternativet. Webbplatsen är publik, e-postadressen är publik. Ingen tredjepartsdatakälla behövs.

**Vad Google Places ger oss:**
- `websiteUri` — webbplats-URL (nyckelingångspunkt)
- `nationalPhoneNumber` — telefon
- `displayName` — företagsnamn
- `formattedAddress` — fullständig adress
- `types` — bransch-kategorier

**Vad vi scraper från webbsidan:**
- E-postadress (regex på `mailto:` + vanliga mönster)
- Kontaktsida (`/kontakt`, `/contact`, `/om-oss`)
- Verifiering av NAP-data

```python
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

EMAIL_PATTERN = re.compile(
    r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b'
)

CONTACT_SLUGS = [
    '/kontakt', '/contact', '/kontakta-oss',
    '/om-oss', '/about', '/hitta-hit',
]

def extract_email_from_site(base_url: str) -> str | None:
    """Försöker hitta e-postadress från hemsida och kontaktsida."""
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; AIScannerBot/1.0)'}

    pages_to_check = [base_url]
    for slug in CONTACT_SLUGS:
        pages_to_check.append(urljoin(base_url, slug))

    emails_found = set()

    for url in pages_to_check[:4]:  # Max 4 sidor per företag
        try:
            r = requests.get(url, headers=headers, timeout=8)
            if not r.ok:
                continue

            # Kolla mailto:-länkar först (mest pålitliga)
            soup = BeautifulSoup(r.text, 'html.parser')
            for link in soup.find_all('a', href=re.compile(r'^mailto:')):
                email = link['href'].replace('mailto:', '').split('?')[0].strip()
                if '@' in email and is_valid_business_email(email):
                    emails_found.add(email.lower())

            # Regex på all text om mailto inte hittades
            if not emails_found:
                text_emails = EMAIL_PATTERN.findall(r.text)
                for e in text_emails:
                    if is_valid_business_email(e):
                        emails_found.add(e.lower())

        except Exception:
            continue

    if not emails_found:
        return None

    # Prioritera domän-matchande e-post (info@foretaget.se > gmail)
    domain = urlparse(base_url).netloc.replace('www.', '')
    for email in emails_found:
        if domain in email:
            return email

    return next(iter(emails_found))

def is_valid_business_email(email: str) -> bool:
    """Filtrera bort ogiltiga/testadresser."""
    skip_domains = {'example.com', 'test.com', 'placeholder.com'}
    skip_patterns = ['noreply', 'no-reply', 'donotreply', 'bounce']

    domain = email.split('@')[-1]
    local = email.split('@')[0]

    if domain in skip_domains:
        return False
    if any(p in local for p in skip_patterns):
        return False
    if '.' not in domain:
        return False
    return True
```

### Eniro.se som komplement

Eniro listar ofta e-postadresser och mobil som Google Places inte har. Bra att scrapa om webbsidan inte avslöjar e-post.

```python
def search_eniro(company_name: str, city: str) -> dict | None:
    """Sök i Eniro API (odokumenterat men stabilt)."""
    params = {
        'search_word': company_name,
        'geo_area': city,
        'lang': 'sv',
        'what': 'companies',
    }
    r = requests.get(
        'https://api.eniro.com/cs/v1/basic/suggest',
        params=params,
        headers={'User-Agent': 'Mozilla/5.0'},
        timeout=10
    )
    # Eniro har inget officiellt öppet API — scraping av HTML är alternativet
    # Respektera robots.txt, max 1 req/s
    ...
```

**OBS:** Eniro har ingen öppen API. Alternativet är HTML-scraping med BeautifulSoup + throttling. Hitta.se har liknande struktur. Se GDPR-sektionen för vad som gäller.

---

## 3. Filtrera och kvalificera leads

### Pre-scan filter (innan full AI-analys)

Målet är att köra en billig kontroll innan den dyra AI-analysen, och sortera bort:

1. Företag utan webbplats (Places ger `websiteUri = null`)
2. Webbplatser som inte svarar (timeout, 404, 403)
3. Webbplatser med redan bra AI-optimering (t.ex. har `llms.txt` + korrekt LocalBusiness-schema)

```python
import asyncio
import aiohttp
from dataclasses import dataclass

@dataclass
class LeadQualification:
    url: str
    has_website: bool
    site_reachable: bool
    has_llms_txt: bool
    has_local_business_schema: bool
    has_sitemap: bool
    score_estimate: str  # "poor" | "medium" | "good"
    should_scan: bool

async def pre_qualify_lead(session: aiohttp.ClientSession, url: str) -> LeadQualification:
    """Snabb 3-sekunders kontroll utan AI-anrop."""

    if not url:
        return LeadQualification(url='', has_website=False, site_reachable=False,
                                  has_llms_txt=False, has_local_business_schema=False,
                                  has_sitemap=False, score_estimate='poor', should_scan=False)

    try:
        # Hämta startsidan
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=6)) as r:
            if r.status >= 400:
                return LeadQualification(url=url, has_website=True, site_reachable=False,
                                          has_llms_txt=False, has_local_business_schema=False,
                                          has_sitemap=False, score_estimate='poor', should_scan=False)
            html = await r.text()
    except Exception:
        return LeadQualification(url=url, has_website=True, site_reachable=False,
                                  has_llms_txt=False, has_local_business_schema=False,
                                  has_sitemap=False, score_estimate='poor', should_scan=False)

    # Parallella kontroller
    base = url.rstrip('/')
    llms_ok, sitemap_ok = await asyncio.gather(
        check_url_exists(session, f"{base}/llms.txt"),
        check_url_exists(session, f"{base}/sitemap.xml"),
    )

    has_schema = 'LocalBusiness' in html or '"@type"' in html

    # Poänguppskattning (utan AI)
    signals_ok = sum([llms_ok, sitemap_ok, has_schema])

    if signals_ok == 0:
        score_estimate = 'poor'     # Sannolikt låg score → bra lead
        should_scan = True
    elif signals_ok == 1:
        score_estimate = 'medium'   # Partiellt optimerad → ok lead
        should_scan = True
    else:
        score_estimate = 'good'     # Troligen redan väloptimerad → hoppa över
        should_scan = False

    return LeadQualification(
        url=url, has_website=True, site_reachable=True,
        has_llms_txt=llms_ok, has_local_business_schema=has_schema,
        has_sitemap=sitemap_ok, score_estimate=score_estimate, should_scan=should_scan
    )

async def check_url_exists(session: aiohttp.ClientSession, url: str) -> bool:
    try:
        async with session.head(url, timeout=aiohttp.ClientTimeout(total=3)) as r:
            return r.status < 400
    except Exception:
        return False
```

### Full pipeline-flöde

```
Google Places Text Search (bransch + stad)
    ↓
Filtrera: websiteUri finns?
    ↓
Pre-qualify: nåbar? llms.txt? schema? sitemap?
    ↓
score_estimate == "poor" eller "medium" → kör full AI-scan
    ↓
Extrahera e-post från webbsidan
    ↓
Spara i SQLite-databas
    ↓
Skapa personaliserat e-postmeddelande
    ↓
Skicka via Hydroxide SMTP
```

---

## 4. Databas — lagra leads

En enkel SQLite-fil räcker för den här skalan.

```sql
CREATE TABLE leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identitet
    place_id TEXT UNIQUE,
    company_name TEXT NOT NULL,
    website_url TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    category TEXT,

    -- Qualify-status
    site_reachable BOOLEAN,
    has_llms_txt BOOLEAN,
    has_local_business_schema BOOLEAN,
    has_sitemap BOOLEAN,

    -- AI-scan resultat
    scan_score INTEGER,
    scan_summary TEXT,
    scan_critical_issues TEXT,  -- JSON
    scan_date TIMESTAMP,

    -- Outreach-status
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_date TIMESTAMP,
    email_opened BOOLEAN DEFAULT FALSE,
    reply_received BOOLEAN DEFAULT FALSE,
    opted_out BOOLEAN DEFAULT FALSE,

    -- Meta
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_city ON leads(city);
CREATE INDEX idx_category ON leads(category);
CREATE INDEX idx_email_sent ON leads(email_sent);
CREATE INDEX idx_opted_out ON leads(opted_out);
```

---

## 5. E-postförberedelse och utskick

### Personalisering — det som faktiskt ger öppningsrater

Det avgörande är att e-posten refererar till **deras specifika brister**, inte generisk text. Pre-scanen ger oss det vi behöver för personalisering redan utan full AI-analys. Full AI-scan ger ännu bättre personalisering.

**Exempelmall (baserad på pre-scan-data):**

```python
def build_email(lead: dict, scan_result: dict | None = None) -> dict:
    """Bygg personaliserat e-postmeddelande."""

    company = lead['company_name']
    city = lead['city']
    url = lead['website_url']
    category = lead['category']

    # Specifika brister att nämna
    problems = []
    if not lead['has_llms_txt']:
        problems.append("saknar llms.txt (den fil som berättar för ChatGPT och Perplexity vad ni erbjuder)")
    if not lead['has_local_business_schema']:
        problems.append("saknar strukturerad data som hjälper AI-sökmotorer förstå er verksamhet")
    if not lead['has_sitemap']:
        problems.append("saknar sitemap.xml vilket försvårar för AI-botar att indexera sidan")

    # Om vi har AI-scan-resultat, använd dem
    if scan_result:
        score = scan_result.get('score', '?')
        specific_issue = scan_result.get('criticalIssues', [{}])[0].get('title', '')
    else:
        score = None
        specific_issue = None

    # Ämnesrad — A/B-testa dessa varianter
    subjects = [
        f"Syns {company} på ChatGPT när kunder söker {category} i {city}?",
        f"Vi analyserade {url.replace('https://', '').replace('http://', '').rstrip('/')} — tre saker saknas",
        f"{company}: hur hittar AI-sökmotorer er egentligen?",
    ]

    # Brödtext
    problems_text = '\n'.join(f"- {p}" for p in problems[:3])

    if score is not None:
        score_line = f"Vår gratis-scan gav {url} betyget {score}/100 för AI-synlighet."
        cta = f"Se er fullständiga rapport (gratis): https://analyze.pipod.net/?url={url}"
    else:
        score_line = f"Vi körde en snabbkoll på {url} och hittade några saker som kan förbättras."
        cta = f"Kör en gratis analys av {url}: https://analyze.pipod.net/?url={url}"

    body = f"""Hej,

{score_line}

Vi hittade bland annat att {company}:
{problems_text}

Det här påverkar hur väl ni syns när potentiella kunder söker efter {category} i {city} via ChatGPT, Perplexity eller Google AI Overview — sökmotorer som nu används av miljontals svenska konsumenter.

{cta}

Analysen tar 30 sekunder och är helt gratis. Ni får en konkret lista på vad som behöver åtgärdas.

Vill ni inte ha fler mejl från oss? Svara bara med "Avregistrera" så tar vi bort er direkt.

Med vänlig hälsning,
AI Search Scanner
analyze.pipod.net
"""

    return {
        'subject': subjects[0],  # Välj variant eller A/B-testa
        'body': body,
        'to': lead['email'],
        'from': 'info@analyze.pipod.net',  # eller din Proton-adress
    }
```

### Skicka via Hydroxide SMTP

Befintlig SMTP på Pi, port 1025. Ingen ny infra behövs.

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time

def send_email(to: str, subject: str, body: str,
               smtp_host: str = '127.0.0.1', smtp_port: int = 1025,
               from_email: str = None) -> bool:
    """Skicka e-post via Hydroxide SMTP."""

    import os
    from_email = from_email or os.environ.get('PROTON_EMAIL')

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = from_email
    msg['To'] = to
    msg['List-Unsubscribe'] = f'<mailto:{from_email}?subject=Avregistrera>'

    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.login(from_email, os.environ.get('HYDROXIDE_PASSWORD', ''))
            server.sendmail(from_email, [to], msg.as_string())
        return True
    except Exception as e:
        print(f"SMTP-fel för {to}: {e}")
        return False

def run_outreach_batch(db_path: str, batch_size: int = 20, delay_secs: float = 30):
    """Skicka e-post till en batch leads. Throttlar för att undvika spam-flaggning."""
    import sqlite3

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    leads = cur.execute("""
        SELECT id, company_name, website_url, email, city, category,
               has_llms_txt, has_local_business_schema, has_sitemap,
               scan_score, scan_critical_issues
        FROM leads
        WHERE email IS NOT NULL
          AND email_sent = FALSE
          AND opted_out = FALSE
          AND site_reachable = TRUE
        ORDER BY scan_score ASC  -- börja med sämst score (bäst leads)
        LIMIT ?
    """, (batch_size,)).fetchall()

    sent = 0
    for row in leads:
        lead = dict(zip(['id','company_name','website_url','email','city','category',
                         'has_llms_txt','has_local_business_schema','has_sitemap',
                         'scan_score','scan_critical_issues'], row))

        email_data = build_email(lead)
        success = send_email(email_data['to'], email_data['subject'], email_data['body'])

        if success:
            cur.execute("""
                UPDATE leads SET email_sent = TRUE, email_sent_date = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (lead['id'],))
            conn.commit()
            sent += 1
            print(f"Skickat till {lead['company_name']} ({lead['email']})")

            time.sleep(delay_secs)  # 30 sek mellan varje — viktig throttling

    conn.close()
    print(f"Klart: {sent}/{len(leads)} mejl skickade")
```

### Throttling-regler (viktigt för leveransbarhet)

- Max 20 mejl/dag initialt, skala upp sakta
- 30 sekunders paus mellan varje mejl
- Aldrig fler än 5 mejl/timme till samma domän
- Prioritera lägst AI-score (de med mest att vinna)
- Spärra domäner om bounce-rate > 5%

---

## 6. GDPR och etik

### Vad som gäller i Sverige — B2B cold outreach

**Lagstiftning:** GDPR + LEK (Lag om elektronisk kommunikation). B2B skiljer sig från B2C.

**Tillåtet under GDPR artikel 6.1(f) — Legitima intressen:**

- Cold outreach till **företag** (juridiska personer) är tillåtet under legitima intressen
- Kontaktuppgifter som är **publikt tillgängliga** (webbsida, Eniro, Hitta.se) får användas
- Mottagarens **personliga** e-post (t.ex. `kalle@foretaget.se`) räknas som personuppgift — kräver rättslig grund
- **Generisk företagse-post** (`info@foretaget.se`, `kontakt@foretaget.se`) räknas inte som personuppgift

**Krav du måste uppfylla:**

1. **Opt-out måste finnas i varje mejl** — "Svara med Avregistrera" eller en avregistreringslänk
2. **Opt-out måste verkställas omedelbart** — uppdatera `opted_out = TRUE` i databasen
3. **Spara inte mer data än nödvändigt** — ta bort lead-data om opt-out
4. **Ange vem du är** — avsändarnamn och adress måste vara tydliga
5. **Inte vilseledande ämnesrad** — "Vi analyserade er sida" måste vara sant

**Vad du INTE får:**
- Skicka till privatpersoner (B2C = kräver aktivt samtycke)
- Köpa e-postlistor utan dokumenterat ursprung
- Dölja avsändarens identitet
- Ignorera opt-out-förfrågningar

**Praktisk checklista per mejl:**
- [ ] Avsändarens namn och domän är tydliga
- [ ] Ämnesraden är sann (vi har faktiskt analyserat sidan)
- [ ] Opt-out-instruktion finns i brödtexten
- [ ] List-Unsubscribe-header är med (hjälper mot spam-filtrering)
- [ ] Data kommer från publik källa (webbsida, Google Maps)

**IMY (Integritetsskyddsmyndigheten):** De har tillsynat B2B-utskick och konstaterat att legitima intressen kan tillämpas, men bara om utskicket är relevant för mottagarens verksamhet. En webbyrå som skickar om webboptimering till webbföretag = troligen ok. Slumpmässig masslistning = troligen inte ok. Vår case är stark: vi skickar ett relevant erbjudande till den typ av företag som faktiskt kan gynnas av det.

---

## 7. Komplett pipeline — steg för steg

### Fas 1: Lead-insamling (Python-skript, kör en gång/månad)

```python
# lead_collector.py — pseudokod för hela flödet

async def collect_leads_for_category(category: str, city: str, api_key: str):
    """Hämta leads från Google Places för en bransch+stad-kombination."""

    # Steg 1: Google Places Text Search
    places = await places_text_search(f"{category} {city}", api_key)

    qualified = []
    async with aiohttp.ClientSession() as session:
        for place in places:
            if not place.get('websiteUri'):
                continue  # Ingen webbsida → hoppa

            # Steg 2: Pre-qualify (5-10 sek per lead)
            qual = await pre_qualify_lead(session, place['websiteUri'])
            if not qual.should_scan:
                continue  # Redan väloptimerad → hoppa

            # Steg 3: Hämta e-post från webbsidan
            email = await extract_email_from_site(session, place['websiteUri'])

            # Steg 4: Full AI-scan (om score_estimate == "poor")
            scan_result = None
            if qual.score_estimate == 'poor':
                scan_result = await run_ai_scan(place['websiteUri'])

            # Steg 5: Spara i databasen
            save_lead(db, place, qual, email, scan_result)
            qualified.append(place)

    return qualified
```

### Fas 2: Outreach (körs manuellt eller via cron)

```bash
# Cron: kör måndag–fredag 09:00, max 20 mejl/dag
0 9 * * 1-5 python3 /mnt/storage/aiscanner/scripts/run_outreach.py --batch 20
```

### Fas 3: Uppföljning

- Opt-out: hanteras via reply-filter eller länk
- Replies: vidarebefordras till Jens' inbox, hanteras manuellt
- Konverteringar: spåras manuellt initialt

---

## 8. Vad som INTE rekommenderas — och varför

### Inte: Köpa leads-listor (Bisnode, Creditsafe, UC)

- Kostnad 5 000–50 000 kr för en lista
- Data är ofta 6–24 månader gammal
- E-postadresser saknas ofta eller är avvisningsbenägna
- GDPR-frågetecken kring ursprung och samtycke
- Vi kan generera bättre, färskare och mer relevanta leads gratis via Google Places

### Inte: Massskraping av Eniro/Hitta.se som primär källa

- Termen "scraping" i robots.txt hos Eniro är explicit förbjuden för kommersiellt bruk
- Juridisk risk (CFAA-liknande lagstiftning finns i EU via DSA)
- Teknisk skörhet — layout ändras utan varning
- Google Places är bättre strukturerad, mer aktuell och vi har redan API-åtkomst
- Komplement: ok att använda för att komplettera saknade e-postadresser när webbsidan inte avslöjar dem

### Inte: Skicka utan personalisering

- Generiska "Vi hjälper dig med SEO"-mejl öppnas inte (< 5% öppningsrate)
- Personalisering baserad på faktisk scan = 15–30% öppningsrate, 3–8% klickrate
- Det tar 5 sekunder extra att generera per lead och är avgörande för resultatet

### Inte: Extern e-posttjänst (Mailchimp, Brevo, SendGrid)

- Kräver verifierad avsändardomän (ok, men tar tid att bygga reputation)
- Kostar pengar
- Proton/Hydroxide räcker för < 100 mejl/dag
- Nackdel: kan inte spåra öppningar (OK för nu — vi vill ändå inte förlita oss på pixel-tracking)

### Inte: Automatisera uppföljningsmejl i det här steget

- Ökad risk för spam-klassificering
- GDPR-gråzon om vi inte fått svar
- Skala upp till detta efter att konverteringsflödet är testat och bevisat

---

## 9. Teknisk struktur — filerna som behövs

```
/mnt/storage/aiscanner/scripts/
  lead_collector.py       # Google Places → pre-qualify → DB
  email_extractor.py      # Webbsida-scraping för e-post
  ai_scanner_client.py    # Anropar /api/scan lokalt
  outreach.py             # Bygg och skicka mejl via Hydroxide
  run_outreach.py         # CLI-entry-point med --batch flag

/mnt/storage/aiscanner/data/
  leads.db                # SQLite-databas
  opted_out.txt           # Backup-lista på avregistrerade domäner
```

**Beroenden (Python):**
```
aiohttp          # Async HTTP (snabbare pre-qualify)
beautifulsoup4   # HTML-parsing för e-post-extraktion
requests         # Synkron HTTP för enklare anrop
sqlite3          # Inbyggd i Python
smtplib          # Inbyggd i Python
python-dotenv    # Miljövariabler
```

Inga externa betaltjänster behövs.

---

## 10. Realistiska förväntningar

| Metrik | Estimat |
|---|---|
| Leads per körning (10 branscher × 16 städer) | ~1 500–3 000 företag |
| Andel med webbplats | ~85% = ~1 500 leads |
| Andel som klarar pre-qualify (dålig AI-optimering) | ~80% = ~1 200 leads |
| Andel med hittad e-post | ~50% = ~600 adresser |
| E-postöppningsrate (med personalisering) | 15–25% |
| Klickrate till analyze.pipod.net | 3–8% |
| Konverteringsrate (klick → betalande kund) | 1–5% |
| Estimerade kunder per kampanj | **3–30 st** |

Kostnad per kampanj: Google Places API ~$3 + AI-scan ~$5 + e-postkostnad ~$0 = **under $10 totalt**.

---

## Snabb-start — vad du ska bygga härnäst

1. `lead_collector.py` — Google Places API-anrop med kategori + stad, sparar till SQLite
2. `email_extractor.py` — regex + BeautifulSoup på webbsidan
3. `outreach.py` — e-postmall + Hydroxide SMTP
4. Testa manuellt: 10 leads, 5 mejl, se vad som händer
5. Bygga ut och automatisera efter initial feedback

---

*Rapport skapad: 2026-04-27*
*Uppdatera vid implementation: notera vilka delar som fungerade vs inte*
