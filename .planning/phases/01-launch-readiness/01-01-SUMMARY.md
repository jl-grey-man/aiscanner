---
phase: 01-launch-readiness
plan: 01
subsystem: ui
tags: [nextjs, tailwind, google-fonts, landing-page, css, react-components]

requires: []
provides:
  - v3 CSS design system in globals.css (color tokens, v3-* classes, reveal animations)
  - Google Fonts loaded via next/font/google (Syne, DM Sans, Instrument Serif, JetBrains Mono)
  - 9 static landing page section components in app/components/landing/
  - Shared utils: R (scroll reveal), AnimNum (animated counter), Blob (decorative circle)
affects: [01-02, page.tsx integration]

tech-stack:
  added: [next/font/google, Syne, DM_Sans, Instrument_Serif, JetBrains_Mono]
  patterns:
    - Landing components in app/components/landing/ with use client
    - CSS custom properties (--c3-*, --font-*) for design tokens
    - R wrapper component for IntersectionObserver scroll reveal

key-files:
  created:
    - app/components/landing/utils.tsx
    - app/components/landing/Hero.tsx
    - app/components/landing/TickerBreak.tsx
    - app/components/landing/SearchChanged.tsx
    - app/components/landing/ConcreteExample.tsx
    - app/components/landing/WhatAILooksAt.tsx
    - app/components/landing/ReportExample.tsx
    - app/components/landing/Premium.tsx
    - app/components/landing/FaqSection.tsx
    - app/components/landing/Footer.tsx
  modified:
    - app/globals.css
    - app/layout.tsx

key-decisions:
  - "Font CSS variable names use --font-* prefix (Next.js convention) instead of --f-* from handoff"
  - "Ticker helper component kept local to TickerBreak.tsx (not exported from utils)"
  - "FaqItem kept local to FaqSection.tsx as internal implementation detail"

requirements-completed: [LAND-01, LAND-02, LAND-03, LAND-04, LAND-05]

duration: 7min
completed: 2026-04-27
---

# Phase 01 Plan 01: Landing Page Components — CSS + Components Summary

**v3 design system CSS extracted to globals.css, Google Fonts loaded via next/font, and 9 static landing page sections faithfully converted from handoff JSX to TypeScript React components**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-27T18:12:20Z
- **Completed:** 2026-04-27T18:19:36Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Full v3 CSS design system (color tokens, v3-* classes, reveal/ticker animations) appended to globals.css with font variable name mapping
- Four Google Fonts (Syne, DM Sans, Instrument Serif, JetBrains Mono) loaded via next/font/google with CSS variables applied to html element
- Shared utility components (R, AnimNum, Blob) converted from JSX to TypeScript with proper interfaces
- All 9 static section components created as faithful TypeScript conversions of components-v3.jsx

## Task Commits

Each task was committed atomically:

1. **Task 1: CSS + Google Fonts** - `1a312fd` (feat)
2. **Task 2: utils.tsx** - `573b71b` (feat)
3. **Task 3: 9 section components** - `102744b` (feat)

## Files Created/Modified
- `app/globals.css` - v3 design system CSS appended, --f-* → --font-* variable names
- `app/layout.tsx` - Four Google Fonts via next/font/google, CSS variables on html element
- `app/components/landing/utils.tsx` - R (scroll reveal), AnimNum (animated counter), Blob (decorative circle)
- `app/components/landing/Hero.tsx` - Hero section with pill badge, H1, serif subheading, CTA
- `app/components/landing/TickerBreak.tsx` - Marquee ticker with internal Ticker helper
- `app/components/landing/SearchChanged.tsx` - Two-panel Google vs AI compare with IntersectionObserver animation
- `app/components/landing/ConcreteExample.tsx` - ChatGPT response example with reason cards
- `app/components/landing/WhatAILooksAt.tsx` - Six-signal checklist with good/bad examples
- `app/components/landing/ReportExample.tsx` - Static report card preview (Bjurfors example)
- `app/components/landing/Premium.tsx` - Free vs premium pricing comparison
- `app/components/landing/FaqSection.tsx` - Accordion FAQ with useState open/close toggle
- `app/components/landing/Footer.tsx` - Simple footer with brand and URL

## Decisions Made
- Font CSS variables renamed from `--f-display/body/serif/mono` (handoff convention) to `--font-display/body/serif/mono` (Next.js next/font convention) — required for correct font loading
- `Ticker` kept as local helper inside `TickerBreak.tsx` — not exported, no other consumers
- `FaqItem` kept as local component inside `FaqSection.tsx` — internal detail not needed externally

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All static section components ready for import into page.tsx
- ScanCTA component (plan 01-02) will complete the landing page assembly
- npm run build passes with zero TypeScript errors

---
*Phase: 01-launch-readiness*
*Completed: 2026-04-27*

## Self-Check: PASSED

Verified:
- `app/globals.css` contains `.v3-hero`, `.v3-changed`, `.v3-cta`, `.rv.vis`, `--c3-pop`
- `app/layout.tsx` imports Syne from `next/font/google` with `--font-display` variable
- All 10 files exist in `app/components/landing/` (utils + 9 sections)
- `utils.tsx` exports R, AnimNum, Blob
- Commits `1a312fd`, `573b71b`, `102744b` all present in git log
- `npm run build` exits 0
