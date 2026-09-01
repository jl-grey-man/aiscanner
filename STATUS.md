# AI Search Scanner -- Status

**Last updated:** 2026-09-01

## Current State

Next.js 15 App Router-monolit på PiPod (port 8010), publik via `https://analyze.pipod.net`. **2026-09-01: sajten återställd efter ~3 månaders driftstopp** — en halvfärdig build 10 juni lämnade `.next/standalone/server.js` saknad och tjänsten crash-loopade 16 299 gånger utan att någon märkte det (uptime-vakt läggs till i åtgärdsplanen, Task 20).

En komplett go-live-audit gjordes 2026-09-01 (4 parallella granskningar + skarpa E2E-tester av både free- och paid-scan). Åtgärdsplan med 22 atomära tasks: **`docs/plans/2026-09-01-golive-fixes.md`** — exekveras av DeepSeek (Task 0–11, 14–21) och Claude (Task 12–13).

## What Works Today (verifierat skarpt 2026-09-01)

- **Free-scan E2E:** `POST /api/enhanced-scan` → 37 Zod-validerade checks på ~15 s med riktig Google-data, AI-mention-test och svenska fynd
- **Paid-scan E2E:** ~135 s; Gemini 2.5 Pro-berikning ger genuint personaliserade lösningar — riktig adress, telefon, koordinater, öppettider och sociala profiler i copy-paste-färdig JSON-LD, inga platshållare
- **Stripe-betalflöde** (`/api/checkout` + `/finalize`, 499 kr, SQLite-persistens i `data/checkouts.db`) — byggt maj 2026, men se blockerare nedan
- Rapport-UI: `report/FreeReport` (29 free-checks) + `report/PremiumReport` (36 checks) renderar korrekt; landningssida v2 med e-postcapture (PremiumCTA)
- Konkurrentanalys (Google Places, avstånd/betyg), recensionsanalys, katalogkoll (Eniro/Hitta via Tavily), llms.txt/robots/schema-checks
- Cloudflare Tunnel + nginx + systemd (`ai-scanner-api.service`)

## Go-live-blockerare (fixas i åtgärdsplanen)

1. **SSRF** — URL-validering är bara `startsWith('http')`; interna IP/Tailscale kan scrapas (Task 1–2)
2. **Betalningsbypass** — `tier:"paid"` accepteras från vem som helst utan Stripe-verifiering (Task 3)
3. **Ingen rate limiting** — API-krediter kan brännas obegränsat (Task 4)
4. **`STRIPE_API_KEY` bara i `.env.local`** — systemd läser `.env`, betalflödet dött i prod (Task 5)
5. **AI-fel blir kunddom** — misslyckade API-anrop rapporteras som "AI känner inte till företaget" (Task 9)
6. **Paid-scan 135 s > Cloudflares 100 s-gräns** — finalize måste bli asynkron (Task 13)

Kvalitetsproblem därutöver: aggregateRating i kodexempel bryter Googles riktlinjer (Task 10), 3× duplicerade kodblock (Task 11), poänginstabilitet mellan free/paid-körningar (Task 12), tyst mätbortfall utan täckningsvisning (Task 8, 14), "23 kontroller" hårdkodat på landningssidan (Task 15).

## What's Missing (efter åtgärdsplanen)

- Fas 4-rester: e-postleverans av rapport, PDF-export, review-tool, GDPR/lead-export
- Cache är in-memory (förloras vid omstart) — `scan_cache`-tabellen (Task 12) löser paid-flödet men inte generell cache
- Visuell mobiltestning av rapporterna

## Next 3 Tasks

1. **Kör åtgärdsplanen** — `docs/plans/2026-09-01-golive-fixes.md` (DeepSeek Task 0–11 → paus → Claude Task 12–13 → DeepSeek Task 14–21)
2. **Stripe-testköp end-to-end** efter Task 13 (kräver `sk_test`-nyckel eller riktigt köp)
3. **E-postleverans av rapport** (Fas 4.1) — första försäljningskanalen efter go-live
