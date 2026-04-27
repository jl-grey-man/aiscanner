'use client'

import { R } from './utils'

export function ConcreteExample() {
  return (
    <section className="example-section">
      <div className="example-inner">
        <R>
          <h2 className="section-h2">Varför valde AI<br/>just de företagen?</h2>
        </R>
        <R delay={1}>
          <p className="section-body" style={{ maxWidth: 480, marginBottom: 48 }}>
            Vi frågade ChatGPT om en mäklare i Stockholm. Svaret avslöjar exakt
            vad AI letar efter.
          </p>
        </R>

        {/* ChatGPT answer */}
        <R>
          <div style={{
            background: 'white', borderRadius: 16, padding: 'clamp(24px,3vw,32px)',
            border: 'none', marginBottom: 56, color: 'var(--c-ink)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--c-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'white' }}>AI</div>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-muted)' }}>ChatGPT-svar</span>
            </div>
            <p style={{ fontStyle: 'italic', color: 'var(--c-light)', fontSize: 14, marginBottom: 12 }}>
              &quot;Vilken fastighetsmäklare i Stockholm rekommenderar du?&quot;
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--c-muted)', marginBottom: 12 }}>
              Ett populärt val i Stockholm är <strong style={{color:'var(--c-ink)'}}>Fastighetsbyrån Östermalm</strong>.
              De har ett starkt rykte med över 340 Google-recensioner (snittbetyg 4,8), erbjuder gratis
              digital hemvärdering direkt på sin webbplats, och har tydliga uppgifter om priser och
              provisionsnivåer.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--c-muted)' }}>
              Ett annat alternativ är <strong style={{color:'var(--c-ink)'}}>Notar Vasastan</strong> som specialiserar
              sig på bostadsrätter i innerstaden och har en utförlig FAQ-sektion om köpprocessen.
            </p>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--c-border)', fontSize: 11, color: 'var(--c-light)' }}>
              Källor: fastighetsbyran.com/ostermalm, notar.se/vasastan, Google Maps
            </div>
          </div>
        </R>

        <R>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Varför valde AI just de företagen?</h3>
        </R>

        {/* Four reasons — each visually distinct */}
        <div className="reasons-grid">
          {[
            { n: '01', title: 'Schema markup', desc: 'Deras sajt berättar i kod vad de gör, var de finns, och hur man når dem.', accent: true },
            { n: '02', title: 'Hundratals recensioner', desc: 'AI väger inte bara betyg utan även antal — och läser texten i dem.' },
            { n: '03', title: 'Svarbar information', desc: 'Priser, öppettider, adress — allt AI behöver för ett fullständigt svar.' },
            { n: '04', title: 'FAQ med kundfrågor', desc: 'Tydliga frågor och svar är det enklaste för AI att citera rakt av.' },
          ].map((r, i) => (
            <R key={i} delay={i}>
              <div className={`reason-card ${r.accent ? 'reason-accent' : ''}`}>
                <span className="reason-n">{r.n}</span>
                <h3 className="reason-title">{r.title}</h3>
                <p className="reason-desc">{r.desc}</p>
              </div>
            </R>
          ))}
        </div>

        <R>
          <div className="example-callout">
            <p>
              Det är inte de <em>bästa</em> mäklarna som nämns. Det är de som gör det{' '}
              <strong>enklast för AI att hitta och förstå&nbsp;dem</strong>.
            </p>
            <p style={{marginTop: 8, opacity: 0.7, fontSize: '0.9em'}}>Skillnaden är teknisk — och går att åtgärda.</p>
          </div>
        </R>
      </div>
    </section>
  )
}
