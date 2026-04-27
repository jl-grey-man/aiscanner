---
phase: 01-launch-readiness
plan: "02"
subsystem: landing-ui
tags: [components, scan-flow, email-capture, client-side]
dependency_graph:
  requires: [01-01]
  provides: [ToolSection, PremiumCTA]
  affects: [app/page.tsx]
tech_stack:
  added: []
  patterns: [useAnalysis-hook, localStorage-capture, scroll-into-view-ref]
key_files:
  created:
    - app/components/landing/ToolSection.tsx
    - app/components/landing/PremiumCTA.tsx
  modified: []
decisions:
  - "ToolSection uses inline styles for section-level layout to match v3-cta dark section (not Tailwind bg-zinc-950) — keeps design consistent with globals.css v3 token system"
  - "PremiumCTA renders null when show=false (not CSS hidden) — cleaner React pattern, no DOM residue"
  - "Error state shown as styled card inside ToolSection — avoids crashing UI on scan failure"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-27"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 01 Plan 02: ToolSection + PremiumCTA Summary

Interactive scan UI and post-scan email capture — ToolSection wraps the full scan flow with v3-cta dark section styling, PremiumCTA stores email in localStorage with no backend.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ToolSection | e5bb1d4 | app/components/landing/ToolSection.tsx |
| 2 | Create PremiumCTA | 8248d40 | app/components/landing/PremiumCTA.tsx |

## What Was Built

### ToolSection (`app/components/landing/ToolSection.tsx`)
- `id="analysera"` section element — anchor target from Hero CTA (`href="#analysera"`)
- Dark background matching v3-cta section: `background: var(--c3-ink)` (#111)
- Heading: "Hur ser det ut för din sajt?" with pop-color underline on "din"
- Sub: "23 kontroller. 30 sekunder. Gratis."
- Calls `useAnalysis()` internally — no new scan logic, no prop drilling
- Renders `UrlInput` (always visible, disabled during scan for re-scan UX)
- Shows `Progress` while `state === 'scanning'`
- Shows `EnhancedReport` + `PremiumCTA` when `enhancedReport` is non-null
- `useEffect` + `useRef` scrolls report into view when enhancedReport arrives
- Error state rendered as styled card for graceful failure display

### PremiumCTA (`app/components/landing/PremiumCTA.tsx`)
- Props: `{ show: boolean }` — returns null when false
- White card on dark background: `background: white`, `border-radius: 16px`
- Heading: "Vill du ha hela analysen?"
- Body: "Vi går igenom din sajt manuellt och skickar en komplett rapport med kodsnuttar och handlingsplan."
- Price badge: "499 kr"
- Email form: input + "Beställ rapport" button
- On submit: `localStorage.setItem('premium_interest_email', email)` + shows "Tack! Vi hör av oss."
- No API call, no backend — Phase 1 intent preserved

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] `npm run build` exits 0
- [x] ToolSection.tsx has `id="analysera"`
- [x] ToolSection.tsx renders EnhancedReport
- [x] PremiumCTA.tsx uses localStorage, no fetch/API calls

## Known Stubs

None — both components are fully wired. PremiumCTA email capture goes to localStorage; this is intentional per plan (Phase 2 will add the email delivery pipeline).

## Self-Check: PASSED

Files created:
- FOUND: /mnt/storage/aiscanner/app/components/landing/ToolSection.tsx
- FOUND: /mnt/storage/aiscanner/app/components/landing/PremiumCTA.tsx

Commits verified:
- FOUND: e5bb1d4 (ToolSection)
- FOUND: 8248d40 (PremiumCTA)
