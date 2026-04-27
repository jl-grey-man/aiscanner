# Phase 1: Landing Page & Scan Flow — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Bygg den nya 8-sektions landningssidan (från handoff-design) och säkerställ korrekt scan-flöde: gratis scan direkt på sidan, premium erbjuds som CTA efter gratis scan (leveransen sker i Phase 2). Dev-toggle tas bort.

**Vad som INTE ingår i denna fas:** email-leverans, PDF, admin-vy, betalning, rate limiting, nginx-fix.

</domain>

<decisions>
## Implementation Decisions

### Landningssida
- **8-sektioner i ordning:** Hero → Förklararen → Problemet → Checklistan → Företagsexempel → Vanliga misstag → Verktyget → Footer
- **Tema:** Ljust tema — INTE mörkt. Handoff-designens layout och struktur följs men med ljus bakgrund.
- **Hero-rubrik:** "Dina kunder frågar AI. Vad svarar den om dig?" (från landing-page-proposal.md)
- **Ton:** Direkt, informerande som en kunnig vän. Ingen hype, inga skräcktaktiker.
- **3 URL-inputs:** strategiskt placerade i Hero, Verktyget, och eventuellt Problemet-sektionen

### Scan-flöde
- **Gratis scan:** enhanced-scan endpoint, körs direkt utan email-krav (nuvarande beteende OK)
- **Gratis rapport:** visas direkt på sidan (EnhancedReport-komponenten)
- **Premium CTA:** visas EFTER gratis scan — "Beställ komplett analys" — kräver email-inmatning
- **Premium i Phase 1:** Endast email-capture + placeholder-bekräftelse ("Vi hör av oss"). INGEN leverans ännu.
- **Dev-toggle:** Tas bort helt från page.tsx (inte env-gated — fullständigt borttagen)

### Design-referens
- Handoff-designen i `AI Analys-handoff.zip` är den visuella källan
- `docs/landing-page-proposal.md` har sektionsstruktur och text
- `docs/landing-page-spec.md` har värdeproposition och ton
- Nuvarande `app/page.tsx` hero och `app/components/EnhancedReport.tsx` ska integreras — inte kastas

### Claude's Discretion
- Exakt implementation av "Förklararen" (visual jämförelse Google vs AI) — CSS/SVG/animationer
- Empresagsexempel: generera trovärdigt "Erikssons Rör" before/after (fejkade men realistiska data)
- Footer-innehåll (utöver "AI Search Scanner — byggd för svenska företag")
- Hur email-capture sparas i Phase 1 placeholder (localStorage, state, eller enkel POST)

</decisions>

<specifics>
## Specifika referenser

- Handoff-zip: `AI Analys-handoff.zip` i projektroot — innehåller HTML-prototyper med CSS/JS
- Primär design-fil i zippen: `project/` katalogen med HTML-filer
- Sektionstext och struktur: `docs/landing-page-proposal.md`
- Produktkrav och ton: `docs/landing-page-spec.md`

**Premium-flöde (Jens-specifikt):**
- Betald analys skickas INTE direkt till användaren
- Jens granskar varje analys manuellt innan den skickas
- Levereras per email som websida + PDF
- Phase 1 behöver bara fånga email — leveransen byggs i Phase 2

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Produktkrav
- `docs/landing-page-proposal.md` — 8-sektions struktur, rubriker, copy-riktning
- `docs/landing-page-spec.md` — målgrupp, värdeproposition, ton

### Befintlig kod att bygga på
- `app/page.tsx` — nuvarande hero + dev-toggle (ersätt hero, ta bort toggle)
- `app/components/EnhancedReport.tsx` — rapport-komponenten (behåll, integrera i ny design)
- `app/hooks/useAnalysis.ts` — scan state machine (behåll, anropa enhanced-scan)
- `app/api/enhanced-scan/route.ts` — aktiv endpoint (inga ändringar i Phase 1)

### Handoff-design
- `AI Analys-handoff.zip` — visuell prototyp (extrahera och läs HTML-filerna)

</canonical_refs>

<code_context>
## Codebase Context

**Aktiva komponenter:**
- `app/page.tsx` — landing + scan entry point (ska skrivas om till 8-sektioner)
- `app/components/EnhancedReport.tsx` — visar scan-resultat (behåll, integrera)
- `app/hooks/useAnalysis.ts` — hanterar scan state (`analyze(url, city)` → `enhancedReport`)
- `app/components/UrlInput.tsx` — URL + city input (återanvänd i Hero och andra sektioner)
- `app/components/Progress.tsx` — progress-animation (återanvänd)

**Dev toggle (att ta bort):**
- `app/page.tsx` rad ~12-40: `devView` state + toggle-knappar
- Tar bort helt — inga villkor, ingen env-gate

**Tema:**
- Ljust tema — ej mörkt
- Handoff-designens layout, sektionsstruktur och copy används — inte dess färgschema
- EnhancedReport kan behöva light-theme-anpassning

</code_context>

<deferred>
## Deferred Ideas

- Email-leverans och PDF-generering → Phase 2
- Admin review-kö → Phase 2
- Betalning (Stripe) → v2
- Rate limiting → Phase 3
- Unifiering av FreeReportData/PremiumReportData/EnhancedReportData → Phase 3 eller v2

</deferred>

---

*Phase: 01-landing-page-and-scan-flow*
*Context gathered: 2026-04-27 via discuss-phase*
