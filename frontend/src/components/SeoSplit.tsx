import { useEffect, useRef, useState } from 'react'

const SEARCH_QUERY = 'bästa bokföringsbyrå Stockholm'

const GOOGLE_RESULTS = [
  { title: 'Revisionen Stockholm AB – Bokföring & Redovisning', url: 'revisionen.se', desc: 'Vi erbjuder professionell bokföring för företag i Stockholm…' },
  { title: 'Skattepunkten – Redovisningsbyrå i city', url: 'skattepunkten.se', desc: 'Auktoriserad redovisningskonsult. Boka gratis rådgivning…' },
  { title: 'Nordén Ekonomi – Din bokföringsbyrå', url: 'nordenekonomni.se', desc: 'Familjeföretag sedan 1998. Heltäckande ekonomitjänster…', highlight: true },
  { title: 'BokföringsHuset Stockholm', url: 'bokforingshuset.se', desc: 'Fast pris per månad. Alltid en dedikerad konsult…' },
  { title: 'EkonomiPartner AB', url: 'ekonomipartner.se', desc: 'Redovisning, löner och deklaration för SME…' },
  { title: 'Stadshagens Redovisning', url: 'stadshagen.se', desc: 'Lokal byrå i Kungsholmen. Boka tid online…' },
  { title: 'Sifferkraft – Bokföring online', url: 'sifferkraft.se', desc: 'Digital redovisningsbyrå. Koppla ditt Fortnox…' },
  { title: 'ClearBooks Stockholm', url: 'clearbooks.se', desc: 'Engelsktalande revisorer för internationella bolag…' },
]

const STRUCK_SITES = ['revisionen.se', 'skattepunkten.se', 'bokforingshuset.se', 'ekonomipartner.se', 'stadshagen.se', 'sifferkraft.se']
const AI_PRE  = 'Det beror på dina behov, men '
const AI_POST = ' lyfts ofta fram — personlig service och fasta priser.'

const T_SEARCH_START  = 500
const SEARCH_CHAR_MS  = 48
const SEARCH_DONE     = T_SEARCH_START + SEARCH_QUERY.length * SEARCH_CHAR_MS
const T_RESULTS_START = SEARCH_DONE + 300
const RESULT_STAGGER  = 200
const T_AI_QUERY      = T_RESULTS_START + 400
const T_AI_TYPE_START = T_AI_QUERY + 600
const AI_CHAR_MS      = 24
const T_CITE          = T_AI_TYPE_START + AI_PRE.length * AI_CHAR_MS
const T_POST_TYPE     = T_CITE + 300
const T_SOURCES       = T_POST_TYPE + AI_POST.length * AI_CHAR_MS + 400

// Phone animation timing (seconds, CSS)
const CRASH_DELAY = 0.15
const CRASH_DUR   = 0.88
const HAPTIC_DELAY = CRASH_DELAY + CRASH_DUR - 0.05
const HAPTIC_DUR  = 0.48

// Phone size — large & prominent
const PHONE_W = 230
const PHONE_H = 472

export function SeoSplit() {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  const [searchText, setSearchText]         = useState('')
  const [searchDone, setSearchDone]         = useState(false)
  const [visibleResults, setVisibleResults] = useState<boolean[]>(GOOGLE_RESULTS.map(() => false))
  const [showQuery, setShowQuery]           = useState(false)
  const [aiPre, setAiPre]                   = useState('')
  const [showCite, setShowCite]             = useState(false)
  const [citePulse, setCitePulse]           = useState(false)
  const [aiPost, setAiPost]                 = useState('')
  const [showSources, setShowSources]       = useState(false)
  const [strikes, setStrikes]               = useState<boolean[]>(STRUCK_SITES.map(() => false))

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      // Wait until the element is well into the viewport
      { threshold: 0.45, rootMargin: '-40px 0px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const intervals: ReturnType<typeof setInterval>[] = []
    const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)) }

    at(T_SEARCH_START, () => {
      let i = 0
      const iv = setInterval(() => {
        i++
        setSearchText(SEARCH_QUERY.slice(0, i))
        if (i >= SEARCH_QUERY.length) {
          clearInterval(iv)
          at(SEARCH_DONE + 200, () => setSearchDone(true))
        }
      }, SEARCH_CHAR_MS)
      intervals.push(iv)
    })

    GOOGLE_RESULTS.forEach((_, idx) => {
      at(T_RESULTS_START + idx * RESULT_STAGGER, () => {
        setVisibleResults(prev => { const n = [...prev]; n[idx] = true; return n })
      })
    })

    at(T_AI_QUERY, () => setShowQuery(true))
    at(T_AI_TYPE_START, () => {
      let i = 0
      const iv = setInterval(() => {
        i++
        setAiPre(AI_PRE.slice(0, i))
        if (i >= AI_PRE.length) clearInterval(iv)
      }, AI_CHAR_MS)
      intervals.push(iv)
    })
    at(T_CITE, () => { setShowCite(true); setTimeout(() => setCitePulse(true), 50) })
    at(T_POST_TYPE, () => {
      let i = 0
      const iv = setInterval(() => {
        i++
        setAiPost(AI_POST.slice(0, i))
        if (i >= AI_POST.length) clearInterval(iv)
      }, AI_CHAR_MS)
      intervals.push(iv)
    })
    at(T_SOURCES, () => {
      setShowSources(true)
      STRUCK_SITES.forEach((_, i) => {
        timers.push(setTimeout(() => {
          setStrikes(prev => { const n = [...prev]; n[i] = true; return n })
        }, i * 180))
      })
    })

    return () => { timers.forEach(clearTimeout); intervals.forEach(clearInterval) }
  }, [started])

  const isTyping = aiPre.length < AI_PRE.length || (showCite && aiPost.length < AI_POST.length && !showSources)

  return (
    <div ref={ref} className="w-full max-w-2xl mx-auto">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 items-stretch">

          {/* ── LEFT: Google ── */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Förr — Google</div>

            <div className="flex items-center gap-2 border border-border rounded-full px-3 py-2 mb-4 bg-base min-h-[34px]">
              <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <span className="text-xs text-gray-700 truncate flex-1">
                {searchText}
                {searchText.length > 0 && !searchDone && <span className="anim-cursor" />}
              </span>
            </div>

            <div className="space-y-3">
              {GOOGLE_RESULTS.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-2 py-1.5 transition-all duration-300 ${
                    visibleResults[i] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
                  } ${r.highlight ? 'bg-accent/5 ring-1 ring-accent/20' : ''}`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-muted text-xs mt-0.5 tabular-nums w-3 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-medium leading-snug truncate ${r.highlight ? 'text-accent' : 'text-blue-600'}`}>
                        {r.title}
                        {r.highlight && (
                          <span className="ml-1.5 text-[10px] bg-accent text-white rounded px-1 py-0.5 font-semibold">Dig</span>
                        )}
                      </div>
                      <div className="text-[10px] text-green-700 truncate">{r.url}</div>
                      <div className="text-[10px] text-muted leading-snug line-clamp-1">{r.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Phone mockup ── */}
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-6">Nu — AI-sökning</div>

            {/* Crash outer — zooms in from tiny */}
            <div style={{
              opacity: started ? undefined : 0,
              animation: started
                ? `phoneCrash ${CRASH_DUR}s cubic-bezier(0.22, 1.2, 0.36, 1) ${CRASH_DELAY}s both`
                : 'none',
            }}>
              {/* Haptic inner — shakes after landing */}
              <div style={{
                animation: started
                  ? `hapticShake ${HAPTIC_DUR}s ease-in-out ${HAPTIC_DELAY}s both`
                  : 'none',
              }}>

                {/* ── Phone frame ── */}
                <div style={{ position: 'relative', width: PHONE_W, height: PHONE_H }}>

                  {/* Body gradient + shadow */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 46,
                    background: 'linear-gradient(160deg, #2e2e33 0%, #18181b 55%, #101012 100%)',
                    boxShadow: [
                      '0 40px 100px -16px rgba(0,0,0,0.55)',
                      '0 16px 40px -8px rgba(0,0,0,0.35)',
                      '0 0 0 1px rgba(255,255,255,0.08)',
                      'inset 0 1px 0 rgba(255,255,255,0.13)',
                      'inset 0 -1px 0 rgba(0,0,0,0.5)',
                    ].join(', '),
                  }} />

                  {/* Volume up */}
                  <div style={{ position: 'absolute', left: -4, top: 90, width: 4, height: 30, background: '#2a2a2e', borderRadius: '3px 0 0 3px' }} />
                  {/* Volume down */}
                  <div style={{ position: 'absolute', left: -4, top: 130, width: 4, height: 30, background: '#2a2a2e', borderRadius: '3px 0 0 3px' }} />
                  {/* Power */}
                  <div style={{ position: 'absolute', right: -4, top: 112, width: 4, height: 46, background: '#2a2a2e', borderRadius: '0 3px 3px 0' }} />

                  {/* Screen */}
                  <div style={{
                    position: 'absolute',
                    inset: 7,
                    borderRadius: 39,
                    background: '#08080d',
                    overflow: 'hidden',
                  }}>

                    {/* Subtle screen glare */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: '45%', height: '28%',
                      background: 'linear-gradient(140deg, rgba(255,255,255,0.045) 0%, transparent 100%)',
                      borderRadius: '39px 0 0 0',
                      pointerEvents: 'none', zIndex: 20,
                    }} />

                    {/* Status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 4px' }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>9:41</span>

                      {/* Dynamic island */}
                      <div style={{
                        width: 74, height: 18,
                        background: '#000',
                        borderRadius: 999,
                        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.9)',
                      }} />

                      {/* Signal + battery */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 10 }}>
                          {[4, 6, 8, 10].map((h, i) => (
                            <div key={i} style={{ width: 3, height: h, borderRadius: 1.5, background: i < 3 ? '#9ca3af' : '#374151' }} />
                          ))}
                        </div>
                        {/* Battery */}
                        <div style={{ position: 'relative', width: 20, height: 10 }}>
                          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid #6b7280', borderRadius: 3 }} />
                          <div style={{ position: 'absolute', top: 2.5, left: 2.5, bottom: 2.5, right: '28%', background: '#9ca3af', borderRadius: 1 }} />
                          <div style={{ position: 'absolute', top: '50%', right: -3.5, transform: 'translateY(-50%)', width: 3, height: 6, background: '#6b7280', borderRadius: '0 1.5px 1.5px 0' }} />
                        </div>
                      </div>
                    </div>

                    {/* App header */}
                    <div style={{ textAlign: 'center', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: '0.05em' }}>ChatGPT</span>
                    </div>

                    {/* Chat */}
                    <div style={{ padding: '10px 10px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* User bubble */}
                      <div style={{
                        display: 'flex', justifyContent: 'flex-end',
                        opacity: showQuery ? 1 : 0,
                        transform: showQuery ? 'translateY(0)' : 'translateY(6px)',
                        transition: 'opacity 0.4s ease, transform 0.4s ease',
                      }}>
                        <div style={{
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          borderRadius: '16px 16px 4px 16px',
                          padding: '8px 12px',
                          fontSize: 11,
                          color: '#fff',
                          maxWidth: '84%',
                          lineHeight: 1.45,
                          boxShadow: '0 3px 12px rgba(37,99,235,0.45)',
                        }}>
                          Vilken är bästa bokföringsbyrån i Stockholm?
                        </div>
                      </div>

                      {/* AI row */}
                      <div style={{
                        display: 'flex', gap: 7, alignItems: 'flex-start',
                        opacity: showQuery ? 1 : 0,
                        transition: 'opacity 0.5s ease 0.25s',
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 2,
                          fontSize: 7, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.02em',
                        }}>AI</div>

                        <div style={{
                          background: 'rgba(255,255,255,0.055)',
                          borderRadius: '4px 16px 16px 16px',
                          padding: '8px 10px',
                          fontSize: 11,
                          color: '#d1d5db',
                          lineHeight: 1.55,
                          flex: 1,
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}>
                          <p style={{ margin: 0 }}>
                            {aiPre}
                            {showCite && (
                              <span className={citePulse ? 'anim-cite-pulse' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                <span style={{
                                  background: 'var(--color-accent,#4f46e5)',
                                  color: '#fff', fontSize: 9, fontWeight: 700,
                                  padding: '1px 5px', borderRadius: 4,
                                }}>Nordén</span>
                                <span style={{ color: 'var(--color-accent,#4f46e5)', fontSize: 9 }}>¹</span>
                              </span>
                            )}
                            {aiPost}
                            {isTyping && <span className="anim-cursor" />}
                          </p>

                          {showSources && (
                            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                              <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>Källor</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 5 }}>
                                <span style={{ fontSize: 9, color: '#4f46e5' }}>¹</span>
                                <span style={{ fontSize: 10, color: '#6366f1' }}>nordenekonomni.se</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
                                {STRUCK_SITES.map((site, i) => (
                                  <span key={site} style={{ position: 'relative', fontSize: 9, color: '#4b5563', display: 'inline-block' }}>
                                    {site.replace('.se', '')}
                                    {strikes[i] && (
                                      <span style={{
                                        position: 'absolute', left: 0, top: '50%',
                                        height: 1, background: '#4b5563',
                                        animation: 'strikethrough 0.35s ease forwards',
                                      }} />
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Home indicator */}
                    <div style={{
                      position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                      width: 72, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 999,
                    }} />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div className="px-6 py-4 bg-gray-50 border-t border-border text-center">
          <p className="text-sm text-gray-600">
            Förr tävlade alla om plats 1–10.{' '}
            <span className="font-semibold text-gray-900">Nu finns det ett svar</span>{' '}
            — antingen är det du, eller är det inte.
          </p>
        </div>
      </div>
    </div>
  )
}
