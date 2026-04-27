'use client'

import { R } from './utils'

export function WhatAILooksAt() {
  const items = [
    { title: 'Schema markup', text: 'Osynlig kod som säger: "rörmokare i Malmö, öppet 7–17, ring 040-XXX." Utan det gissar AI.' },
    { title: 'Samma uppgifter överallt', text: 'Namn, adress, telefon måste matcha på sajt, Google, Eniro. AI korskontrollerar.' },
    { title: 'Google Företagsprofil', text: 'AI:ns favoritkälla. Betyg, recensioner, bilder — allt. Ouppdaterad profil = osynlig.' },
    { title: 'Sidbeskrivning som säger något', text: 'Elevator pitch på 155 tecken. Inte "Välkommen!" utan "Akut rörmokare, jour dygnet runt."', hasEx: true },
    { title: 'Innehåll som svarar', text: 'FAQ: "Vad kostar relining?" "Hur lång tid tar en värdering?" Guld för AI.' },
    { title: 'Dörren måste vara öppen', text: 'robots.txt styr vem som får läsa. Fel inställning = ChatGPT stängs ute.' },
  ]

  return (
    <section className="v3-ai-looks">
      <div className="v3-ai-looks-inner">
        <R><div className="v3-section-tag">Checklista</div></R>
        <R><h2 className="v3-h2">Vad AI faktiskt tittar på</h2></R>
        <R delay={1}><p className="v3-body" style={{marginBottom: 48}}>Sex signaler. Avgör om du nämns eller ignoreras.</p></R>

        <div className="v3-checklist">
          {items.map((item, i) => (
            <R key={i}>
              <div className="v3-check-item">
                <div className="v3-check-num">{String(i+1).padStart(2,'0')}</div>
                <div className="v3-check-body">
                  <h3 className="v3-check-title">{item.title}</h3>
                  <p className="v3-check-text">{item.text}</p>
                  {item.hasEx && (
                    <div className="v3-check-examples">
                      <div className="v3-ex-bad"><span>✗</span> &quot;Välkommen till vår hemsida!&quot;</div>
                      <div className="v3-ex-good"><span>✓</span> &quot;Akut rörmokare i Göteborg. Jour dygnet runt.&quot;</div>
                    </div>
                  )}
                </div>
              </div>
            </R>
          ))}
        </div>

        <R>
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <p className="v3-body" style={{ marginBottom: 12 }}>Hur många har din sajt?</p>
            <a href="#analysera" className="v3-inline-link">Ta reda på det ↓</a>
          </div>
        </R>
      </div>
    </section>
  )
}
