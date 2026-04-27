# Phase 1: Landing Page & Scan Flow — Research

**Researched:** 2026-04-27
**Domain:** Next.js 15 App Router — UI rewrite (landing page + scan flow + premium CTA)
**Confidence:** HIGH — all findings verified directly from codebase and handoff files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Landningssida:**
- 8-sektioner i ordning: Hero → Förklararen → Problemet → Checklistan → Företagsexempel → Vanliga misstag → Verktyget → Footer
- Tema: Ljust tema — INTE mörkt. Handoff-designens layout och struktur följs men med ljus bakgrund.
- Hero-rubrik: "Dina kunder frågar AI. Vad svarar den om dig?" (från landing-page-proposal.md)
- Ton: Direkt, informerande som en kunnig vän. Ingen hype, inga skräcktaktiker.
- 3 URL-inputs: strategiskt placerade i Hero, Verktyget, och eventuellt Problemet-sektionen

**Scan-flöde:**
- Gratis scan: enhanced-scan endpoint, körs direkt utan email-krav (nuvarande beteende OK)
- Gratis rapport: visas direkt på sidan (EnhancedReport-komponenten)
- Premium CTA: visas EFTER gratis scan — "Beställ komplett analys" — kräver email-inmatning
- Premium i Phase 1: Endast email-capture + placeholder-bekräftelse ("Vi hör av oss"). INGEN leverans ännu.
- Dev-toggle: Tas bort helt från page.tsx (inte env-gated — fullständigt borttagen)

**Design-referens:**
- Handoff-designen i `AI Analys-handoff.zip` är den visuella källan
- `docs/landing-page-proposal.md` har sektionsstruktur och text
- `docs/landing-page-spec.md` har värdeproposition och ton
- Nuvarande `app/page.tsx` hero och `app/components/EnhancedReport.tsx` ska integreras — inte kastas

### Claude's Discretion
- Exakt implementation av "Förklararen" (visual jämförelse Google vs AI) — CSS/SVG/animationer
- Företagsexempel: generera trovärdigt "Erikssons Rör" before/after (fejkade men realistiska data)
- Footer-innehåll (utöver "AI Search Scanner — byggd för svenska företag")
- Hur email-capture sparas i Phase 1 placeholder (localStorage, state, eller enkel POST)

### Deferred Ideas (OUT OF SCOPE)
- Email-leverans och PDF-generering → Phase 2
- Admin review-kö → Phase 2
- Betalning (Stripe) → v2
- Rate limiting → Phase 3
- Unifiering av FreeReportData/PremiumReportData/EnhancedReportData → Phase 3 eller v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAND-01 | Landningssidan har 8 sektioner: Hero, Förklararen, Problemet, Checklistan, Företagsexempel, Vanliga misstag, Verktyget, Footer | Handoff v3 defines exact section structure; landing-page-proposal.md has copy for each section |
| LAND-02 | Hero-sektion: rubrik "Dina kunder frågar AI. Vad svarar den om dig?" + URL-input + city-input | Handoff Hero component confirmed; UrlInput component already handles both fields |
| LAND-03 | Förklararen: visuell jämförelse "gamla Google (10 länkar) → nya AI (ett svar)" | Handoff SearchChanged component is a fully-built reference implementation |
| LAND-04 | Checklistan: 7 konkreta saker AI tittar på (per landing-page-spec.md) | Handoff WhatAILooksAt has 6 items; landing-page-proposal.md has 7 — use the 7 from proposal |
| LAND-05 | Företagsexempel: before/after-rapport (Erikssons Rör eller liknande) | Handoff ReportExample is a static mock report card — adapt with Erikssons Rör data |
| SCAN-01 | Gratis scan (enhanced-scan) körs direkt på sidan utan krav på email | useAnalysis.analyze() already calls /api/enhanced-scan; no changes to hook needed |
| SCAN-02 | Efter gratis scan: CTA "Beställ komplett analys" med email-inmatning (ingen leverans i Phase 1) | New component needed post-EnhancedReport; state: email captured → localStorage or state-only |
</phase_requirements>

---

## Summary

This phase replaces the current 2-section `app/page.tsx` hero with an 8-section narrative landing page and adjusts the scan flow to add a premium CTA after the free scan. The technical foundation — enhanced-scan endpoint, useAnalysis hook, EnhancedReport component — does not change. The work is almost entirely UI/layout.

The authoritative design source is the handoff zip, specifically `AI Search Scanner v3.html` and `components-v3.jsx`. Version 3 of the handoff is the most refined: a bold editorial style with a light cream background (`#FAFAF8`), vermillion accent (`#E84420`), Syne display font, DM Sans body font. It includes 8 React components that map almost 1:1 to the required 8 sections (see Architecture Patterns). The handoff uses a light theme throughout — consistent with CONTEXT.md's decision to go light.

**Critical theme note:** CONTEXT.md says "ljust tema" and the handoff v3 uses `#FAFAF8` cream/white as background. The ROADMAP.md incorrectly says "zinc-950 mörkt" — CONTEXT.md takes precedence. The current `tailwind.config.ts` already uses a light base (`#f8fafc`) so the existing Tailwind setup is compatible. EnhancedReport.tsx already uses light-mode color classes (gray-900 for the header, but all content areas use light frame/border tokens) — minor adaptation needed to match the new light page theme.

**Primary recommendation:** Implement each section as a standalone React component in `app/components/landing/`, imported into a rewritten `app/page.tsx`. Reuse UrlInput, Progress, and EnhancedReport unchanged or with minimal adaptation. Add one new `PremiumCTA` component that appears after EnhancedReport when `state === 'done'`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Landing page sections (static content) | Browser / Client | — | Pure presentational components, no server data needed |
| URL scan triggering | Browser / Client | API / Backend | `analyze()` in useAnalysis hook calls /api/enhanced-scan |
| Enhanced scan execution | API / Backend | — | `app/api/enhanced-scan/route.ts` — no changes in Phase 1 |
| Progress display | Browser / Client | — | Simulated progress, no server state |
| EnhancedReport display | Browser / Client | — | Renders EnhancedReportData passed from hook |
| Premium CTA email capture | Browser / Client | — | Phase 1: state-only or localStorage, no server write |
| Scroll-to-scan (3 inputs) | Browser / Client | — | Anchor link (`#analysera`) or `scrollIntoView` |
| Scroll-triggered animations | Browser / Client | — | IntersectionObserver pattern (same as handoff) |
| Animated stat counters | Browser / Client | — | CountUp animation on scroll-into-view |

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.3.1 | App Router framework | [VERIFIED: package.json] |
| React | 19.1.0 | UI library | [VERIFIED: package.json] |
| TypeScript | (next managed) | Type safety | [VERIFIED: package.json] |
| Tailwind CSS | (current) | Utility styling | [VERIFIED: tailwind.config.ts] |

### Supporting — no new dependencies needed for Phase 1

The handoff design uses external fonts (Syne, DM Sans, Instrument Serif, JetBrains Mono via Google Fonts). These can be added either as `next/font/google` imports or as `<link>` in the Next.js layout. All animation patterns (IntersectionObserver, requestAnimationFrame) are native browser APIs — no library needed.

| Approach | What | Notes |
|----------|------|-------|
| `next/font/google` | Syne + DM Sans | [ASSUMED] Next.js 15 standard, tree-shakeable, no CORS |
| IntersectionObserver (native) | Scroll-reveal + animated counters | Same pattern used in handoff components-v3.jsx |
| `scrollIntoView` (native) | Scroll to scan tool from checklist CTA | Already used in page.tsx |

**No new npm packages required.** All functionality achievable with existing stack.

**Installation:** Nothing new to install.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  ├── page.tsx (rewritten)
  │     ├── HeroSection         → UrlInput (scan triggered here)
  │     ├── TickerBreak         → marquee animation (optional)
  │     ├── ExplainerSection    → Google vs AI comparison (IntersectionObserver)
  │     ├── ProblemSection      → 3 stat cards + AnimNum counters
  │     ├── ChecklistSection    → 7 items + soft CTA (scroll to #analysera)
  │     ├── ExampleSection      → Erikssons Rör before/after static cards
  │     ├── MistakesSection     → 3 "things that don't work anymore" cards
  │     ├── ToolSection         → id="analysera" + UrlInput (scan triggered here)
  │     │     ↓ (if scan state === 'scanning')
  │     │     Progress component
  │     │     ↓ (if state === 'done')
  │     │     EnhancedReport component
  │     │     ↓ (after report)
  │     │     PremiumCTA component (email capture)
  │     └── FooterSection
  │
  │── useAnalysis hook (unchanged)
  │     analyze(url, city) → POST /api/enhanced-scan
  │     state: idle | scanning | done | error
  │     enhancedReport: EnhancedReportData | null
  │
  └── /api/enhanced-scan (unchanged)
        Returns: EnhancedReportData
```

### Recommended Project Structure

```
app/
  page.tsx                    # Rewritten: 8-section composition
  components/
    landing/
      HeroSection.tsx         # Section 1: pill + H1 + H2 + UrlInput
      ExplainerSection.tsx    # Section 2: Google vs AI comparison
      ProblemSection.tsx      # Section 3: 3 stat cards + explanatory text
      ChecklistSection.tsx    # Section 4: 7-item checklist + soft CTA
      ExampleSection.tsx      # Section 5: Erikssons Rör before/after
      MistakesSection.tsx     # Section 6: 3 "myth" cards
      ToolSection.tsx         # Section 7: id="analysera" + scan + report + PremiumCTA
      FooterSection.tsx       # Section 8: minimal footer
      PremiumCTA.tsx          # Sub-component: email capture form shown post-scan
    EnhancedReport.tsx        # (kept, minor light-theme adaptation)
    UrlInput.tsx              # (kept, no changes)
    Progress.tsx              # (kept, no changes)
```

### Pattern 1: Section Component Structure

Each section is a standalone React component. Follows the handoff pattern exactly:

```tsx
// Source: handoff/components-v3.jsx — R() reveal wrapper pattern
'use client'

interface RevealProps {
  children: React.ReactNode
  delay?: number
}

function R({ children, delay = 0 }: RevealProps) {
  // IntersectionObserver scroll reveal
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('vis'); obs.unobserve(el) } },
      { threshold: 0.01, rootMargin: '20px 0px 0px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="rv" style={{ transitionDelay: `${delay * 0.1}s` }}>
      {children}
    </div>
  )
}
```

Add to `globals.css`:
```css
.rv { opacity: 0; transform: translateY(24px); transition: opacity .65s cubic-bezier(.16,1,.3,1), transform .65s cubic-bezier(.16,1,.3,1); }
.rv.vis { opacity: 1; transform: none; }
```

### Pattern 2: Animated Counter (for ProblemSection stats)

```tsx
// Source: handoff/components-v3.jsx — AnimNum pattern
function AnimNum({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const ran = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !ran.current) {
        ran.current = true
        const dur = 1200, t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1)
          setN(Math.round((1 - Math.pow(1 - p, 3)) * value))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value])
  return <span ref={ref}>{n}{suffix}</span>
}
```

### Pattern 3: Scroll-to-scan (multiple inputs)

The 3 URL inputs all target the same scan handler. Instances in HeroSection and ChecklistSection can use an anchor link `<a href="#analysera">` to scroll to the ToolSection. The ToolSection contains the primary `UrlInput` connected to `analyze()`. Only one `useAnalysis` hook instance lives in `page.tsx` — all state flows through it.

```tsx
// In page.tsx:
const { state, enhancedReport, error, analyze, reset, ... } = useAnalysis()

// HeroSection and ChecklistSection receive onSubmit prop OR use anchor:
<a href="#analysera" className="...">Analysera din sida</a>

// ToolSection receives the active onSubmit:
<UrlInput onSubmit={handleSubmit} disabled={isScanning} />
```

**Decision for Claude:** Use anchor `#analysera` for the Hero and Checklist soft CTAs rather than a second live UrlInput — simpler, avoids race conditions. If Jens prefers live inputs at top, they can scroll-and-focus the ToolSection input via `scrollIntoView` + `focus()`.

### Pattern 4: Premium CTA Email Capture

Shown only when `state === 'done'`. Phase 1 captures email to localStorage (or React state only). No API call.

```tsx
function PremiumCTA() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    // Phase 1: store to localStorage
    localStorage.setItem('premium_interest_email', email)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-200">
        <p className="text-lg font-semibold text-gray-900">Vi hör av oss!</p>
        <p className="text-gray-500 mt-2">Du får ett mail när din analys är klar.</p>
      </div>
    )
  }

  return (
    <div className="mt-8 p-8 bg-slate-50 rounded-2xl border border-slate-200">
      <h3>Beställ komplett analys</h3>
      <form onSubmit={handleSubmit}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="din@email.se" />
        <button type="submit">Beställ — 499 kr</button>
      </form>
      <p className="text-sm text-gray-400">Jens granskar manuellt och hör av sig.</p>
    </div>
  )
}
```

### Pattern 5: Light Theme Adaptation for EnhancedReport

EnhancedReport.tsx has one dark-background block: the report header (`bg-gray-900 text-white`). All other areas already use light-theme tokens (`bg-frame`, `border-border`, `text-gray-700`). For the new light page, options:

**Option A (minimal):** Keep the dark header as a visual anchor — it contrasts well against the light page and makes the report feel distinct. No changes needed.

**Option B (full light):** Replace `bg-gray-900` header with `bg-slate-100 border border-slate-200` and text becomes dark. Requires updating badge styles.

**Recommendation (Claude's discretion):** Option A — keep the dark header. It creates clear visual separation between the landing content and the scan result. The rest of the component is already light-themed.

### Pattern 6: Font Loading (Next.js 15 way)

```tsx
// app/layout.tsx — add Google Fonts via next/font
import { Syne, DM_Sans } from 'next/font/google'

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
})
```

Then in `tailwind.config.ts`:
```ts
fontFamily: {
  display: ['var(--font-display)', 'system-ui', 'sans-serif'],
  body: ['var(--font-body)', 'system-ui', 'sans-serif'],
},
```

**Note:** If fonts feel like scope creep, the existing system font stack (Tailwind default sans) works fine for Phase 1. The handoff visual character comes from layout/spacing more than fonts. Mark as Claude's discretion.

### Anti-Patterns to Avoid

- **Multiple useAnalysis instances:** Only one hook instance in page.tsx. Don't instantiate it in child sections.
- **Passing analyze() down 3 levels:** Pass `onSubmit` as a prop or use a shared context — keep it simple for Phase 1, prop drilling to ToolSection is fine.
- **Calling enhanced-scan from multiple places:** There is only one scan trigger, in ToolSection. The Hero and Checklist scroll to it.
- **Modifying enhanced-scan route:** CONTEXT.md explicitly says no changes to the API in Phase 1.
- **New global CSS overrides:** Add scroll-reveal classes to globals.css only; all other styling stays Tailwind utilities.
- **Removing SeoSplit component:** The current page.tsx imports SeoSplit. If ExplainerSection replaces it, remove the import to avoid dead code. But don't delete the SeoSplit component file yet (Phase 3 cleanup).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll-triggered animations | Custom animation library | IntersectionObserver (native) + CSS transitions | Already used in handoff; no dep needed |
| Animated number counters | Canvas/WebGL animation | requestAnimationFrame + IntersectionObserver | ~25 lines, handoff already has it |
| Markdown rendering (synthesis) | Full markdown parser | Existing SynthesisMarkdown in EnhancedReport.tsx | Already built and working |
| Form state | Redux / Zustand | useState + localStorage | Phase 1 email is trivial state |
| Scroll to element | Custom scroll util | `scrollIntoView` + anchor `#id` | Native, works in all browsers |
| Font loading | @import in CSS | next/font/google | Avoids FOUT, tree-shakeable, recommended by Next.js |

**Key insight:** This phase is a UI layout task. All complex logic (scan, AI calls, report parsing) is already built. Resist adding dependencies.

---

## Common Pitfalls

### Pitfall 1: Dev-toggle Removal Leaves Dead Import
**What goes wrong:** Removing `DevToggle` and `devView` state from page.tsx but leaving the `import { FreeReport }` and `import { mockFreeReport }` used only by the dev view.
**Why it happens:** The dev view imports are at the top of the file and look like they might be needed.
**How to avoid:** After removing the devView block, scan all imports and remove any that only served the dev view: `FreeReport`, `mockFreeReport`.
**Warning signs:** TypeScript "unused import" warnings.

### Pitfall 2: Multiple UrlInput Submissions
**What goes wrong:** Adding live UrlInput components in both Hero and ToolSection, where a user types in one, hits submit, and the other still has stale input.
**Why it happens:** Natural instinct to "make both inputs work."
**How to avoid:** Use anchor links for all except the primary ToolSection input. The Hero button scrolls to `#analysera` instead of triggering a scan directly.

### Pitfall 3: Scroll Reveal Flicker on Page Load
**What goes wrong:** Sections that are already in viewport on initial load still have `opacity: 0` for a frame, causing a flash.
**Why it happens:** IntersectionObserver fires slightly after first paint.
**How to avoid:** The `rootMargin: '20px 0px 0px 0px'` in the handoff pattern mitigates this. Additionally, the Hero section (always above fold) should NOT use the reveal wrapper — set it to visible immediately.

### Pitfall 4: Tailwind Classes Not in PurgeCSS Scan
**What goes wrong:** Landing section components in `app/components/landing/` use Tailwind classes that purge trims because the glob in tailwind.config.ts doesn't cover the subdirectory.
**Why it happens:** Current glob: `./app/**/*.{js,ts,jsx,tsx,mdx}` — this actually DOES cover subdirectories via `**`. Not a real risk, but worth knowing.
**How to avoid:** Verify glob covers `app/components/landing/**` — confirmed `**` handles it.

### Pitfall 5: EnhancedReport City Guard in PremiumCTA
**What goes wrong:** The PremiumCTA shows before the user sees the full scan result, or shows even when the scan failed.
**Why it happens:** Checking `state === 'done'` but forgetting to check `enhancedReport !== null`.
**How to avoid:** Render PremiumCTA only when `enhancedReport && state === 'done'`.

### Pitfall 6: `next/font` CSS Variables Not Applied
**What goes wrong:** Fonts are imported with `next/font/google` but the CSS variables aren't applied to `<body>` — page falls back to system font.
**Why it happens:** Next.js requires adding the font's `className` or `variable` to the root layout element.
**How to avoid:** In `app/layout.tsx`, add `className={`${syne.variable} ${dmSans.variable}`}` to the `<html>` element.

---

## Code Examples

### Handoff: ExplainerSection (Google vs AI compare)

The handoff `SearchChanged` component shows the pattern:

```tsx
// Source: handoff/components-v3.jsx SearchChanged
function ExplainerSection() {
  const [showAI, setShowAI] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => setShowAI(true), 600); obs.unobserve(el) }
    }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section ref={ref} className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-8">
        <div className="grid grid-cols-2 rounded-3xl overflow-hidden shadow-xl">
          {/* Left: Google */}
          <div className={`bg-white p-8 transition-all duration-700 ${showAI ? 'opacity-30 blur-sm' : ''}`}>
            {/* search bar mock + results list */}
          </div>
          {/* Right: AI */}
          <div className={`bg-gray-900 text-white p-8 transition-all duration-700 ${showAI ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}>
            {/* chat bubble mock */}
          </div>
        </div>
      </div>
    </section>
  )
}
```

### Handoff: Checklist (WhatAILooksAt)

The handoff uses 6 items with numbered display. CONTEXT says 7 items. Use the 7 from `docs/landing-page-proposal.md`:

```tsx
// Source: handoff/components-v3.jsx WhatAILooksAt — adapted
const CHECKLIST_ITEMS = [
  { title: 'Schema markup (strukturerad data)', text: '...' },
  { title: 'NAP-konsistens (Name, Address, Phone)', text: '...' },
  { title: 'Google Business Profile', text: '...' },
  { title: 'Metabeskrivningar och titlar', text: '...', hasExample: true },
  { title: 'Innehållskvalitet och unikhet', text: '...' },
  { title: 'Teknisk hygien (robots.txt, sitemap, HTTPS)', text: '...' },
  { title: 'Recensioner och sociala bevis', text: '...' },
]
```

### Handoff: Before/After report card

```tsx
// Source: handoff/components-v3.jsx ReportExample — adapted for Erikssons Rör
// Static component — no dynamic data
const BEFORE_FINDINGS = [
  { text: 'Schema markup saknas helt', bad: true },
  { text: 'Ingen adress på hemsidan', bad: true },
  { text: 'robots.txt blockerar crawlers', bad: true },
]
const AFTER_FINDINGS = [
  { text: 'LocalBusiness JSON-LD komplett', ok: true },
  { text: 'NAP matchat med Google', ok: true },
  { text: 'robots.txt öppet för AI-crawlers', ok: true },
]
```

### Tailwind token map (current → new page)

| Token | Value | Used in |
|-------|-------|---------|
| `bg-base` | `#f8fafc` | Page background (already set in globals.css body) |
| `bg-frame` | `#ffffff` | Card backgrounds |
| `border-border` | `#e5e7eb` | Card borders |
| `text-muted` | `#6b7280` (gray-500) | Body text, subtitles |
| `accent` | `#2563eb` | CTA buttons, highlights |

**For the handoff's vermillion accent (#E84420):** This is the handoff design's aesthetic choice. CONTEXT says follow handoff layout/structure but with light background. The accent color decision is Claude's discretion. Recommendation: keep the existing `accent: #2563eb` (blue) for CTA buttons, which already works throughout the app. Use it instead of vermillion. This avoids changing button colors mid-page when the scan result (which uses accent) renders.

---

## Section Mapping: Handoff v3 → Phase 1 Requirements

| # | CONTEXT.md Name | Handoff v3 Component | Status |
|---|-----------------|---------------------|--------|
| 1 | Hero | `Hero` | Direct port — swap CTA button for UrlInput |
| 2 | Förklararen | `SearchChanged` | Direct port — IntersectionObserver animation included |
| 3 | Problemet | `SearchChanged` (bottom stats) + `ConcreteExample` | Merge: use stats from SearchChanged, chatbox from ConcreteExample |
| 4 | Checklistan | `WhatAILooksAt` | Port + expand from 6 → 7 items per proposal |
| 5 | Företagsexempel | `ReportExample` | Port + replace Bjurfors data with Erikssons Rör data |
| 6 | Vanliga misstag | (no direct equivalent in v3) | New component based on v1/v2 or write from proposal |
| 7 | Verktyget | `ScanCTA` + result area | Replace mock input with live UrlInput + scan result |
| 8 | Footer | `Footer` | Direct port |

**Note on "Vanliga misstag":** The handoff v3 does not have a dedicated "Vanliga misstag" section. The handoff v1 (`AI Search Scanner.html`) and v2 may have it. The content is fully specified in `docs/landing-page-proposal.md` sektion 6 (three myth-busting cards). Implement as a simple 3-card grid following the existing card style.

**Note on section count:** The handoff v3 actually has 10 components (Hero, Ticker, SearchChanged, ConcreteExample, WhatAILooksAt, ScanCTA, ReportExample, Premium, FAQ, Footer). The Phase 1 requirement is 8 sections. The mapping collapses ConcreteExample into Problemet and drops Ticker, Premium, and FAQ sections. The `ToolSection` combines ScanCTA + ReportExample functionality.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SeoSplit + basic hero | 8-section narrative landing | Phase 1 | page.tsx fully replaced |
| Dev-toggle visible in UI | Removed | Phase 1 | mockData.ts and FreeReport import become dead |
| No premium CTA | Email capture after scan | Phase 1 | New PremiumCTA component |
| Dark zinc-950 theme | Light #f8fafc theme | Phase 1 | EnhancedReport header may need minor adaptation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Using anchor `#analysera` for Hero/Checklist CTAs rather than a second live UrlInput | Architecture Patterns §3 | Low — Jens may want live inputs at top; easy to change |
| A2 | Keeping existing accent blue (#2563eb) instead of handoff vermillion (#E84420) | Code Examples §tailwind tokens | Low — cosmetic only, easy to swap |
| A3 | Option A for EnhancedReport (keep dark header, no changes to component) | Pattern 5 | Low — purely visual |
| A4 | next/font/google for Syne + DM Sans | Pattern 6 | Low — fallback to system fonts works fine; fonts are discretionary |
| A5 | Email stored in localStorage for Phase 1 (no server write) | Pattern 4 | Low — Phase 2 will replace with proper queue |

---

## Open Questions

1. **Vanliga misstag section: use v1/v2 handoff or write fresh from proposal?**
   - What we know: proposal has full copy for 3 myth-busting cards
   - What's unclear: whether v1/v2 handoff has this section styled
   - Recommendation: write fresh from proposal text; it's simple 3-card layout

2. **Ticker (marquee) between Hero and Förklararen?**
   - What we know: handoff v3 has `TickerBreak` as section 2 — scrolling text: "ChatGPT · Perplexity · Google AI..."
   - What's unclear: CONTEXT.md doesn't mention it explicitly; it's not in the 8-section list
   - Recommendation: Claude's discretion — add it as a visual separator between Hero and Förklararen; it's a single lightweight component

3. **FAQ section from handoff v3?**
   - What we know: handoff v3 has a full FAQ section (6 questions, accordion). CONTEXT 8-section list doesn't include it
   - What's unclear: whether it should replace "Vanliga misstag" or be added as a 9th section
   - Recommendation: skip FAQ for Phase 1 (it's not in the 8-section requirement)

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely a UI code change. No external CLI tools, databases, or services are added or required beyond the already-running Next.js app. The enhanced-scan endpoint is unchanged.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected |
| Config file | None |
| Quick run command | `npm run build` (type-check + compile) |
| Full suite command | `npm run build && curl -s -X POST http://localhost:8010/api/enhanced-scan -H "Content-Type: application/json" -d '{"url":"https://bjurfors.se","city":"Stockholm"}' --max-time 140 \| python3 -m json.tool` |

No test files exist in the project. [VERIFIED: filesystem scan]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAND-01 | 8 sections render without crash | smoke | `npm run build` (TS errors = fail) | ❌ Wave 0 |
| LAND-02 | Hero section renders with UrlInput and both inputs | smoke | Visual verify at http://100.72.180.20:8010 | ❌ manual |
| LAND-03 | Förklararen compare panel animates on scroll | smoke | Visual verify at http://100.72.180.20:8010 | ❌ manual |
| LAND-04 | Checklist has exactly 7 items | smoke | Visual verify / DOM count | ❌ manual |
| LAND-05 | Erikssons Rör before/after shows correct data | smoke | Visual verify at http://100.72.180.20:8010 | ❌ manual |
| SCAN-01 | Scan triggers without email, returns report | integration | `curl` smoke test above | ❌ manual |
| SCAN-02 | PremiumCTA visible after scan completes, email saved | smoke | Visual verify + localStorage check in devtools | ❌ manual |

### Sampling Rate

- **Per task commit:** `npm run build` — TypeScript compile must succeed, zero TS errors
- **Per wave merge:** Full visual smoke test at http://100.72.180.20:8010
- **Phase gate:** All 8 sections visible, scan works end-to-end, PremiumCTA appears post-scan, no dev-toggle in UI

### Wave 0 Gaps

- [ ] No automated test infrastructure exists — all verification is manual + build check
- [ ] After implementation, verify with `sudo systemctl restart ai-scanner-api && curl` smoke test

*(Note: `nyquist_validation: true` in config.json, but project has zero test files. Build-success is the highest automated gate available for this UI-heavy phase.)*

---

## Security Domain

`security_enforcement` key is absent from config.json — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in Phase 1 |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Public page |
| V5 Input Validation | Yes (email + URL) | HTML `type="email"` + `.trim()` — no server storage in Phase 1 |
| V6 Cryptography | No | No crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via dangerouslySetInnerHTML | Tampering | Already used in EnhancedReport; keep input restricted to formatted synthesis text only |
| Email capture stored in localStorage | Information Disclosure | Phase 1 only stores intent; no PII transmitted to server. Phase 2 must use HTTPS POST |
| Excessive enhanced-scan calls via UI | Denial of Service | Rate limiting deferred to Phase 3 (LAUNCH-01) — acceptable for Phase 1 |

**Note:** The existing `dangerouslySetInnerHTML` in SynthesisMarkdown is safe because the input comes from the Gemini API response (controlled source), not from user input. Do not introduce new `dangerouslySetInnerHTML` instances in Phase 1 landing sections.

---

## Project Constraints (from CLAUDE.md)

Extracted from `./CLAUDE.md` (project-level):

| Constraint | Impact on Phase 1 |
|-----------|------------------|
| Stack: Next.js 15 App Router, TypeScript, Tailwind CSS | All components must use App Router conventions, typed props |
| UI: Tailwind CSS only — no CSS modules | All new section styles via Tailwind utilities + globals.css for `.rv`/`.vis` only |
| No state management library — React hooks only | useAnalysis hook handles all scan state; email = useState/localStorage |
| Scraper runs server-side only (API route) | Not relevant to UI phase |
| Do NOT modify `backend/` or `frontend/` | Confirmed: all work in `app/` only |
| Dev-toggle: Remove completely (not env-gated) | Remove `DevToggle` component, `devView` state, related imports |
| Swedish strings for all user-facing text | All copy from proposal/spec is Swedish — maintain this |
| TypeScript strict, no `any` unless unavoidable | All new component props must be typed |
| MANDATORY: Test every fix before saying it's done | Build must succeed + visual verification at http://100.72.180.20:8010 before task marked complete |
| Production URL: https://analyze.pipod.net | After restart, verify at production URL too |

---

## Sources

### Primary (HIGH confidence)

- `AI Analys-handoff.zip` / `project/AI Search Scanner v3.html` — visual prototype, CSS variables, layout patterns [VERIFIED: extracted and read]
- `AI Analys-handoff.zip` / `project/components-v3.jsx` — all React component implementations [VERIFIED: extracted and read]
- `app/page.tsx` — current landing page structure, dev-toggle code, scan flow [VERIFIED: read]
- `app/hooks/useAnalysis.ts` — full interface: analyze(), state, enhancedReport, EnhancedReportData type [VERIFIED: read]
- `app/components/EnhancedReport.tsx` — report renderer, theme tokens in use [VERIFIED: read]
- `app/components/UrlInput.tsx` — interface: `{onSubmit, disabled}` [VERIFIED: read]
- `app/components/Progress.tsx` — interface: `{currentStep, progressPct, stepIndex}` [VERIFIED: read]
- `app/tailwind.config.ts` — custom tokens: accent, base, frame, border [VERIFIED: read]
- `app/globals.css` — current body background: `#f8fafc` (light) [VERIFIED: read]
- `docs/landing-page-proposal.md` — 8-section structure, copy for each section [VERIFIED: read]
- `docs/landing-page-spec.md` — tone, audience, value proposition [VERIFIED: read]
- `.planning/phases/01-launch-readiness/01-CONTEXT.md` — locked decisions [VERIFIED: read]
- `.planning/REQUIREMENTS.md` — LAND-01 through SCAN-02 [VERIFIED: read]
- `package.json` — Next.js 15.3.1, React 19.1.0 [VERIFIED: read]

### Secondary (MEDIUM confidence)

- `AI Analys-handoff.zip` / `project/AI Search Scanner v1.html` and `v2.html` — earlier design iterations [available but not read in full — v3 is authoritative]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — verified from package.json and existing codebase
- Architecture: HIGH — derived directly from existing component interfaces and handoff design
- Section content: HIGH — landing-page-proposal.md has full copy for each section
- Handoff patterns: HIGH — components-v3.jsx read in full
- Pitfalls: MEDIUM — based on code analysis + typical React patterns
- Test infrastructure: HIGH (confirmed absent) — no test files exist

**Research date:** 2026-04-27
**Valid until:** Stable — 60 days (Next.js App Router API won't change materially)
