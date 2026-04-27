'use client'

import { useState, useEffect, useRef } from 'react'
import { R, AnimNum } from './utils'

export function SearchChanged() {
  const [showAI, setShowAI] = useState(false)
  const ref = useRef<HTMLElement>(null)
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
    <section className="v3-changed" ref={ref}>
      <div className="v3-changed-inner">
        <R>
          <div className="v3-section-tag">Bakgrund</div>
        </R>
        <R>
          <h2 className="v3-h2">Sökning har<br/>förändrats</h2>
        </R>
        <R delay={1}>
          <p className="v3-body" style={{ maxWidth: 480, marginBottom: 56 }}>
            Fram till nyligen var Google en lista med tio blå länkar.
            Nu ger AI ett direkt svar — och väljer själv vem den rekommenderar.
          </p>
        </R>

        <div className="v3-compare">
          {/* Google */}
          <div className={`v3-compare-left ${showAI ? 'v3-compare-dimmed' : ''}`}>
            <div className="v3-compare-badge">Förr — Google</div>
            <div className="v3-search-bar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              bästa mäklare stockholm
            </div>
            {['Bjurfors.se', 'Fastighetsbyrån', 'Ditt Företag AB', 'Svensk Fast.', 'HusmanHagberg'].map((name, i) => (
              <div key={i} className={`v3-result ${i===2?'v3-result-you':''}`} style={{ opacity: i > 2 ? 0.3 + (3-i)*0.1 : 1 }}>
                <span className="v3-result-link">{name}</span>
                {i===2 && <span className="v3-you-tag">Du</span>}
              </div>
            ))}
            <p className="v3-result-note">Plats 3 av 10</p>
          </div>

          {/* AI */}
          <div className={`v3-compare-right ${showAI ? 'v3-compare-in' : ''}`}>
            <div className="v3-compare-badge v3-compare-badge-ai">Nu — AI</div>
            <div className="v3-chat-user">Vilken mäklare i Stockholm ska jag anlita?</div>
            <div className="v3-chat-ai">
              <p>Jag rekommenderar <strong>Fastighetsbyrån Östermalm</strong>. 340+ recensioner, tydliga priser, gratis digital värdering.</p>
              <span className="v3-chat-source">fastighetsbyran.com</span>
            </div>
            <div className="v3-verdict-float">
              <span className="v3-verdict-small">Ett svar. En rekommendation.</span>
              <span className="v3-verdict-big">Ditt företag nämns inte.</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="v3-stats">
          <R>
            <div className="v3-stat">
              <span className="v3-stat-n"><AnimNum value="64" suffix="%" /></span>
              <span className="v3-stat-l">av Google-sökningar visar AI-svar</span>
            </div>
          </R>
          <R delay={1}>
            <div className="v3-stat v3-stat-accent">
              <span className="v3-stat-n">1–2</span>
              <span className="v3-stat-l">företag i ett typiskt AI-svar</span>
            </div>
          </R>
          <R delay={2}>
            <div className="v3-stat">
              <span className="v3-stat-n"><AnimNum value="47" suffix="%" /></span>
              <span className="v3-stat-l">av unga vuxna söker via AI före Google</span>
            </div>
          </R>
        </div>
      </div>
    </section>
  )
}
