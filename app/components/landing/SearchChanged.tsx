'use client'

import { useState, useEffect, useRef } from 'react'
import { R, AnimNum } from './utils'

export function SearchChanged() {
  const [showAI, setShowAI] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => setShowAI(true), 800); obs.unobserve(el) }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section className="changed-section" ref={sectionRef}>
      <div className="changed-inner">
        <R>
          <h2 className="section-h2">
            Sökning håller på<br/>att förändras
          </h2>
        </R>
        <R delay={1}>
          <p className="section-body" style={{ maxWidth: 480, marginBottom: 56 }}>
            Fram till nyligen var Google en lista med tio blå&nbsp;länkar.
            Nu ger AI ett direkt svar — och väljer själv vem den rekommenderar.
          </p>
        </R>

        {/* The visual comparison */}
        <div className="compare-stage">
          {/* Google side — fades away */}
          <div className={`compare-google ${showAI ? 'compare-fade' : ''}`}>
            <div className="compare-label">
              <span className="compare-dot" style={{background:'var(--c-muted)'}}></span>
              Förr — Google
            </div>
            <div className="compare-searchbar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span>bästa mäklare stockholm</span>
            </div>
            {['Bjurfors.se', 'Fastighetsbyrån', 'Ditt Företag AB', 'Svensk Fast.', 'HusmanHagberg'].map((name, i) => (
              <div key={i} className={`compare-result ${i === 2 ? 'compare-you' : ''}`} style={{ opacity: i > 2 ? 0.4 + (3-i)*0.1 : 1 }}>
                <span className="compare-link">{name}</span>
                {i === 2 && <span className="compare-you-tag">Du</span>}
              </div>
            ))}
            <p className="compare-verdict-ok">Du fanns med — plats 3 av 10</p>
          </div>

          {/* AI side — slides in dramatically */}
          <div className={`compare-ai ${showAI ? 'compare-ai-in' : ''}`}>
            <div className="compare-label" style={{color:'var(--c-accent)'}}>
              <span className="compare-dot" style={{background:'var(--c-accent)'}}></span>
              Nu — AI-sökning
            </div>
            <div className="compare-chat-user">
              Vilken mäklare i Stockholm ska jag anlita?
            </div>
            <div className="compare-chat-ai">
              <p>Baserat på kundrecensioner rekommenderar jag <strong>Fastighetsbyrån Östermalm</strong>. De har 340+ femstjärnsrecensioner, tydliga priser, och erbjuder gratis digital värdering.</p>
              <span className="compare-source">Källa: fastighetsbyran.com</span>
            </div>
            <div className="compare-verdict-bad">
              <span className="verdict-label">Ett svar. En rekommendation.</span>
              <span className="verdict-highlight">Ditt företag nämns inte.</span>
            </div>
          </div>
        </div>

        {/* Stats — BIG numbers */}
        <div className="stats-row">
          <R>
            <div className="stat-item">
              <span className="stat-num"><AnimNum value="64" suffix="%" /></span>
              <span className="stat-label">av Google-sökningar visar nu ett AI-svar högst upp</span>
            </div>
          </R>
          <R delay={1}>
            <div className="stat-item">
              <span className="stat-num">1–2</span>
              <span className="stat-label">företag i ett typiskt AI-svar. Resten ignoreras.</span>
            </div>
          </R>
          <R delay={2}>
            <div className="stat-item">
              <span className="stat-num"><AnimNum value="47" suffix="%" /></span>
              <span className="stat-label">av unga vuxna söker via AI före Google</span>
            </div>
          </R>
        </div>
      </div>
    </section>
  )
}
