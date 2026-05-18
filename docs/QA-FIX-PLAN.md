# QA Fix Plan — Remaining Scanner Problems

> **Date:** 2026-05-14
> **Source:** Opus analysis of `SCANNER_VERIFICATION.md` + full codebase trace
> **Context:** QA test April 26 against 3 businesses (71% accuracy). 4 bugs fixed same day. These 5 remain.

---

## Problem 1: HTTPS false warning on valid certs

**Symptom:** Tvåkanten got warning "HTTPS används, men kontrollera certifikat" despite valid cert.

**Root cause:** `checkBuilder.ts` builds HTTPS check correctly from boolean, but `buildTechnicalPrompt()` in `route.ts` doesn't tell Flash to never add cert warnings. Flash sometimes adds "kontrollera certifikat" in its `finding` field even when status is `ok`. Pro synthesis then amplifies this into the action plan.

**Files:**
- `app/api/enhanced-scan/route.ts` — `buildTechnicalPrompt()` (~line 192) and `buildSynthesisPrompt()` (~line 450)

**Fix:**
1. In `buildTechnicalPrompt()` REGLER, change HTTPS rule to:
   ```
   https: "ok" = webbplatsen använder https (certifikatet ANSES GILTIGT — vi testar inte certifikat, ge aldrig varning om certifikat när HTTPS=Ja), "bad" = http
   https: finding ska BARA vara "Webbplatsen använder HTTPS." för ok, eller "Webbplatsen använder HTTP." för bad. INGA certifikatvarningar.
   ```
2. In `buildSynthesisPrompt()` REGLER, add:
   ```
   HTTPS: Om den tekniska analysen visar https.status="ok" — nämn ALDRIG certifikat/SSL i åtgärdsplanen.
   ```

**Verify:** Scan `https://tvakanten.se`, confirm check #1 has status `ok` with no cert mention, and synthesis doesn't mention SSL.

**Effort:** ~15 min. Prompt text only, no logic changes.

---

## Problem 2: Meta description scored too harshly by AI

**Symptom:** Tvåkanten has excellent meta description ("Restaurang på Avenyn i Göteborg med svensk mat & personlig service...") rated as "bad — inte optimerad för AI".

**Root cause:** `checkBuilder.ts` #29 (`metaDescription`) only checks existence — ok if present, bad if missing. The synthesis prompt lets the Pro model criticize good descriptions. The old `buildFreePrompt()` in `prompts.ts` asks AI to judge "AI-optimerad meta-beskrivning" with no guidance on what "good" means.

**Files:**
- `app/lib/checkBuilder.ts` — lines 707-719 (check #29)
- `app/api/enhanced-scan/route.ts` — `buildSynthesisPrompt()` REGLER
- `app/lib/prompts.ts` — `buildFreePrompt()` VIKTIGA REGLER (legacy endpoint)

**Fix:**
1. In `checkBuilder.ts` #29, replace simple existence check with length-based quality heuristic:
   - 80-180 chars → `ok` (show actual text + length)
   - <80 chars → `warning` ("too short")
   - \>180 chars → `warning` ("may be truncated")
   - Missing → `bad`
2. In `buildSynthesisPrompt()` REGLER, add:
   ```
   Meta-beskrivning: Om metabeskrivningen tydligt anger verksamhet, plats och erbjudande — ge den INTE kritik.
   ```
3. In `buildFreePrompt()` VIKTIGA REGLER (legacy), add:
   ```
   Meta-beskrivning: En meta description som beskriver verksamheten, platsen och tjänsterna ÄR AI-optimerad. Bedöm utifrån om AI kan extrahera: vad, var, unikt. Status 'good' om den svarar på dessa frågor.
   ```

**Verify:** Scan `https://tvakanten.se`, confirm check #29 is `ok` with actual description shown. Scan a site with NO meta description, confirm `bad`.

**Effort:** ~30 min.

---

## Problem 3: "Not analyzed" padding — 6+ checks say "not checked"

**Symptom:** CWV, alt texts, internal linking, semantic HTML default to "warning — not checked". Inflates warning count, makes report feel padded.

**Root cause:**
- CWV (#10) is always `notMeasured` with weight 0 — pure noise, never measured
- `openingHours` (#17) shows `notMeasured` when no GBP — misleading (should be `notApplicable`)
- Zero-weight `notMeasured` checks still appear in the check table

**Files:**
- `app/components/report/CheckTable.tsx` — filter logic (~line 30)
- `app/lib/checkBuilder.ts` — check #17 openingHours (~line 414)
- `app/components/report/FreeReport.tsx` — check count heading

**Fix:**
1. In `CheckTable.tsx`, filter out `notMeasured` checks with weight 0:
   ```typescript
   .filter((c) => {
     if (c.status === 'notMeasured') {
       const reg = CHECK_REGISTRY.find(e => e.key === c.key)
       return (reg?.weight.free ?? 0) > 0
     }
     return true
   })
   ```
2. In `checkBuilder.ts` #17, change to `notApplicable` (not `notMeasured`) when no GBP data, with finding: "Kräver Google Business Profile — kontrolleras i premiumrapporten."
3. In `FreeReport.tsx`, update heading to show only the visible count (excluding filtered-out checks).

**Verify:** Scan any site — CWV should not appear in check table. `openingHours` shows "N/A" badge instead of "---". Count in heading matches visible rows.

**Effort:** ~20 min.

---

## Problem 4: 504 timeout for full scan via Cloudflare (>100s)

**Symptom:** Enhanced scan takes ~90-150s. Cloudflare edge has hard ~100s HTTP response timeout on free plans. Not configurable via cloudflared.

**Root cause:** The timeout is a Cloudflare platform limit, not cloudflared or nginx. The chain: Browser → Cloudflare edge (100s limit) → cloudflared → nginx (150s) → Next.js. Only streaming bypasses the limit.

**Files:**
- NEW: `app/api/enhanced-scan-stream/route.ts` — SSE streaming endpoint
- `app/hooks/useAnalysis.ts` — switch to SSE reader

**Fix:** Create SSE endpoint that sends progress events as each phase completes. Cloudflare does NOT timeout streaming responses as long as data flows periodically.

1. New `/api/enhanced-scan-stream` endpoint:
   - Returns `ReadableStream` with `Content-Type: text/event-stream`
   - Same scan logic but sends `event: progress` after each phase
   - Sends `event: result` with final `ScanResult` at the end
   - Sends `event: error` on failure

2. Update `useAnalysis.ts`:
   - Use `fetch()` with `ReadableStream` reader
   - Parse SSE events from chunked response
   - Update progress state from `progress` events
   - Set `scanResult` from `result` event

3. Keep existing `/api/enhanced-scan` as fallback for Tailscale/direct access (no 100s limit).

**Verify:** `curl -N -X POST https://analyze.pipod.net/api/enhanced-scan-stream ...` — SSE events arrive every ~15-30s, full scan completes without 504.

**Effort:** ~2-3 hours. Biggest task — new endpoint + client rewrite.

---

## Problem 5: Dev toggle visible in production

**Symptom:** Free/premium toggle button visible to users at analyze.pipod.net.

**Root cause:** `AppShell.tsx` line 18:
```typescript
const IS_DEV = true // TEMP: enable dev toggle in production for testing
```
Hardcoded `true`, never reverted after testing.

**Files:**
- `app/components/AppShell.tsx` — line 18

**Fix:** Change to:
```typescript
const IS_DEV = process.env.NODE_ENV === 'development'
```

**Verify:** `npm run build` + restart → toggle gone at analyze.pipod.net. `npm run dev` → toggle visible at localhost:3000.

**Effort:** ~2 min. One-line change.

---

## Summary — files changed per fix

| File | Changes | Problems |
|------|---------|----------|
| `app/components/AppShell.tsx` | `IS_DEV` → `process.env.NODE_ENV === 'development'` | #5 |
| `app/api/enhanced-scan/route.ts` | Prompt rules: no cert warning, meta desc, HTTPS | #1, #2 |
| `app/lib/prompts.ts` | Meta desc quality rule in VIKTIGA REGLER | #2 |
| `app/lib/checkBuilder.ts` | #29 length heuristic, #17 → notApplicable | #2, #3 |
| `app/components/report/CheckTable.tsx` | Filter zero-weight notMeasured | #3 |
| `app/components/report/FreeReport.tsx` | Visible check count | #3 |
| NEW `app/api/enhanced-scan-stream/route.ts` | SSE streaming endpoint | #4 |
| `app/hooks/useAnalysis.ts` | SSE reader | #4 |

## Recommended order

| # | Problem | Effort | Risk |
|---|---------|--------|------|
| 1 | Dev toggle (#5) | 2 min | None |
| 2 | HTTPS false warning (#1) | 15 min | Minimal — prompt only |
| 3 | Meta description (#2) | 30 min | Low — deterministic logic |
| 4 | Not-analyzed padding (#3) | 20 min | Low — UI filtering |
| 5 | Cloudflare 504 (#4) | 2-3 hrs | Moderate — new endpoint + client |
