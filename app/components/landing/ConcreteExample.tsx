'use client'

import { R, Blob } from './utils'

export function ConcreteExample() {
  return (
    <section className="v3-example">
      <Blob color="var(--c3-pop)" size="300px" top="-100px" left="10%" blur={120} opacity={0.15} />
      <div className="v3-example-inner">
        <R><div className="v3-section-tag">Insikt</div></R>
        <R>
          <h2 className="v3-h2">Vi frågade ChatGPT.<br/>Svaret säger allt.</h2>
        </R>

        <R>
          <div className="v3-chatbox">
            <div className="v3-chatbox-head">
              <div className="v3-ai-dot" /><span>ChatGPT-svar</span>
            </div>
            <p className="v3-chatbox-q">&quot;Vilken fastighetsmäklare i Stockholm rekommenderar du?&quot;</p>
            <p className="v3-chatbox-a">
              Ett populärt val är <strong>Fastighetsbyrån Östermalm</strong>.
              340+ recensioner (4,8 snitt), gratis digital hemvärdering, tydliga priser.
              Kontoret på Storgatan 12, öppet vardagar 9–18.
            </p>
            <p className="v3-chatbox-a">
              Alternativ: <strong>Notar Vasastan</strong> — specialister på bostadsrätter
              i innerstaden med utförlig FAQ om köpprocessen.
            </p>
            <div className="v3-chatbox-foot">fastighetsbyran.com · notar.se · Google Maps</div>
          </div>
        </R>

        <R><h3 className="v3-h3">Varför just de?</h3></R>

        <div className="v3-reasons">
          {[
            { n: '01', title: 'Schema markup', desc: 'Deras sajt berättar i kod vad de gör, var de finns, hur man når dem.' },
            { n: '02', title: '340+ recensioner', desc: 'AI väger antal, betyg OCH läser recensionstexten.' },
            { n: '03', title: 'Svarbar info', desc: 'Priser, öppettider, adress — allt AI behöver för ett komplett svar.' },
            { n: '04', title: 'FAQ-sida', desc: 'Frågor och svar = enklast för AI att citera rakt av.' },
          ].map((r, i) => (
            <R key={i} delay={i}>
              <div className="v3-reason">
                <span className="v3-reason-n">{r.n}</span>
                <div>
                  <h4 className="v3-reason-t">{r.title}</h4>
                  <p className="v3-reason-d">{r.desc}</p>
                </div>
              </div>
            </R>
          ))}
        </div>

        <R>
          <div className="v3-callout-card">
            <p>Det är inte de <em>bästa</em> som nämns. Det är de som gör det <strong>enklast för AI</strong>.</p>
            <p className="v3-callout-sub">Skillnaden är teknisk — och går att åtgärda.</p>
          </div>
        </R>
      </div>
    </section>
  )
}
