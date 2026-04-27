# Roadmap: AI Search Scanner

## Overview

Produkten har tre delar att bygga: (1) ny landningssida med tydlig narrativ, (2) rätt scan-flöde med gratis direkt + betald via email-leverans med manuell review, (3) teknisk städning inför stabil drift.

## Phases

- [ ] **Phase 1: Landing Page & Scan Flow** — Ny 8-sektions landningssida + gratis scan direkt + premium-erbjudande efter scan
- [ ] **Phase 2: Premium Delivery Pipeline** — Email-capture, review-kö, emailutskick som websida + PDF
- [ ] **Phase 3: Launch Readiness** — Rate limiting, säkerhet (.env), nginx-fix, dead code, dev-toggle

## Phase Details

### Phase 1: Landing Page & Scan Flow

**Goal:** Ersätt nuvarande 2-sektions hero med ny 8-sektions narrativ landningssida. Gratis scan körs direkt på sidan. Premium erbjuds efter gratis scan (men levereras inte ännu — det är Phase 2).
**Depends on:** Nothing (first phase)
**Requirements:** LAND-01, LAND-02, LAND-03, LAND-04, LAND-05, SCAN-01, SCAN-02
**Success Criteria:**
  1. Landningssidan har 8 sektioner per handoff-design: Hero, Förklararen, Problemet, Checklistan, Företagsexempel, Vanliga misstag, Verktyget, Footer
  2. Gratis scan (enhanced-scan) körs direkt på sidan utan krav på email
  3. Efter gratis scan visas CTA: "Beställ komplett analys" → kräver email-inmatning
  4. Betald analys triggas INTE ännu (placeholder) — det är Phase 2
  5. Dev-toggle borttagen från UI
  6. Mörkt tema (zinc-950) konsekvent genom hela sidan
**Plans:** 3

Plans:
- [ ] 01-01: 8-sektions landningssida (Hero → Förklararen → Problemet → Checklistan)
- [ ] 01-02: Företagsexempel + Vanliga misstag + Verktyget + Footer
- [ ] 01-03: Gratis scan-integration + premium CTA-form (email capture, ingen leverans ännu)

### Phase 2: Premium Delivery Pipeline

**Goal:** Betald analys körs, Jens granskar i review-kö, skickar per email som websida + PDF
**Depends on:** Phase 1
**Requirements:** PREM-01, PREM-02, PREM-03, PREM-04, PREM-05
**Success Criteria:**
  1. När användare beställer premium: enhanced-scan Pro-analys körs och sparas i kö
  2. Jens kan se pending analyser i admin-vy (enkel lista med URL, email, datum)
  3. Jens kan granska rapporten och godkänna/avvisa
  4. Vid godkännande skickas email till kunden med länk till webbrapporten + PDF
  5. PDF genereras automatiskt från rapport-HTML
**Plans:** 3

Plans:
- [ ] 02-01: Premium scan queue (trigga + spara i SQLite, admin list-vy)
- [ ] 02-02: Admin review + approve/reject flow
- [ ] 02-03: Email delivery + PDF generation

### Phase 3: Launch Readiness

**Goal:** Teknisk städning — ingen funktion saknas men driftstabiliteten och säkerheten behöver stärkas
**Depends on:** Phase 2
**Requirements:** LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-05, LAUNCH-06
**Success Criteria:**
  1. /api/enhanced-scan returnerar 429 efter 3 anrop från samma IP/timme
  2. API-nycklar enbart i .env.local; .env i .gitignore
  3. nginx-config proxar allt till port 8010 (dead frontend/dist alias borttagen)
  4. backend/ och frontend/ kataloger borttagna från repo
  5. enhanced-scan filer committade
**Plans:** 2

Plans:
- [ ] 03-01: Rate limiting, .env-fix, nginx-cleanup
- [ ] 03-02: Dead code removal + commit untracked files

## Progress

**Execution Order:** 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Landing Page & Scan Flow | 1/3 | In Progress | - |
| 2. Premium Delivery Pipeline | 0/3 | Not started | - |
| 3. Launch Readiness | 0/2 | Not started | - |
