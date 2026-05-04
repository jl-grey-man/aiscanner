'use client'

import { R } from './utils'

export function Hero() {
  return (
    <section className="hero-section">
<div className="hero-inner">
        <R>
          <p className="hero-tag">AI Search Scanner</p>
        </R>
        <R delay={1}>
          <h1 className="hero-h1">
            Dina kunder<br/>frågar AI.
          </h1>
        </R>
        <R delay={2}>
          <p className="hero-h1-sub">Vad svarar den om&nbsp;dig?</p>
        </R>
        <R delay={4}>
          <p className="hero-body">
            Allt fler söker via ChatGPT och Perplexity istället för att scrolla Googles&nbsp;länkar.
            AI ger <em>ett</em> svar — inte tio.
          </p>
        </R>
        <R delay={5}>
          <a href="#analysera" className="hero-cta">
            Testa din sajt — gratis
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </R>
      </div>

    </section>
  )
}
