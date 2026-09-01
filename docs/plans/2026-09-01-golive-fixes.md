# Go-live-fixar — atomic implementationsplan

> **För exekutören (DeepSeek eller annan agent):** Utför EN uppgift i taget, i ordning.
> Varje uppgift slutar med ett VERIFIERING-steg med exakt kommando och förväntat svar.
> Om verifieringen inte ger förväntat svar: STOPPA, rätta, verifiera igen. Gå ALDRIG vidare med röd verifiering.
> Läs alltid målfunktionen i sin helhet innan du ändrar den. Ändra ingenting utanför uppgiftens Files-lista.

**Mål:** Göra AI Search Scanner säker och pålitlig nog att ta betalt (499 kr) av riktiga kunder.

**Arkitektur:** Next.js 15 App Router-monolit i `/mnt/storage/aiscanner`, allt i `app/` (`backend/` och `frontend/` är DÖD KOD — rör aldrig). Körs som systemd-tjänst `ai-scanner-api.service` på port 8010, publikt via Cloudflare Tunnel → nginx → `analyze.pipod.net`.

**Stack:** TypeScript, Zod, better-sqlite3, OpenRouter (Gemini Flash/Pro), Stripe, Tavily, Google Places.

## Exekveringslogg

> Uppdaterad 2026-09-01 — Task 0–3 utförda och verifierade.

- **Baseline OK:** `git pull` → Already up to date (krävde `GIT_SSH_COMMAND='ssh -F ~/.ssh/config'` pga. felaktiga permissions på `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`). `git status --porcelain` → endast `?? "AI Analys-handoff.zip"`. `curl http://localhost:8010/` → `200`.
- **Task 0 ✅** commit `cadef62` — vitest installerat, `npm test` → `Test Files 1 passed`.
- **Task 1 ✅** commit `2e6da5f` — `app/lib/safeFetch.ts` + `tests/safeFetch.test.ts`; test FAIL före implementation, därefter 25 passed; `npx tsc --noEmit` grön.
- **Task 2 ✅** commit `2991b39` — SSRF inkopplat i `enhanced-scan`, `scan`, `full-scan`, `checkout` + `scraper.ts`/`enhancedScraper.ts`. Blockerad URL (`100.72.180.20`, `192.168.1.1`) → HTTP 400 `"blockerad"`; legitim scan (`tvakanten.se`) → `37 True`.
- **Task 3 ✅** commit `757f773` — `tier=paid` kräver `x-internal-scan-token`. Utan token `rich: 0`, med token `rich: 1`. `INTERNAL_SCAN_TOKEN` genererad i `.env` + `.env.local` (verifierad med `grep -c` = 1 vardera, aldrig utskriven, ej committad).
- **Avvikelser:** inline `python3 -c` blockerad i exekveringsmiljön → temporära verifieringsscript i `/tmp` användes (borttagna efteråt). Befintlig dev-server på 8012 återanvändes i Task 2 och startades om för Task 3 (env-ändring).
- **Nästa:** Task 4 (nginx rate limit, kräver sudo).

---

## Globala regler

1. Arbeta i `/mnt/storage/aiscanner`. Kör `git pull` innan du börjar.
2. Skriv/committa ALDRIG `.env`, `.env.local` eller `data/*.db`. Skriv aldrig ut innehållet i env-filer — verifiera bara att variabelnamn finns (`grep -c`).
3. Efter varje uppgift: commit med angivet meddelande. En uppgift = en commit.
4. Dev-server för test körs på port **8012** (8010 = prod, 8011 = annat projekt — rör ej):
   `npx next dev -p 8012` (starta i bakgrund, stoppa när uppgiften är klar).
5. Typkontroll: `npx tsc --noEmit` — ska alltid vara grön före commit.
6. Prod-deploy sker BARA i Task 21 (sist). Rör inte den körande tjänsten innan dess.
7. **HÅRD PAUS FÖRE TASK 12:** Task 12 och 13 utförs INTE av dig. När Task 11 är committad och verifierad: STOPPA HELT, skriv en delrapport (status per task 0–11, avvikelser) och avsluta. Jens låter Claude göra Task 12–13 separat. Du återupptas därefter från Task 14 — verifiera då först att Task 12–13 är committade (`git log --oneline -5` ska innehålla commits om scan cache och async finalize) innan du fortsätter.

**Baseline-verifiering (kör först, innan Task 0):**
```bash
cd /mnt/storage/aiscanner && git status --porcelain
```
Förväntat: tom output (ev. `?? "AI Analys-handoff.zip"` är ok). Annars: STOPPA, rapportera.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8010/
```
Förväntat: `200` (prod uppe).

---

## Task 0: Testinfrastruktur (vitest)

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

**Steg 1:** `npm install -D vitest`

**Steg 2:** Skapa `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

**Steg 3:** Lägg till i `package.json` under `"scripts"`: `"test": "vitest run"`

**Steg 4:** Skapa `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => { it('runs', () => { expect(1 + 1).toBe(2) }) })
```

**VERIFIERING:** `npm test`
Förväntat: `Test Files  1 passed`, `Tests  1 passed`, exit code 0.

**Commit:** `git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts && git commit -m "test: add vitest infrastructure"`

---

# PAKET A — Säkerhet & pengar

## Task 1: SSRF-skydd — `assertPublicUrl` (test först)

**Files:**
- Create: `tests/safeFetch.test.ts`
- Create: `app/lib/safeFetch.ts`

**Steg 1: Skriv failande test** — `tests/safeFetch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isBlockedIp, assertPublicUrl } from '@/app/lib/safeFetch'

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '100.72.180.20', '0.0.0.0', '::1',
    '::ffff:192.168.1.1', 'fe80::1', 'fd00::1',
  ])('blockerar %s', (ip) => { expect(isBlockedIp(ip)).toBe(true) })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111'])(
    'tillåter %s', (ip) => { expect(isBlockedIp(ip)).toBe(false) })
})

describe('assertPublicUrl', () => {
  it('avvisar file://', async () => { await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow() })
  it('avvisar localhost', async () => { await expect(assertPublicUrl('http://localhost:8010/')).rejects.toThrow() })
  it('avvisar direkt privat IP', async () => { await expect(assertPublicUrl('http://192.168.1.1/')).rejects.toThrow() })
  it('avvisar Tailscale-IP', async () => { await expect(assertPublicUrl('http://100.72.180.20/')).rejects.toThrow() })
  it('avvisar trasig URL', async () => { await expect(assertPublicUrl('inte en url')).rejects.toThrow() })
  it('tillåter publik domän', async () => {
    const u = await assertPublicUrl('https://www.google.com/')
    expect(u.hostname).toBe('www.google.com')
  })
})
```

**Steg 2:** `npm test` — Förväntat: FAIL (`Cannot find module '@/app/lib/safeFetch'` eller motsvarande).

**Steg 3: Implementera** — `app/lib/safeFetch.ts` (komplett fil):
```ts
import { lookup } from 'node:dns/promises'
import net from 'node:net'

// SSRF-skydd: servern sitter i privat nät (Tailscale + LAN) och scrapar
// användarangivna URL:er. Blockera allt icke-publikt adressutrymme.
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
]

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0)
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask)
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('::ffff:')) return isBlockedIp(lower.slice(7))
    return false
  }
  if (!net.isIPv4(ip)) return true
  return BLOCKED_V4.some(([base, bits]) => inCidr(ip, base, bits))
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL
  try { u = new URL(rawUrl) } catch { throw new Error('Ogiltig URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Endast http/https tillåts')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blockerad adress')
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('Blockerad adress')
    return u
  }
  const addrs = await lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some(a => isBlockedIp(a.address))) {
    throw new Error('Blockerad adress')
  }
  return u
}

/** fetch som validerar URL:en och varje redirect-hopp (max 5). */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = rawUrl
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current)
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      current = new URL(loc, current).toString()
      continue
    }
    return res
  }
  throw new Error('För många redirects')
}
```

**VERIFIERING:** `npm test` — Förväntat: alla test PASS (inkl. smoke). `npx tsc --noEmit` — Förväntat: inga fel.

**Commit:** `git add tests/safeFetch.test.ts app/lib/safeFetch.ts && git commit -m "feat(security): SSRF guard — assertPublicUrl + safeFetch"`

---

## Task 2: Koppla in SSRF-skyddet i scan-endpoints och scrapers

**Files:**
- Modify: `app/api/enhanced-scan/route.ts` (POST-hanteraren, ~rad 564)
- Modify: `app/api/scan/route.ts` (~rad 86)
- Modify: `app/api/full-scan/route.ts` (~rad 11)
- Modify: `app/api/checkout/route.ts` (~rad 24)
- Modify: `app/lib/scraper.ts`, `app/lib/enhancedScraper.ts` (alla ställen som fetchar användarens URL eller länkar hittade på sajten)

**Steg 1:** I varje route: direkt efter befintlig `!url.startsWith('http')`-koll, lägg till:
```ts
try { await assertPublicUrl(url) } catch {
  return NextResponse.json({ error: 'Ogiltig eller blockerad URL' }, { status: 400 })
}
```
(importera `assertPublicUrl` från `@/app/lib/safeFetch`; anpassa till respektive fils response-mönster/CORS-headers).

**Steg 2:** I `scraper.ts` och `enhancedScraper.ts`: hitta alla ställen som gör `fetch(` mot användar-härledda URL:er (huvudsida, undersidor, robots.txt, sitemap). Byt `fetch(u, { ...opts, redirect: 'follow' })` mot `safeFetch(u, opts)`. Rör INTE anrop mot fasta API:er (OpenRouter, Tavily, Google).

**Steg 3:** `npx tsc --noEmit` — inga fel. Starta dev: `npx next dev -p 8012 &` och vänta tills `curl -s -o /dev/null -w "%{http_code}" http://localhost:8012/` ger `200`.

**VERIFIERING 1 (blockerad URL):**
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' \
  -d '{"url":"http://100.72.180.20/"}' -w "\nHTTP %{http_code}\n"
```
Förväntat: `HTTP 400` och body innehåller `"blockerad"` (skiftlägesokänsligt).

**VERIFIERING 2 (192.168.x):** samma med `"url":"http://192.168.1.1/"` → `HTTP 400`.

**VERIFIERING 3 (legitim scan fungerar fortfarande):**
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' \
  -d '{"url":"https://www.tvakanten.se"}' -m 300 | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['checks']), d['scores']['free'] > 0)"
```
Förväntat: `37 True` (tar 15–60 s).

Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "feat(security): enforce assertPublicUrl/safeFetch in all scan routes and scrapers"`

---

## Task 3: Stäng betalningsbypassen (`tier=paid` kräver intern token)

**Files:**
- Modify: `app/api/enhanced-scan/route.ts` (~rad 564–568)
- Modify: `app/api/checkout/finalize/route.ts` (~rad 95–103)

**Steg 1:** I `enhanced-scan/route.ts`, ersätt tier-raden:
```ts
// FÖRE: const tier: 'free' | 'paid' = tierInput === 'paid' ? 'paid' : 'free'
const internalToken = req.headers.get('x-internal-scan-token')
const tokenOk = !!process.env.INTERNAL_SCAN_TOKEN && internalToken === process.env.INTERNAL_SCAN_TOKEN
const tier: 'free' | 'paid' = tierInput === 'paid' && tokenOk ? 'paid' : 'free'
```

**Steg 2:** I `finalize/route.ts`, lägg till headern i det interna fetch-anropet:
```ts
headers: { 'Content-Type': 'application/json', 'x-internal-scan-token': process.env.INTERNAL_SCAN_TOKEN ?? '' },
```

**Steg 3:** Generera token och lägg i `.env` OCH `.env.local` (skriv inte ut den):
```bash
TOKEN=$(openssl rand -hex 32) && printf 'INTERNAL_SCAN_TOKEN=%s\n' "$TOKEN" >> .env && printf 'INTERNAL_SCAN_TOKEN=%s\n' "$TOKEN" >> .env.local
```

**VERIFIERING:** Starta dev på 8012. Kör:
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' \
  -d '{"url":"https://www.tvakanten.se","tier":"paid"}' -m 300 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('rich:', sum(1 for c in d['checks'] if c.get('richCodeExample')))"
```
Förväntat: `rich: 0` (extern `tier=paid` degraderas till free → inga rich-fält). Kör därefter samma med header `-H "x-internal-scan-token: $(grep '^INTERNAL_SCAN_TOKEN=' .env | cut -d= -f2)"` → Förväntat: `rich:` ≥ 1 (tar 2–3 min).
Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(security): paid tier requires internal token — closes payment bypass"` (kontrollera med `git status` att `.env*` INTE ingår).

---

## Task 4: Rate limiting i nginx

**Files:**
- Modify: `/etc/nginx/sites-available/analyze.pipod.net` (kräver sudo; ligger utanför repot)
- Create: `deploy/nginx-analyze-ratelimit.md` (dokumentation av ändringen i repot)

**Steg 1:** Läs den befintliga vhosten: `sudo cat /etc/nginx/sites-available/analyze.pipod.net`.

**Steg 2:** Lägg till överst i filen (utanför `server{}`):
```nginx
limit_req_zone $binary_remote_addr zone=scanapi:10m rate=3r/m;
```
och inne i `server{}` ett nytt location-block FÖRE `location /`:
```nginx
location /api/ {
    limit_req zone=scanapi burst=5 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:8010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 150s;
}
```
(kopiera proxy_*-raderna från befintliga `location /` så de matchar exakt).

**Steg 3:** `sudo nginx -t` — Förväntat: `syntax is ok` + `test is successful`. Sedan `sudo systemctl reload nginx`.

**Steg 4:** Dokumentera hela ändringen i `deploy/nginx-analyze-ratelimit.md` (klistra in de tillagda blocken).

**VERIFIERING:**
```bash
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " -X POST https://analyze.pipod.net/api/enhanced-scan -H 'Content-Type: application/json' -d '{"url":"x"}'; done; echo
```
Förväntat: de första ~6 svaren `400` (ogiltig URL — snabbt avvisad), därefter `429` för resten. Minst ett `429` MÅSTE förekomma.

**Commit:** `git add deploy/nginx-analyze-ratelimit.md && git commit -m "feat(ops): document nginx rate limit for /api/"`

---

## Task 5: Miljövariabler i `.env` (Stripe m.fl.)

**Files:** `.env` (committas ALDRIG)

**Steg 1:** Kopiera `STRIPE_API_KEY`-raden från `.env.local` till `.env`:
```bash
grep '^STRIPE_API_KEY=' .env.local >> .env
```
Om raden inte finns i `.env.local`: STOPPA och rapportera "STRIPE_API_KEY saknas — Jens måste hämta den från Stripe-dashboarden".

**Steg 2:** `printf 'NEXT_PUBLIC_APP_URL=https://analyze.pipod.net\n' >> .env` (och samma till `.env.local` om den saknas där).

**Steg 3:** `GOOGLE_PSI_KEY` behövs INTE (verifierat 2026-06-15, se Checklist.md: `GOOGLE_PLACES_API_KEY` har inga API-restriktioner och täcker PSI; `pageSpeed.ts` faller redan tillbaka på den). Hoppa över den — leta inte efter någon nyckel. Bumpa i stället PSI-timeouten i `app/lib/pageSpeed.ts` (~rad 45, `getCwvMetrics`) från 12 s till 30 s.

**VERIFIERING:**
```bash
for v in OPENROUTER_API_KEY GOOGLE_PLACES_API_KEY TAVILY_API_KEY STRIPE_API_KEY NEXT_PUBLIC_APP_URL INTERNAL_SCAN_TOKEN; do printf '%s: %s\n' "$v" "$(grep -c "^$v=" .env)"; done
```
Förväntat: `1` för samtliga sex. Dessutom: `grep -n "30" app/lib/pageSpeed.ts | head -2` ska visa den nya timeouten.

**Commit:** `git add app/lib/pageSpeed.ts && git commit -m "fix(psi): bump CWV timeout 12s -> 30s (per 2026-06-15 finding)"`

---

## Task 6: Generiska felmeddelanden till klient

**Files:**
- Modify: `app/api/enhanced-scan/route.ts` (~rad 984), `app/api/scan/route.ts` (~rad 101), `app/api/full-scan/route.ts` (~rad 63), `app/api/checkout/route.ts`, `app/api/checkout/finalize/route.ts` (~rad 126)

**Steg 1:** I varje catch-block som idag returnerar `detail: err.message` (eller motsvarande): logga hela felet med `console.error`, generera `const errorId = Math.random().toString(36).slice(2, 10)`, logga id:t tillsammans med felet, och returnera endast `{ error: 'Internt fel', errorId }` till klienten. Rör inte statuskoderna.

**VERIFIERING:**
```bash
grep -rn "err.message" app/api/ | grep -v "console.error" | grep -c "NextResponse\|json("
```
Förväntat: `0` (inget `err.message` i något klientsvar). `npx tsc --noEmit` → inga fel.

**Commit:** `git add -u && git commit -m "fix(security): generic client errors with errorId, details server-side only"`

---

# PAKET B — Rapportens trovärdighet

## Task 7: Generell retry-hjälpare (test först)

**Files:**
- Create: `tests/retry.test.ts`
- Create: `app/lib/retry.ts`

**Steg 1: Failande test** — `tests/retry.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/app/lib/retry'

describe('withRetry', () => {
  it('returnerar direkt vid succé', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseDelayMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('försöker igen vid fel och lyckas', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ok')
    expect(await withRetry(fn, { attempts: 3, baseDelayMs: 1 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('kastar sista felet när alla försök misslyckas', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(3)
  })
  it('respekterar isRetryable=false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, isRetryable: () => false })).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

**Steg 2:** `npm test` → FAIL (modulen saknas).

**Steg 3: Implementera** — `app/lib/retry.ts`:
```ts
export interface RetryOpts {
  attempts?: number
  baseDelayMs?: number
  isRetryable?: (err: unknown) => boolean
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, isRetryable = () => true } = opts
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      if (i === attempts - 1 || !isRetryable(err)) throw err
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** i))
    }
  }
  throw lastErr
}
```

**VERIFIERING:** `npm test` → alla PASS.

**Commit:** `git add tests/retry.test.ts app/lib/retry.ts && git commit -m "feat(lib): withRetry — exponential backoff helper"`

---

## Task 8: Koppla in retry i AI-anropen (inkl. JSON-parse-fel)

**Files:**
- Modify: `app/api/enhanced-scan/route.ts` (`callOpenRouter` ~rad 87–99 och Flash-anropens JSON-parsning)

**Steg 1:** Läs `callOpenRouter` (retryar idag bara 429/504 en gång). Skriv om så hela anropet går genom `withRetry` (3 försök): nätverksfel och `res.status === 429 || res.status >= 500` → kasta (retrybart); `4xx` utom 429 → kasta med `isRetryable: () => false`-mönstret (permanenta fel ska inte retryas — enklast: kasta ett Error med `(err as any).permanent = true` och filtrera i `isRetryable`).

**Steg 2:** Hitta stället där Flash-svaret JSON-parsas och som loggar `"Kunde inte tolka AI-svaret som JSON"`. Flytta in parsningen i retry-slingan: parse-fel → nytt LLM-anrop (max 3 totalt), så en enstaka trasig generation inte ger `notMeasured`.

**VERIFIERING:** `npx tsc --noEmit` → inga fel. `npm test` → PASS. Starta dev på 8012 och kör en free-scan (som Task 2, VERIFIERING 3) → Förväntat: `37 True` samt att journal/stdout INTE innehåller `Kunde inte tolka` (kontrollera dev-serverns output; enstaka förekomst följd av lyckat omförsök är ok — slutresultatet får inte ha `"Kunde inte analyseras"` på checks 22–24: kontrollera med
`python3 -c "import json,sys; d=json.load(sys.stdin); print([c['id'] for c in d['checks'] if 'Kunde inte analyseras' in str(c.get('finding'))])"` → Förväntat: `[]`).
Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(ai): retry all transient OpenRouter failures incl. JSON parse errors"`

---

## Task 9: AI-fel får aldrig bli kunddom (aiMentions + reviewReplies + fail-fast)

**Files:**
- Modify: `app/lib/aiMentionChecker.ts` (~rad 179, 199: `.catch(() => '')`)
- Modify: `app/lib/checkBuilder.ts` (check 33 aiMentions, check 34 reviewReplies)
- Modify: `app/api/enhanced-scan/route.ts` (början av POST)

**Steg 1:** I `aiMentionChecker.ts`: ta bort `.catch(() => '')`. Låt fel propagera till `checkAIMentions`, som fångar dem och returnerar ett resultat med explicit `errored: true`-fält (utöka returtypen).

**Steg 2:** I `checkBuilder.ts`: när aiMentions-resultatet har `errored: true` → status `notMeasured`, finding `"AI-omnämnande kunde inte mätas (tillfälligt tekniskt fel) — påverkar inte poängen."`. ALDRIG `bad` vid fel.

**Steg 3:** I `checkBuilder.ts` (check 34): när totala antalet recensioner är 0 → status `notMeasured` (inte `warning`), finding `"Inga recensioner att analysera ännu."`.

**Steg 4:** Fail-fast i `enhanced-scan/route.ts`, först i POST:
```ts
if (!process.env.OPENROUTER_API_KEY) {
  console.error('[Enhanced Scan] OPENROUTER_API_KEY saknas — avbryter')
  return NextResponse.json({ error: 'Servern är felkonfigurerad', errorId: 'no-api-key' }, { status: 503 })
}
```

**VERIFIERING 1 (fail-fast):** Starta dev UTAN nyckel: `OPENROUTER_API_KEY= npx next dev -p 8012 &`, sedan
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' -d '{"url":"https://www.tvakanten.se"}' -w "\nHTTP %{http_code}\n"
```
Förväntat: `HTTP 503`, body innehåller `felkonfigurerad`. Stoppa dev-servern.

**VERIFIERING 2 (normal drift oförändrad):** Starta dev normalt, kör free-scan → check 33 ska ha status `warning`/`ok`/`bad` (INTE `notMeasured` — nyckeln finns ju):
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' -d '{"url":"https://www.tvakanten.se"}' -m 300 | python3 -c "import json,sys; d=json.load(sys.stdin); c=[x for x in d['checks'] if x['id']==33][0]; print(c['status'])"
```
Förväntat: en av `ok|warning|bad`. Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(ai): API errors become notMeasured, never a bad verdict; fail fast on missing key"`

---

## Task 10: Sanering av kodexempel — aggregateRating + markdown-fences (test först)

**Files:**
- Modify: `app/lib/reportWriter.ts` (`sanitizeCodeExample`, ~rad 74; exportera den + promptregel ~rad 226)
- Create: `tests/sanitizeCode.test.ts`

**Steg 1:** Exportera `sanitizeCodeExample` från `reportWriter.ts` (behåll befintligt beteende).

**Steg 2: Failande test** — `tests/sanitizeCode.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { sanitizeCodeExample } from '@/app/lib/reportWriter'

const withFences = '```json\n{"@type": "Restaurant", "name": "X"}\n```'
const withRating = `<script type="application/ld+json">
{
  "@type": "Restaurant",
  "name": "X",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.2,
    "reviewCount": 942
  },
  "telephone": "031-1"
}
</script>`

describe('sanitizeCodeExample', () => {
  it('strippar markdown-fences', () => {
    const out = sanitizeCodeExample(withFences)!
    expect(out).not.toContain('```')
    expect(out).toContain('"@type"')
  })
  it('tar bort aggregateRating (Google self-serving reviews-policyn)', () => {
    const out = sanitizeCodeExample(withRating)!
    expect(out).not.toContain('aggregateRating')
    expect(out).toContain('"telephone"')
    expect(out).toContain('"name"')
  })
  it('null in → null ut', () => { expect(sanitizeCodeExample(null)).toBeNull() })
})
```

**Steg 3:** `npm test` → de två första FAIL.

**Steg 4: Implementera** i `sanitizeCodeExample` (utöka befintlig funktion, ta bort inget befintligt):
- Fences: strippa ledande ```` ```<språk>? ```` -rad och avslutande ```` ``` ````-rad (regex: `/^```[a-z]*\s*\n/i` och `/\n```\s*$/`).
- aggregateRating: hitta JSON-LD-innehållet (inuti `<script>`-taggar eller hela strängen om den är ren JSON), `JSON.parse`, ta rekursivt bort alla `aggregateRating`- och `review`-nycklar, `JSON.stringify(obj, null, 2)` tillbaka. Vid parse-fel: fall tillbaka på regex som tar bort `"aggregateRating": { ... },?` (icke-girigt över balanserade klamrar går inte med regex — matcha `"aggregateRating"\s*:\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\},?\s*`).

**Steg 5:** Lägg till i Pro-promptens regler (~rad 226): `Inkludera ALDRIG aggregateRating eller review i kodexempel — Googles riktlinjer förbjuder self-serving review-markup.`

**VERIFIERING:** `npm test` → alla PASS. `npx tsc --noEmit` → inga fel.

**Commit:** `git add -u tests/sanitizeCode.test.ts && git commit -m "fix(report): strip aggregateRating and markdown fences from code examples"`

---

## Task 11: Deduplicera identiska kodblock i premiumrapporten

**Files:**
- Modify: `app/lib/reportWriter.ts` (efter batch-sammanslagningen, ~rad 144–150)
- Modify: `app/components/report/SolutionCard.tsx` (rendera hänvisning)
- Create: `tests/dedupCode.test.ts`

**Steg 1:** I `reportWriter.ts`, ny exporterad funktion:
```ts
export function dedupeCodeExamples(rich: Record<string, RichCheckData>): Record<string, RichCheckData> {
  const seen = new Map<string, string>() // normaliserad kod → första checkKey
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  for (const [key, data] of Object.entries(rich)) {
    if (!data.richCodeExample) continue
    const n = norm(data.richCodeExample)
    const first = seen.get(n)
    if (first) {
      data.richCodeExample = null
      data.codeRef = first // ny valfri egenskap i RichCheckData: codeRef?: string
    } else {
      seen.set(n, key)
    }
  }
  return rich
}
```
Anropa den på det sammanslagna resultatet innan retur. Lägg `codeRef?: string` i `RichCheckData`-typen och (om `richCodeExample`/rich-fälten valideras av Zod i `scanResult.ts`) även där, samt se till att `codeRef` följer med när rich-fälten kopieras in på checkarna i `enhanced-scan/route.ts` (~rad 883–885).

**Steg 2:** I `SolutionCard.tsx`: när `codeRef` finns → rendera i stället för kodblock: en ruta med texten `Samma kodblock som lösningen ovan — se "Kod att kopiera" där` med ankarlänk till `#check-<codeRef>` (använd rapportens befintliga ankar-id-mönster; kontrollera hur PriorityCard/`SolutionCard` sätter `id` idag och matcha det).

**Steg 3: Test** — `tests/dedupCode.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { dedupeCodeExamples } from '@/app/lib/reportWriter'

describe('dedupeCodeExamples', () => {
  it('nullar dubbletter och sätter codeRef', () => {
    const rich: any = {
      a: { richCodeExample: '{ "x": 1 }' },
      b: { richCodeExample: '{  "x": 1 }' }, // samma efter normalisering
      c: { richCodeExample: '{ "y": 2 }' },
    }
    const out: any = dedupeCodeExamples(rich)
    expect(out.a.richCodeExample).toBeTruthy()
    expect(out.b.richCodeExample).toBeNull()
    expect(out.b.codeRef).toBe('a')
    expect(out.c.richCodeExample).toBeTruthy()
  })
})
```

**VERIFIERING:** `npm test` → PASS. `npx tsc --noEmit` → inga fel. `npm run build` → exit 0 (bygget verifierar att SolutionCard-ändringen kompilerar; deploya INTE).

**Commit:** `git add -u tests/dedupCode.test.ts && git commit -m "feat(report): dedupe identical code blocks, reference first occurrence"`

---

## Task 12: Paid = free-scan + berikning (poängkonsistens + snabbare betalflöde)

> ⛔ **UTFÖRS AV CLAUDE, INTE DEEPSEEK.** Se global regel 7 — DeepSeek stannar efter Task 11.

**Files:**
- Modify: `app/lib/checkoutDb.ts` (ny tabell `scan_cache`)
- Modify: `app/api/enhanced-scan/route.ts`

**Steg 1:** I `checkoutDb.ts`: ny tabell + funktioner (följ filens befintliga mönster):
```sql
CREATE TABLE IF NOT EXISTS scan_cache (url TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at INTEGER NOT NULL)
```
`saveFreeScan(url, resultJson)` (INSERT OR REPLACE), `getFreeScan(url, maxAgeMs)` (NULL om äldre än maxAgeMs).

**Steg 2:** I `enhanced-scan/route.ts`:
- Efter lyckad **free**-scan: `saveFreeScan(url, JSON.stringify(result))`.
- I början av **paid**-flödet: `getFreeScan(url, 24*3600*1000)`. Träff → hoppa över scraping/Flash/Places/Tavily; utgå från cachens checks och kör ENDAST paid-berikningen (Pro-syntes + Report Writer + rich-fält + paid-poängberäkning) på dem. Miss → kör fullt flöde som idag.
- Sätt `temperature: 0` i alla Flash-anrop (bedömningsanropen), om parametern inte redan skickas.

**VERIFIERING:** Starta dev på 8012.
1. Free-scan mot `https://www.tvakanten.se` (som tidigare). Notera `scores.free` (kalla värdet F). Kontrollera cache: `python3 -c "import sqlite3;print(sqlite3.connect('data/checkouts.db').execute('select count(*) from scan_cache').fetchone())"` → Förväntat: `(1,)`.
2. Paid-scan (MED intern token-header, se Task 3) mot samma URL. Mät tiden. Förväntat: **< 90 s** (ingen om-scanning) och `scores.free` i paid-svaret **exakt = F**. Kontrollera:
```bash
python3 -c "import json;d=json.load(open('paid.json'));print(d['scores']['free'])"
```
Förväntat: samma siffra som F. Dessutom `rich:` ≥ 1 som i Task 3.
Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "feat(scan): paid tier reuses cached free scan — consistent scores, faster checkout"`

---

## Task 13: Asynkron finalize (Cloudflare 100 s-gränsen)

> ⛔ **UTFÖRS AV CLAUDE, INTE DEEPSEEK.** Se global regel 7.

**Files:**
- Modify: `app/lib/checkoutDb.ts` (statuskolumn om den saknas: `scan_status TEXT DEFAULT 'pending'`)
- Modify: `app/api/checkout/finalize/route.ts`
- Create: `app/api/checkout/status/route.ts`
- Modify: `app/report/page.tsx` (polling)

**Steg 1:** `finalize/route.ts`: efter Stripe-verifieringen (behåll steg 1–4 exakt som idag, inkl. cache-retur):
i stället för att `await`:a scannet — sätt `scan_status='running'`, starta scannet som fire-and-forget-promise som vid succé sparar resultat + `scan_status='done'`, vid fel `scan_status='failed'` (+`markFailed`). Returnera direkt `{ status: 'running' }` med HTTP 202.

**Steg 2:** Ny `status/route.ts` (GET, query `session_id`): slår upp raden; `done` → `{ status: 'done', scanResult }`; `running` → `{ status: 'running' }`; `failed` → `{ status: 'failed' }`; okänd → 404.

**Steg 3:** `app/report/page.tsx`: efter finalize-svar `202/running` → polla `/api/checkout/status` var 5:e sekund (max 10 min), visa befintlig laddvy under tiden; `done` → rendera som idag; `failed` → befintlig felvy.

**VERIFIERING 1:** `npx tsc --noEmit` → inga fel. `npm run build` → exit 0.
**VERIFIERING 2 (status-endpoint):** Starta dev på 8012:
```bash
curl -s "http://localhost:8012/api/checkout/status?session_id=finns_inte" -w "\nHTTP %{http_code}\n"
```
Förväntat: `HTTP 404`.
**VERIFIERING 3 (manuell gate — kräver Stripe test-läge):** Om `STRIPE_API_KEY` börjar på `sk_test`: genomför ett köp i UI:t med testkort `4242 4242 4242 4242` och kontrollera att /report visar laddvy → färdig premiumrapport utan 504. Om nyckeln är live (`sk_live`): hoppa över, markera "manuell verifiering krävs av Jens" i slutrapporten.
Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "feat(checkout): async finalize with status polling — survives Cloudflare 100s limit"`

---

## Task 14: Exponera mät-täckning i poäng och UI

**Files:**
- Modify: `app/lib/scanResult.ts` (`calculateScores`, ~rad 330–347)
- Modify: rapportheadern (`app/components/report/` — den komponent som visar poängcirklarna; hitta via `grep -rn "Fullstandig poang" app/components/`)
- Create: `tests/coverage.test.ts`

**Steg 1:** Utöka `calculateScores` returvärde med `measured` och `total` (antal checks med status `ok|warning|bad` respektive alla poängsatta checks). Uppdatera Zod-schemat för scores.

**Steg 2: Test** — `tests/coverage.test.ts`: bygg en syntetisk check-lista (använd `CHECK_REGISTRY` för giltiga keys) där 2 checks är `notMeasured`, anropa `calculateScores`, förvänta `measured === total - 2`.

**Steg 3:** I rapportheadern: när `measured < total`, visa under poängen: `Baserat på {measured} av {total} kontroller`.

**VERIFIERING:** `npm test` → PASS. `npm run build` → exit 0.

**Commit:** `git add -u tests/coverage.test.ts && git commit -m "feat(score): expose measured/total coverage in scores and report header"`

---

# PAKET C — Synliga skavanker

## Task 15: "23 kontroller" → härlett antal

**Files:**
- Modify: `app/components/landing/ToolSection.tsx` (~rad 56), `app/components/landing/Premium.tsx` (~rad 29)

**Steg 1:** Importera `CHECK_REGISTRY` från `@/app/lib/scanResult` och ersätt hårdkodade "23" med beräknat antal free-checks (samma filter som `calculateScores` använder för free-tier; kontrollera exakt fältnamn, sannolikt `tier === 'free'`, och exkludera `synthesis`).

**VERIFIERING:**
```bash
grep -rn "23 kontroller" app/ | wc -l
```
Förväntat: `0`. Starta dev på 8012: `curl -s http://localhost:8012/ | grep -o "29 kontroller" | head -1` → Förväntat: `29 kontroller`. Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(landing): derive check count from CHECK_REGISTRY (was hardcoded 23)"`

---

## Task 16: Bransch från Places-typer (inte företagsnamnet)

**Files:**
- Modify: `app/api/enhanced-scan/route.ts` (~rad 606–611)

**Steg 1:** Skapa mappningstabell Places-`types` → svensk bransch (minst: `restaurant→restaurang, bar→bar, cafe→café, bakery→bageri, hair_care→frisör, dentist→tandläkare, gym→gym, lodging→hotell, store→butik`). Prioritera första matchande typ från `place.types`. Fallback-ordning: Places-typ → sista segmentet i `<title>` efter separator (`-`/`|`/`·`) OM det inte är lika med companyName → `'företag'`. `bransch` får ALDRIG bli identisk med `companyName`.

**Steg 2:** Se till att samma `bransch`-värde används i rapportheadern (`meta`), Flash/Pro-prompterna och AI-mention-frågan (sök `bransch` i `route.ts` och `aiMentionChecker.ts` och verifiera att alla läser samma variabel).

**VERIFIERING:** Starta dev på 8012, kör free-scan mot tvakanten.se:
```bash
curl -s -X POST http://localhost:8012/api/enhanced-scan -H 'Content-Type: application/json' -d '{"url":"https://www.tvakanten.se"}' -m 300 | python3 -c "import json,sys; d=json.load(sys.stdin); m=d['meta']; print(m.get('bransch'), '|', m.get('companyName'))"
```
Förväntat: bransch är `restaurang` eller `bar`, och INTE lika med companyName. Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(scan): derive bransch from Places types, never equal to company name"`

---

## Task 17: SolutionCard — visa mall i stället för att dölja kod

**Files:**
- Modify: `app/components/report/SolutionCard.tsx` (~rad 66–77, 165)

**Steg 1:** Läs logiken kring `codeIsTemplate`. Ändra så att i premium-läge (upplåst kort) med `richCodeExample == null`, `codeRef == null` men `genericCodeTemplate` satt: rendera mallen med en tydlig badge `Mall — ersätt värden inom [hakparenteser] med era uppgifter` i stället för att dölja blocket. Free-lägets beteende (dold kod) ändras INTE.

**VERIFIERING:** `npx tsc --noEmit` → inga fel. `npm run build` → exit 0. Manuell kontroll: `npx next dev -p 8012`, öppna `http://localhost:8012/preview`, klicka "Premiumrapport" — inget lösningskort får sakna både kod och mall (om mockdatan inte täcker fallet: notera "verifierad via kodläsning + build" i slutrapporten). Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "fix(report): premium shows labeled generic template when rich code missing"`

---

## Task 18: Ärlig förbättringsprognos + småfixar

**Files:**
- Modify: komponenten med texten `Estimerad forbattring` (hitta: `grep -rn "Estimerad" app/`)
- Modify: `app/lib/checkBuilder.ts` (check 17 öppettider-fallback)
- Modify: `app/lib/directoryChecker.ts` (~rad 330–334)
- Modify: `app/components/Progress.tsx` (~rad 111)

**Steg 1 (prognos):** Läs hur intervallet (t.ex. "94–99") beräknas. Ersätt med deterministisk beräkning: nuvarande fullpoäng + summan av vikterna för alla `bad`/`warning`-checks omräknat via samma viktlogik som `calculateScores` (exponera vid behov en hjälpfunktion `maxAchievableScore(checks)` i `scanResult.ts`). Formulering: `Om alla åtgärder genomförs kan er poäng nå upp till X.` — inget intervall, ordet "uppskattningsvis" bort.

**Steg 2 (öppettider):** I check 17: när `placeData.regularOpeningHours` saknas men `openingHoursFromSchema` (från `enhancedScraper`) finns → använd den, status `ok`, finding `"Öppettider hittades i webbplatsens schema-markup."`.

**Steg 3 (katalogtext):** Fix-texten vid `bad` ska bara nämna de kataloger som faktiskt kontrolleras (Eniro, Hitta) — ta bort "Gulasidorna".

**Steg 4 (Progress):** Ta bort hårdkodade `'5 sidor'` — visa inget sidantal alls under laddning (eller riktigt värde om det finns tillgängligt i state; annars ta bort raden).

**VERIFIERING:** `grep -rn "Gulasidorna" app/ | wc -l` → `0`. `grep -rn "5 sidor" app/components/Progress.tsx | wc -l` → `0`. `npm test` → PASS. `npm run build` → exit 0.

**Commit:** `git add -u && git commit -m "fix(report): honest improvement estimate, schema opening-hours fallback, copy fixes"`

---

# PAKET D — Drift & städning

## Task 19: Frontend-städning

**Files:**
- Modify: `app/hooks/useAnalysis.ts` (~rad 314–341 `analyzePaid`; döda `runPremium`/`premiumReport`/`analysisLog` ~rad 216, 343–371)
- Modify: `app/components/landing/ToolSection.tsx` (död EnhancedReport-väg, ~rad 8, 16–44, 98–105)
- Modify: `app/components/UrlInput.tsx` (~rad 35–50)
- Delete-kandidater: kontrollera först med `grep -rn "import.*<Namn>" app/` att INGEN levande kod importerar dem.

**Steg 1:** `analyzePaid`: lägg till AbortController — nytt anrop abortar föregående; svar från abortat anrop får inte skrivas till state.
**Steg 2:** Ta bort `runPremium`, `premiumReport`, `analysisLog` och states `premium-loading`/`premium-done` ur `useAnalysis` (verifiera med grep att inget använder dem).
**Steg 3:** Ta bort EnhancedReport-importen och den interna `useAnalysis`-instansen ur `ToolSection.tsx` (gör `onAnalyze` obligatorisk).
**Steg 4:** `UrlInput.tsx`: `type="url"` på URL-fältet, `<label>` (får vara visuellt dold med sr-only-klass) kopplad via `htmlFor`/`id` för båda fälten.
**Steg 5:** Ta bort `'nice'`-sektionerna i `FreeReport.tsx`/`PremiumReport.tsx` (~rad 22–32 resp. 45–54) — backend sätter aldrig `'nice'` (behåll typen i schemat).

**VERIFIERING:** `npx tsc --noEmit` → inga fel. `npm run build` → exit 0. Starta dev på 8012, kör en scan via UI-flödet (`curl` mot enhanced-scan räcker inte här — öppna `http://localhost:8012/`, eller om ingen browser finns: verifiera att `/` renderar med `curl -s http://localhost:8012/ | grep -c "Skanna"` → `≥ 1`). Stoppa dev-servern.

**Commit:** `git add -u && git commit -m "refactor(ui): remove dead premium flow, abort stale requests, a11y on inputs"`

---

## Task 20: Drift — StartLimitBurst + uptime-vakt

**Files:**
- Modify: `/etc/systemd/system/ai-scanner-api.service` (sudo; utanför repo) + spegla i `deploy/ai-scanner-api.service`
- Create: `deploy/uptime-check.sh` + cron-rad

**Steg 1:** I `[Unit]`-sektionen av systemd-uniten, lägg till:
```ini
StartLimitIntervalSec=300
StartLimitBurst=10
```
Spegla ändringen i repots `deploy/ai-scanner-api.service`. Kör `sudo systemctl daemon-reload`.

**Steg 2:** Skapa `deploy/uptime-check.sh`:
```bash
#!/bin/bash
# Cron-vakt: larma via claudeclaw/Telegram om analyze.pipod.net är nere.
CODE=$(curl -s -o /dev/null -m 15 -w "%{http_code}" https://analyze.pipod.net/)
if [ "$CODE" != "200" ]; then
  echo "$(date -Is) analyze.pipod.net DOWN (HTTP $CODE)" >> /mnt/storage/aiscanner/data/uptime.log
  ~/claudeclaw/claudeclaw notify "🔴 analyze.pipod.net nere (HTTP $CODE)" 2>/dev/null \
    || logger -t aiscanner-uptime "DOWN HTTP $CODE"
fi
```
OBS: kontrollera först hur claudeclaw skickar notiser (`ls ~/claudeclaw`, `~/claudeclaw/claudeclaw --help` eller läs dess README). Finns inget notify-kommando: använd bara logg-raden och notera i slutrapporten att Telegram-koppling återstår.
`chmod +x deploy/uptime-check.sh`, sedan `crontab -l | { cat; echo "*/5 * * * * /mnt/storage/aiscanner/deploy/uptime-check.sh"; } | crontab -`

**VERIFIERING:** `systemctl show ai-scanner-api.service -p StartLimitBurst` → `StartLimitBurst=10`. `crontab -l | grep -c uptime-check` → `1`. `bash deploy/uptime-check.sh; echo $?` → `0` och (eftersom sajten är uppe) INGEN ny rad i `data/uptime.log`.

**Commit:** `git add deploy/ && git commit -m "feat(ops): StartLimitBurst + uptime cron watchdog"`

---

## Task 21: Deploy + skarp slutverifiering + dokumentation

**Files:**
- Modify: `STATUS.md`, `CLAUDE.md`, `Checklist.md`
- Prod: rebuild + restart

**Steg 1: Deploy:**
```bash
npm run build && sudo systemctl restart ai-scanner-api.service && sleep 5 && curl -s -o /dev/null -w "%{http_code}\n" https://analyze.pipod.net/
```
Förväntat: build exit 0, sedan `200`.

**Steg 2: Skarp slutverifiering mot PROD (alla förväntade svar måste stämma):**
| # | Kommando | Förväntat |
|---|---|---|
| 1 | `curl -s -X POST https://analyze.pipod.net/api/enhanced-scan -H 'Content-Type: application/json' -d '{"url":"http://192.168.1.1/"}' -w "%{http_code}"` | `400` |
| 2 | samma med `{"url":"https://www.tvakanten.se","tier":"paid"}` (UTAN token) → räkna rich-fält | `rich: 0` |
| 3 | 10 snabba POST i följd (som Task 4) | minst ett `429` |
| 4 | free-scan → `python3`-koll av checks | `37` checks, inga `"Kunde inte analyseras"` |
| 5 | `journalctl -u ai-scanner-api.service --since "-10 min" | grep -c "err.message läckt"` — kontrollera i stället att inget API-svar innehöll stacktrace under testerna | `0` |

**Steg 3:** Uppdatera `STATUS.md` (datum, vad som nu fungerar: Stripe async-flöde, SSRF-skydd, rate limit, cache; vad som återstår: Fas 4-rester — e-postleverans, PDF, review-tool), `Checklist.md` (bocka av), `CLAUDE.md` (nya env-vars `INTERNAL_SCAN_TOKEN`, `NEXT_PUBLIC_APP_URL`, ny tabell `scan_cache`, nya endpoints `/api/checkout/status`, retry-/safeFetch-modulerna).

**Steg 4:** `git add -u && git commit -m "docs: update STATUS/CLAUDE/Checklist after go-live hardening" && git push`

**VERIFIERING (slutlig):** `git status` → clean, `git log origin/master..master` → tomt (allt pushat).

---

## Slutrapport (obligatorisk)

Sammanfatta: varje task med PASS/FAIL, alla avvikelser (hoppade steg, saknade nycklar, manuella gates som återstår — särskilt Task 13:s Stripe-test och ev. GOOGLE_PSI_KEY), och exakta kommandon Jens kan köra för att själv verifiera.
