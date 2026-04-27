'use client'

import { R } from './utils'

export function WhatAILooksAt() {
  const items = [
    { title: 'En kodsnutt som berättar vad du gör', text: '"Schema markup" — en osynlig bit kod som säger: det här är en rörmokare i Malmö, öppet 7–17, ring 040-XXX. Utan det tvingas AI gissa.' },
    { title: 'Samma uppgifter överallt', text: 'Namn, adress, telefon måste stämma på hemsidan, Google, Eniro — överallt. "Kungsgatan 12" vs "Kungsgatan 12A" = tappad trovärdighet.' },
    { title: 'Google Företagsprofil', text: 'AI:ns favoritkälla. Betyg, recensioner, öppettider, bilder — allt används. En ouppdaterad profil är som ingen hemsida alls.' },
    { title: 'En sidbeskrivning som säger något', text: 'Din elevator pitch på 155 tecken. Inte "Välkommen till vår hemsida" utan "Akut rörmokare i Göteborg. Jour dygnet runt, fasta priser."', hasExample: true },
    { title: 'Innehåll som svarar på frågor', text: 'En FAQ med "Vad kostar relining?" eller "Hur lång tid tar en värdering?" — guld värd för AI.' },
    { title: 'Att dörren är öppen', text: 'Många sajter blockerar AI utan att ägaren vet. robots.txt styr vilka som får läsa din sajt. Fel inställning = ChatGPT stängs ute helt.' },
  ]

  return (
    <section className="ai-looks-section">
      <div className="ai-looks-header">
        <R>
          <h2 className="section-h2">Vad AI faktiskt<br/>tittar på</h2>
        </R>
        <R delay={1}>
          <p className="section-body" style={{ maxWidth: 460 }}>
            Sex signaler som avgör om ditt företag nämns eller&nbsp;ignoreras.
          </p>
        </R>
      </div>

      <div className="ai-looks-list">
        {items.map((item, i) => (
          <R key={i}>
            <div className="ai-looks-item">
              <span className="ai-looks-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="ai-looks-content">
                <h3 className="ai-looks-title">{item.title}</h3>
                <p className="ai-looks-text">{item.text}</p>
                {item.hasExample && (
                  <div className="ai-looks-examples">
                    <div className="ai-looks-bad">
                      <span className="ai-looks-ex-label">✗</span>
                      &quot;Välkommen till vår hemsida!&quot;
                    </div>
                    <div className="ai-looks-good">
                      <span className="ai-looks-ex-label">✓</span>
                      &quot;Akut rörmokare i Göteborg. Jour dygnet runt.&quot;
                    </div>
                  </div>
                )}
              </div>
            </div>
          </R>
        ))}
      </div>

      <R>
        <div style={{ textAlign: 'center', padding: '48px 24px 0' }}>
          <p style={{ fontSize: 16, color: 'var(--c-muted)', marginBottom: 12 }}>
            Hur många av de sex har din sajt?
          </p>
          <a href="#analysera" className="inline-cta">Ta reda på det — gratis ↓</a>
        </div>
      </R>
    </section>
  )
}
