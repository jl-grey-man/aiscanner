'use client'

import { R } from './utils'

export function Premium() {
  return (
    <section className="v3-premium">
      <div className="v3-premium-inner">
        <R><div className="v3-section-tag">Erbjudande</div></R>
        <R><h2 className="v3-h2">Lösningarna —<br/>inte bara diagnosen</h2></R>
        <R delay={1}><p className="v3-body" style={{maxWidth:520,marginBottom:56}}>Gratisscannern visar problemen. Premiumrapporten löser dem.</p></R>

        <div className="v3-premium-grid">
          <R>
            <div className="v3-prem-free">
              <span className="v3-prem-title">Gratis analys</span>
              <span className="v3-prem-price">0 kr</span>
              <ul className="v3-prem-list">
                {['23 kontroller','Totalpoäng + kategori','Förbättringsförslag','Ingen registrering'].map((t, i) => (
                  <li key={i}><span className="v3-prem-ok">✓</span>{t}</li>
                ))}
              </ul>
              <p className="v3-prem-foot">Visar vad som saknas.</p>
              <a href="#analysera" className="v3-prem-link">Testa din sajt →</a>
            </div>
          </R>
          <R delay={1}>
            <div className="v3-prem-paid">
              <div className="v3-prem-badge">Fullständig rapport</div>
              <span className="v3-prem-title">Premiumanalys</span>
              <span className="v3-prem-price">499 kr</span>
              <ul className="v3-prem-list">
                <li className="v3-prem-bold"><span className="v3-prem-ok acc">✓</span>Allt i gratis, plus:</li>
                {['Jämförelse mot konkurrenter','NAP-konsistens','Recensionsanalys','Kodsnuttar att kopiera','Prioriterad handlingsplan','Ordlista på svenska'].map((t, i) => (
                  <li key={i}><span className="v3-prem-ok acc">✓</span>{t}</li>
                ))}
              </ul>
              <p className="v3-prem-foot">10 min att läsa. 2 timmar att implementera.</p>
            </div>
          </R>
        </div>
      </div>
    </section>
  )
}
