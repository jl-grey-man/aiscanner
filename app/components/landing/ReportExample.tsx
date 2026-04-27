'use client'

import { R } from './utils'

export function ReportExample() {
  return (
    <section className="v3-report">
      <div className="v3-report-inner">
        <div className="v3-report-text">
          <R><div className="v3-section-tag">Exempel</div></R>
          <R><h2 className="v3-h2">Så här ser rapporten ut</h2></R>
          <R delay={1}><p className="v3-body">Vi analyserade bjurfors.se — en av Sveriges största mäklarkedjor.</p></R>
        </div>
        <R>
          <div className="v3-report-card">
            <div className="v3-rpt-head">
              <div>
                <span className="v3-rpt-mono">analyze.pipod.net</span>
                <h3 className="v3-rpt-name">Bjurfors</h3>
                <span className="v3-rpt-meta">bjurfors.se · Fastighetsmäklare</span>
              </div>
              <div className="v3-rpt-score">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="var(--c3-border)" strokeWidth="5"/>
                  <circle cx="32" cy="32" r="27" fill="none" stroke="var(--c3-pop)" strokeWidth="5"
                    strokeLinecap="round" strokeDasharray="169.6" strokeDashoffset="76"
                    transform="rotate(-90 32 32)"/>
                </svg>
                <span className="v3-rpt-score-n">55</span>
              </div>
            </div>

            <div className="v3-rpt-section">
              <h4 className="v3-rpt-label">Viktigaste fynden</h4>
              {[
                { text: 'Inget schema markup — AI vet inte vad Bjurfors gör.', bad: true },
                { text: 'NAP-poäng 2/10 — telefonnumret matchar inte Google.', bad: true },
                { text: 'Ingen llms.txt — AI kan inte läsa sajten ordentligt.', warn: true },
              ].map((f, i) => (
                <div key={i} className="v3-rpt-finding">
                  <span className={`v3-rpt-dot ${f.bad ? 'bad' : 'warn'}`}>!</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>

            <div className="v3-rpt-section">
              <h4 className="v3-rpt-label">Per kategori</h4>
              <div className="v3-rpt-bars">
                {[
                  {name:'Teknik',s:'4/6',p:67,g:true},{name:'Lokal',s:'2/6',p:33},
                  {name:'AI-beredskap',s:'1/5',p:20},{name:'Innehåll',s:'4/6',p:67,g:true},
                ].map((c, i) => (
                  <div key={i} className="v3-rpt-bar">
                    <div className="v3-rpt-bar-head"><span>{c.name}</span><span className="v3-rpt-bar-score">{c.s}</span></div>
                    <div className="v3-rpt-bar-bg"><div className={`v3-rpt-bar-fill ${c.g?'good':'bad'}`} style={{width:`${c.p}%`}}/></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="v3-rpt-section" style={{borderBottom:'none'}}>
              <h4 className="v3-rpt-label">Kontroller (utdrag)</h4>
              {[
                {ok:true,t:'HTTPS/SSL aktiv'},{ok:true,t:'Sitemap.xml hittad'},
                {ok:false,t:'Schema markup saknas',e:'kritiskt'},
                {ok:false,t:'Telefon matchar inte Google',e:'kritiskt'},
                {ok:'w',t:'Metabeskrivning generisk',e:'förbättra'},
                {ok:true,t:'Innehåll på svenska'},
              ].map((c, i) => (
                <div key={i} className="v3-rpt-check">
                  <span className={`v3-rpt-ci ${c.ok===true?'ok':c.ok==='w'?'meh':'nok'}`}>
                    {c.ok===true?'✓':c.ok==='w'?'!':'✗'}
                  </span>
                  <span>{c.t}</span>
                  {c.e && <span className={`v3-rpt-extra ${c.ok===false?'nok':'meh'}`}>{c.e}</span>}
                </div>
              ))}
            </div>

            <div className="v3-rpt-footer">
              Utdrag. <a href="https://analyze.pipod.net/bjurfors">Se hela rapporten →</a>
            </div>
          </div>
        </R>
      </div>
    </section>
  )
}
