# Requirements: AI Search Scanner

**Defined:** 2026-04-22
**Core Value:** A Swedish business owner can enter their URL, wait ~30 seconds, and understand exactly what they need to do to be found by AI search engines — in language they understand, with concrete actions they can take.

## v1 Requirements

### Critical Fixes (from April 2026 analysis)

- [ ] **FIX-01**: Fix `_check_content_depth()` — national businesses fall into a function that doesn't exist
- [ ] **SITEMAP-01**: Check sitemap.xml existence and validity (one of the most important crawl signals)
- [ ] **ROBOTS-01**: Check `<meta name="robots">` tag — `noindex` can kill a page for AI crawlers
- [ ] **NAP-01**: Verify NAP consistency (Name/Address/Phone on website vs Google Business Profile)
- [ ] **EAT-01**: Check E-A-T basics: About Us page exists, visible contact info, named authors on content

### Existing Check Improvements

- [ ] **SCHEMA-01**: Validate schema correctness (not just existence)
- [ ] **PERF-01**: Add Core Web Vitals / page speed check
- [ ] **LINKS-01**: Analyze internal link structure
- [ ] **LOCAL-01**: Check local directory presence (Eniro, Gulasidor, Hitta.se)
- [ ] **FRESH-01**: Check content freshness cycle (regularity, not just dates)

### Reporting & UX

- [ ] **UX-01**: Report includes clear priority ranking (P1 vs P2)
- [ ] **UX-02**: Each new check produces a report card in the same format as existing 10
- [ ] **UX-03**: Score formula updated to include new checks

## v2 Requirements

### Monitoring & Accounts

- **MON-01**: User accounts with email/password
- **MON-02**: Save scan history per user
- **MON-03**: Monthly monitoring / re-scan scheduling
- **MON-04**: Email alerts when score drops

### Business

- **BUS-01**: Payment processing (Stripe)
- **BUS-02**: Agency plan (multi-client dashboard)
- **BUS-03**: White-label report export (PDF)

### Advanced Analysis

- **ADV-01**: Competitor comparison scan
- **ADV-02**: Keyword gap analysis for AI search
- **ADV-03**: Content recommendations via AI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time continuous monitoring | Manual scan only for v1 — monitoring deferred to v2 |
| Multi-language reports | Swedish-only by design — target market is Swedish SMEs |
| Mobile native app | Web-only — sufficient for target audience |
| Direct SEO rank tracking | Focus is AI search optimization, not traditional SEO |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 1 | Pending |
| SITEMAP-01 | Phase 1 | Pending |
| ROBOTS-01 | Phase 1 | Pending |
| NAP-01 | Phase 1 | Pending |
| EAT-01 | Phase 1 | Pending |
| SCHEMA-01 | Phase 2 | Pending |
| PERF-01 | Phase 2 | Pending |
| LINKS-01 | Phase 2 | Pending |
| LOCAL-01 | Phase 2 | Pending |
| FRESH-01 | Phase 2 | Pending |
| UX-01 | Phase 2 | Pending |
| UX-02 | Phase 2 | Pending |
| UX-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 after GSD initialization*
