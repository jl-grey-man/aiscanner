# AI Search Scanner -- Status

**Last updated:** 2026-09-25

## Current State

Next.js 15 App Router-monolit. **Produktion: `robotbyran.com` på Railway** — auto-deploy vid `git push` till `master`. **Staging: Pi:n** (`ai-scanner-api.service`, port 8010) publik via Cloudflare Tunnel på `https://analyze.pipod.net` — oberoende kopia, synkas INTE via push/pull. All verifiering körs mot staging FÖRST med `deploy/pi-staging.sh` (test → build → restart → röktest), push till master sist. Se CLAUDE.md "Staging på Pi:n / deploy-flöde".

Go-live-hårdningen (`docs/plans/2026-09-01-golive-fixes.md`, 22 tasks) är klar. Därefter en sessionsrunda (2026-09-25) med QA-kalibrering och tre diagnostiserade buggfixar.

## What Works Today

- **Free-scan:** `POST /api/enhanced-scan` → 37 Zod-validerade checks, ~15–25 s
- **Betalflöde:** Stripe-checkout (499 kr) → `/api/checkout/finalize` svarar `202` direkt (asynkron scan, överlever Cloudflares 100 s-gräns) → `/report?session_id=` pollar `GET /api/checkout/status` tills klar → premiumrapport. Paid-tier återanvänder den cachade free-scanen (samma poäng, snabbare köp) i stället för att scanna om från noll.
- **Säkerhet:** SSRF-skydd (`assertPublicUrl`/`safeFetch`, blockerar privata/interna IP inkl. Tailscale), paid-tier kräver internt token (`x-internal-scan-token`) — extern `tier=paid` degraderas alltid till free, in-app rate limiting (5 scans/10 min + 20/dag per IP, 60/timme globalt, checkout 10/10 min) i `app/lib/rateLimit.ts`
- **Tillförlitlighet:** AI-fel (OpenRouter-fel, trasig JSON) blir alltid `notMeasured` — aldrig ett påstått dåligt betyg
- **Google Places-efterlevnad:** inget Places-innehåll lagras (namn/adress/betyg/recensioner strippas före lagring, rehydreras vid läsning från `place_id`)
- **Dataskydd:** `provider.data_collection: "deny"` på alla OpenRouter-anrop (ingen loggning/träning hos providern)
- **Drift:** uptime-vakt (cron var 5:e min mot `robotbyran.com` + `analyze.pipod.net`, Telegram-larm vid tillstånds-växling)

### Produktionsverifiering 2026-09-25 (mot `robotbyran.com`, alla PASS)
- SSRF: blockerad intern URL → `400`
- Betalningsbypass: `tier=paid` utan token → inget paid-innehåll i svaret
- Free-scan: 37 checks, noll `"Kunde inte analyseras"`
- Rate limit: `429` efter gränsen
- Inga stacktraces i klientsvar

### QA-fixar 2026-09-25
- `eatSignals`/`faqSchema` kalibrerade mot `VERIFICATION-PROTOCOL.md` (deterministisk statusberäkning i stället för Flash-bedömning)
- Konkurrentanalys: Text Search-fallback för Places-typer som Nearby Search avvisar (`"Unsupported types"`)
- `contactInfo` ger inte längre `ok` på det bara ordet "kontakt" (nav-länk utan faktisk telefon/e-post)
- `hreflang`: upptäcker same-origin språkväljare deterministiskt (fångar false `notApplicable`)
- Flera-kontor-flagga: nationella kedjor utan angiven stad får "ange stad"-flagga i stället för en slumpmässig kontors-profil

## What's Missing

Fas 4-leveranskedjan är delvis klar — se Checklist.md "Fas 4: Leveranskedja" för detaljstatus per delmoment (persistens och betalning klara, e-post/PDF/review-tool inte påbörjade, väntar på ägarbeslut).

## Next Steps

1. **Riktigt end-to-end-köp i produktion (Stripe)** — aldrig verifierat med en riktig betalning, kräver Jens
2. **Fas 4-beslut** — e-postleverans (provider + DNS), PDF-behov, review-tool före leverans, Swish (se Checklist.md)
3. Löpande QA-uppföljning av nya sajter i produktion
