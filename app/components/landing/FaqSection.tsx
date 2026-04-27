'use client'

import { useState } from 'react'
import { R } from './utils'

interface FaqItemProps {
  q: string
  a: string
  open?: boolean
}

function FaqItem({ q, a, open: init = false }: FaqItemProps) {
  const [open, setOpen] = useState(init)
  return (
    <div className="v3-faq-item">
      <button className="v3-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className={`v3-faq-icon ${open?'v3-faq-open':''}`}>+</span>
      </button>
      <div className={`v3-faq-a-wrap ${open?'v3-faq-show':''}`}>
        <p className="v3-faq-a">{a}</p>
      </div>
    </div>
  )
}

export function FaqSection() {
  return (
    <section className="v3-faq">
      <div className="v3-faq-inner">
        <R><h2 className="v3-h2" style={{marginBottom:48}}>Vanliga frågor</h2></R>
        <FaqItem q="Behöver jag vara teknisk?" a="Nej. Allt förklaras på ren svenska. Kodsnuttar i premiumrapporten kopieras rakt in." />
        <FaqItem q="Vad gör jag med rapporten?" a="Skicka den till din webbyrå, IT-person eller kompis som 'kan datorer'. Steg-för-steg och färdig kod ingår." />
        <FaqItem q="Varför kostar premium pengar?" a="Gratisscanningen = diagnos. Premium = lösning: konkurrentanalys, kodsnuttar, recensionsanalys, handlingsplan." />
        <FaqItem q="Vi har redan SEO-byrå." a='SEO ≠ AI-synlighet. De flesta byråer optimerar för Googles länklista, inte ChatGPT:s svar. Kör scanningen, fråga din byrå: "fixar ni det här?"' open />
        <FaqItem q="Samlar ni data?" a="Nej. Ingen e-post, ingen registrering. Rapporten sparas 24h, sedan raderas den." />
        <FaqItem q="Hur lång tid att fixa?" a="30 min till 2 timmar. Schema, meta, robots.txt under en timme. Bra innehåll tar längre men ger mest." />
      </div>
    </section>
  )
}
