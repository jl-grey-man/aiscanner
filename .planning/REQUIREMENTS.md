# Requirements: AI Search Scanner

**Defined:** 2026-04-22
**Updated:** 2026-04-27 — omstrukturerat baserat på faktisk produktvision
**Core Value:** En svensk företagare kan skanna sin sajt gratis, förstå vad som saknas, och beställa en komplett analys som granskas manuellt och levereras per email.

## v1 Requirements

### Landing Page (Phase 1)

- [ ] **LAND-01**: Landningssidan har 8 sektioner: Hero, Förklararen, Problemet, Checklistan, Företagsexempel, Vanliga misstag, Verktyget, Footer
- [ ] **LAND-02**: Hero-sektion: rubrik "Dina kunder frågar AI. Vad svarar den om dig?" + URL-input + city-input
- [ ] **LAND-03**: Förklararen: visuell jämförelse "gamla Google (10 länkar) → nya AI (ett svar)"
- [ ] **LAND-04**: Checklistan: 7 konkreta saker AI tittar på (per landing-page-spec.md)
- [ ] **LAND-05**: Företagsexempel: before/after-rapport (Erikssons Rör eller liknande)

### Scan Flow (Phase 1)

- [ ] **SCAN-01**: Gratis scan (enhanced-scan) körs direkt på sidan utan krav på email
- [ ] **SCAN-02**: Efter gratis scan: CTA "Beställ komplett analys" med email-inmatning (ingen leverans i Phase 1 — placeholder)
- [ ] **SCAN-03**: Dev-toggle borttagen från produktions-UI

### Premium Delivery (Phase 2)

- [ ] **PREM-01**: Betald analys-beställning sparas i SQLite-kö (URL, email, timestamp, status)
- [ ] **PREM-02**: Admin-vy: lista pending/sent analyser med URL + email + datum
- [ ] **PREM-03**: Jens kan granska rapport i admin-vy och godkänna/avvisa
- [ ] **PREM-04**: Vid godkännande: email skickas till kund med länk till webbrapport
- [ ] **PREM-05**: PDF genereras automatiskt från rapport (bifogat i email)

### Launch Readiness (Phase 3)

- [ ] **LAUNCH-01**: Rate limiting på /api/enhanced-scan (3 anrop/IP/timme, in-memory)
- [ ] **LAUNCH-02**: API-nycklar enbart i .env.local; .env i .gitignore
- [ ] **LAUNCH-03**: nginx-config proxar allt till port 8010 (dead frontend/dist alias borttagen)
- [ ] **LAUNCH-04**: backend/ och frontend/ kataloger borttagna från repo
- [ ] **LAUNCH-05**: enhanced-scan och relaterade lib-filer committade till git

## v2 Requirements

### Accounts & History
- **ACC-01**: Användarkonton med email/lösenord
- **ACC-02**: Scan-historik per användare
- **ACC-03**: Månadsvis re-scan med email-diff

### Advanced Analysis
- **ADV-01**: E-A-T som egen labeled check (About-sida, namngivna författare, förtroendesignaler)
- **ADV-02**: Schema-validering (korrekthet, inte bara existens)
- **ADV-03**: Core Web Vitals-mätning
- **ADV-04**: Internt länkstruktursanalys
- **ADV-05**: Content freshness cycle (regelbundenhet, inte bara senaste datum)

### Infrastructure
- **INF-01**: Persistent cache (Redis eller filbaserad — överlever omstart)
- **INF-02**: Error tracking (Sentry eller liknande)
- **INF-03**: Analytics (scan-antal, konvertering)
- **INF-04**: Tester för Next.js API routes och lib-funktioner

## Out of Scope

| Feature | Reason |
|---------|--------|
| Stripe-betalning | Manuell fakturering för v1 — Stripe i v2 |
| Realtids-monitoring | Manuell scan för v1 |
| Multi-language reports | Svenska only — marknadsbeslut |
| Mobile native app | Web-only |
| SSE streaming | Simulerad progress räcker för v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAND-01 | Phase 1 | Pending |
| LAND-02 | Phase 1 | Pending |
| LAND-03 | Phase 1 | Pending |
| LAND-04 | Phase 1 | Pending |
| LAND-05 | Phase 1 | Pending |
| SCAN-01 | Phase 1 | Pending |
| SCAN-02 | Phase 1 | Pending |
| SCAN-03 | Phase 1 | Pending |
| PREM-01 | Phase 2 | Pending |
| PREM-02 | Phase 2 | Pending |
| PREM-03 | Phase 2 | Pending |
| PREM-04 | Phase 2 | Pending |
| PREM-05 | Phase 2 | Pending |
| LAUNCH-01 | Phase 3 | Pending |
| LAUNCH-02 | Phase 3 | Pending |
| LAUNCH-03 | Phase 3 | Pending |
| LAUNCH-04 | Phase 3 | Pending |
| LAUNCH-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-27 — omstrukturerat efter produktvision-session*
