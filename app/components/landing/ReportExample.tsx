'use client'

import { R } from './utils'
import { APP_DOMAIN, APP_URL } from '@/app/lib/config'

export function ReportExample() {
  return (
    <section className="report-section">
      <div className="report-text-col">
        <R>
          <h2 className="section-h2">Så här ser en rapport&nbsp;ut</h2>
        </R>
        <R delay={1}>
          <p className="section-body" style={{ maxWidth: 420 }}>
            Vi analyserade bjurfors.se — en av Sveriges största mäklarkedjor.
          </p>
        </R>
      </div>

      <R>
        <div className="report-card-wrap">
          <div className="report-card">
            {/* Header */}
            <div className="report-header">
              <div>
                <span className="report-mono">{APP_DOMAIN}</span>
                <h3 className="report-name">Bjurfors</h3>
                <span className="report-meta">bjurfors.se · Fastighetsmäklare</span>
              </div>
              <div className="report-score-area">
                <div className="report-score-ring">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="27" fill="none" stroke="var(--c-border)" strokeWidth="5"/>
                    <circle cx="32" cy="32" r="27" fill="none" stroke="var(--c-accent)" strokeWidth="5"
                      strokeLinecap="round" strokeDasharray="169.6" strokeDashoffset="76"
                      transform="rotate(-90 32 32)" style={{transition:'stroke-dashoffset 1.5s ease'}}/>
                  </svg>
                  <span className="report-score-num">55</span>
                </div>
              </div>
            </div>

            {/* Key findings */}
            <div className="report-findings">
              <h4 className="report-section-title">Viktigaste fynden</h4>
              {[
                { text: 'Inget schema markup — AI vet inte att Bjurfors är en mäklare.', critical: true },
                { text: 'NAP-poäng 2/10 — telefonnumret matchar inte Google-profilen.', critical: true },
                { text: 'Ingen llms.txt — filen som berättar för AI hur den ska läsa sajten.', warn: true },
              ].map((f, i) => (
                <div key={i} className="report-finding">
                  <span className={`report-finding-dot ${f.critical ? 'critical' : 'warn'}`}>!</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>

            {/* Category bars */}
            <div className="report-cats">
              <h4 className="report-section-title">Per kategori</h4>
              <div className="report-cat-grid">
                {[
                  { name: 'Teknik', score: '4/6', pct: 67, good: true },
                  { name: 'Lokal', score: '2/6', pct: 33 },
                  { name: 'AI-beredskap', score: '1/5', pct: 20 },
                  { name: 'Innehåll', score: '4/6', pct: 67, good: true },
                ].map((c, i) => (
                  <div key={i}>
                    <div className="report-cat-head">
                      <span>{c.name}</span><span className="report-cat-score">{c.score}</span>
                    </div>
                    <div className="report-bar-bg">
                      <div className={`report-bar-fill ${c.good ? 'good' : 'bad'}`} style={{ width: `${c.pct}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail checks */}
            <div className="report-checks">
              <h4 className="report-section-title">Kontroller (utdrag)</h4>
              {[
                { ok: true, text: 'HTTPS/SSL aktiv' },
                { ok: true, text: 'Sitemap.xml hittad (423 sidor)' },
                { ok: false, text: 'Schema markup saknas', extra: 'kritiskt' },
                { ok: false, text: 'Telefonnummer matchar inte Google', extra: 'kritiskt' },
                { ok: 'warn', text: 'Metabeskrivning för generisk', extra: 'förbättra' },
                { ok: true, text: 'Innehåll på svenska' },
              ].map((c, i) => (
                <div key={i} className="report-check-row">
                  <span className={`report-check-icon ${c.ok === true ? 'ok' : c.ok === 'warn' ? 'meh' : 'nok'}`}>
                    {c.ok === true ? '✓' : c.ok === 'warn' ? '!' : '✗'}
                  </span>
                  <span>{c.text}</span>
                  {c.extra && <span className={`report-check-extra ${c.ok === false ? 'nok' : 'meh'}`}>{c.extra}</span>}
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 28px 20px', borderTop: '1px solid var(--c-border)', textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>Detta är ett utdrag. </span>
              <a href={`${APP_URL}/bjurfors`} style={{ fontSize: 13, color: 'var(--c-accent)', fontWeight: 600, textDecoration: 'none' }}>Se hela Bjurfors-rapporten →</a>
            </div>
          </div>
        </div>
      </R>
    </section>
  )
}
