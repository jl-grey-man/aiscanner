'use client'

import { R, Blob } from './utils'

export function Hero() {
  return (
    <section className="v3-hero">
      <Blob color="var(--c3-pop)" size="500px" top="-200px" right="-100px" blur={180} opacity={0.25} />
      <Blob color="var(--c3-blue)" size="400px" bottom="-150px" left="-100px" blur={160} opacity={0.2} />

      {/* Decorative grid lines */}
      <div className="v3-hero-grid" aria-hidden="true">
        {Array.from({length: 6}).map((_, i) => (
          <div key={i} className="v3-grid-line" style={{ left: `${16 + i * 14}%` }} />
        ))}
      </div>

      <div className="v3-hero-inner">
        <R>
          <div className="v3-hero-pill">
            <span className="v3-pill-dot" />
            AI Search Scanner
          </div>
        </R>
        <R delay={1}>
          <h1 className="v3-hero-h1">
            Dina kunder
            <br />frågar <span className="v3-hero-accent">AI</span>.
          </h1>
        </R>
        <R delay={2}>
          <h2 className="v3-hero-sub">
            Vad svarar den om dig?
          </h2>
        </R>
        <R delay={3}>
          <p className="v3-hero-body">
            Allt fler söker via ChatGPT och Perplexity istället för att scrolla Googles länkar.
            AI ger <em>ett</em> svar — inte tio.
          </p>
        </R>
        <R delay={4}>
          <a href="#analysera" className="v3-hero-cta">
            <span>Testa din sajt — gratis</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </R>
      </div>

      <R delay={6}>
        <p className="v3-hero-footnote">
          Förra året → länklista. I år → ett namn.
        </p>
      </R>
    </section>
  )
}
