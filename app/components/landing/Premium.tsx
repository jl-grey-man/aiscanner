'use client'

import { R } from './utils'

export function Premium() {
  return (
    <section className="premium-section">
      <div className="premium-inner">
        <R>
          <h2 className="section-h2">
            Vill du ha lösningarna —<br/>inte bara diagnosen?
          </h2>
        </R>
        <R delay={1}>
          <p className="section-body" style={{ maxWidth: 520, marginBottom: 56 }}>
            Gratisscannern visar var problemen är. Premiumrapporten berättar exakt
            hur du löser dem.
          </p>
        </R>

        <div className="premium-grid">
          <R>
            <div className="premium-free">
              <div className="premium-card-head">
                <span className="premium-card-title">Gratis analys</span>
                <span className="premium-price">0 kr</span>
              </div>
              <ul className="premium-list">
                {['23 kontroller i 4 kategorier', 'Totalpoäng och kategoripoäng', 'Generella förbättringsförslag', 'Resultat direkt, ingen registrering'].map((t, i) => (
                  <li key={i}><span className="premium-check">✓</span>{t}</li>
                ))}
              </ul>
              <p className="premium-foot">Visar vad som saknas.</p>
              <a href="#analysera" className="premium-cta-link">Testa din sajt →</a>
            </div>
          </R>
          <R delay={1}>
            <div className="premium-paid">
              <span className="premium-badge">Fullständig rapport</span>
              <div className="premium-card-head">
                <span className="premium-card-title">Premiumanalys</span>
                <span className="premium-price">499 kr</span>
              </div>
              <ul className="premium-list">
                <li className="premium-list-bold"><span className="premium-check accent">✓</span>Allt i gratisanalysen, plus:</li>
                {[
                  'Jämförelse mot 2–3 konkurrenter',
                  'NAP-konsistens mot Google-profilen',
                  'Recensionsanalys med sentiment',
                  'Skräddarsydda kodsnuttar att kopiera in',
                  'Prioriterad handlingsplan',
                  'Ordlista — tekniska termer på svenska',
                ].map((t, i) => (
                  <li key={i}><span className="premium-check accent">✓</span>{t}</li>
                ))}
              </ul>
              <p className="premium-foot">Tar 10 min att läsa. 2 timmar att implementera.</p>
            </div>
          </R>
        </div>

        <R>
          <p className="premium-note">
            Du behöver inte vara teknisk. Ge rapporten till din webbutvecklare
            — eller gör det själv via WordPress eller Squarespace.
          </p>
        </R>
      </div>
    </section>
  )
}
