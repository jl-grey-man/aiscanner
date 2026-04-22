# Roadmap: AI Search Scanner

## Overview

Take the existing 10-check AI Search Scanner from its current state to a complete v1 with 15 checks, fixing critical gaps (missing function, sitemap, robots meta, NAP, E-A-T) and adding deeper analysis (schema validation, performance, links, local directories, freshness cycle). Two phases: first fix the critical bugs and add missing checks, then deepen existing checks and improve UX.

## Phases

- [ ] **Phase 1: Critical Fixes & Missing Checks** - Fix `_check_content_depth`, add sitemap.xml, robots meta, NAP, E-A-T
- [ ] **Phase 2: Deepening & UX** - Schema validation, Core Web Vitals, internal links, local directories, freshness cycle, updated scoring

## Phase Details

### Phase 1: Critical Fixes & Missing Checks
**Goal**: Fix the crashing bug for national businesses and add the 5 most important missing checks identified in April 2026 analysis
**Depends on**: Nothing (first phase)
**Requirements**: FIX-01, SITEMAP-01, ROBOTS-01, NAP-01, EAT-01
**Success Criteria** (what must be TRUE):
  1. Scanning a national business URL no longer crashes (content depth check works)
  2. Report includes a sitemap.xml card with existence/validity status
  3. Report includes a robots meta-tag card detecting noindex/nofollow
  4. Report includes a NAP consistency card comparing website vs Google Business Profile
  5. Report includes an E-A-T basics card checking About page, contact info, named authors
**Plans**: 3 plans

Plans:
- [ ] 01-01: Fix `_check_content_depth()` crash for national businesses
- [ ] 01-02: Add sitemap.xml and robots meta-tag checks
- [ ] 01-03: Add NAP consistency and E-A-T basics checks

### Phase 2: Deepening & UX
**Goal**: Validate schema correctness, add performance and link analysis, check local directory presence, measure content freshness cycle, update score formula and report UX
**Depends on**: Phase 1
**Requirements**: SCHEMA-01, PERF-01, LINKS-01, LOCAL-01, FRESH-01, UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Schema card validates JSON-LD correctness (not just presence)
  2. Report includes Core Web Vitals / page speed score
  3. Report includes internal link structure analysis
  4. Report checks presence on Eniro, Gulasidor, Hitta.se for local businesses
  5. Report measures content update regularity (not just latest date)
  6. All new checks produce cards in the same format as existing 10
  7. Score formula updated to include all 15 checks
**Plans**: 3 plans

Plans:
- [ ] 02-01: Add schema validation, Core Web Vitals, and internal link checks
- [ ] 02-02: Add local directory presence and content freshness cycle checks
- [ ] 02-03: Update score formula and report UX (priority ranking, consistent cards)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Critical Fixes & Missing Checks | 0/3 | Not started | - |
| 2. Deepening & UX | 0/3 | Not started | - |
