'use client'

import { useState } from 'react'
import { R } from './utils'

interface FaqItemProps {
  q: string
  a: string
  open?: boolean
}

function FaqItem({ q, a, open: initOpen = false }: FaqItemProps) {
  const [open, setOpen] = useState(initOpen)
  return (
    <div className="faq-item">
      <button className="faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className={`faq-icon ${open ? 'faq-open' : ''}`}>+</span>
      </button>
      <div className={`faq-a-wrap ${open ? 'faq-show' : ''}`}>
        <p className="faq-a">{a}</p>
      </div>
    </div>
  )
}

export function FaqSection() {
  return (
    <section className="faq-section">
      <div className="faq-inner">
        <R>
          <h2 className="section-h2" style={{ marginBottom: 48 }}>Vanliga frågor</h2>
        </R>
        <FaqItem q="Behöver jag vara teknisk?" a="Nej. Gratisrapporten förklarar allt på ren svenska. Premiumrapporten innehåller kodsnuttar, men de är gjorda för att kopieras rakt in." />
        <FaqItem q="Vad gör jag med rapporten?" a="Du skickar den till den som sköter din hemsida — din webbyrå, IT-personen, eller kompisen som 'kan datorer'. Premiumrapporten har steg-för-steg och färdig kod." />
        <FaqItem q="Varför kostar premiumrapporten pengar?" a="Gratisscanningen ger diagnosen. Premiumrapporten ger lösningarna: konkurrentanalys, kodsnuttar, recensionsanalys och handlingsplan. Timmar av research i ett dokument." />
        <FaqItem q="Vi har redan en SEO-byrå. Behövs det här?" a='SEO och AI-synlighet överlappar men är inte samma sak. De flesta SEO-byråer optimerar för Googles länklista — inte ChatGPT:s direktsvar. Kör scanningen och fråga din byrå: "fixar ni det här?"' open />
        <FaqItem q="Samlar ni in e-post eller säljer data?" a="Nej. Ingen e-post, ingen registrering. Rapporten lagras i 24 timmar, sedan raderas den." />
        <FaqItem q="Hur lång tid tar det att fixa problemen?" a="De flesta åtgärder tar 30 min till 2 timmar. Schema markup, metabeskrivningar och robots.txt ofta under en timme. Bra innehåll tar längre men ger störst effekt." />
      </div>
    </section>
  )
}
