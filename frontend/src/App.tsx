import { useState, useRef, useEffect } from 'react'
import { UrlInput } from './components/UrlInput'
import { SeoSplit } from './components/SeoSplit'
import { Progress } from './components/Progress'
import { FreeReport } from './components/FreeReport'
import { FullScanButton } from './components/FullScanButton'
import { FullReport } from './components/FullReport'
import { AnalysisLogView } from './components/AnalysisLogView'
import { useAnalysis } from './hooks/useAnalysis'
import { mockFreeReport } from './mockData'

function DevToggle({
  view,
  onChange,
}: {
  view: 'landing' | 'result'
  onChange: (v: 'landing' | 'result') => void
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-gray-900 text-white rounded-full px-4 py-2 shadow-lg border border-gray-700">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Dev:</span>
      <button
        onClick={() => onChange('landing')}
        className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
          view === 'landing' ? 'bg-accent text-white' : 'text-gray-300 hover:text-white'
        }`}
      >
        Start
      </button>
      <button
        onClick={() => onChange('result')}
        className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
          view === 'result' ? 'bg-accent text-white' : 'text-gray-300 hover:text-white'
        }`}
      >
        Resultat
      </button>
    </div>
  )
}

export default function App() {
  const [devView, setDevView] = useState<'landing' | 'result'>('landing')
  const [url, setUrl] = useState('')
  const [inputKey, setInputKey] = useState(0)
  const {
    state,
    freeReport,
    premiumReport,
    analysisLog,
    error,
    currentStep,
    progressPct,
    stepIndex,
    analyze,
    runPremium,
    reset,
  } = useAnalysis()

  const isScanning = state === 'scanning' || state === 'premium-loading'
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (freeReport && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [freeReport])

  function handleSubmit(inputUrl: string) {
    setUrl(inputUrl)
    analyze(inputUrl)
  }

  function handleReset() {
    setInputKey(k => k + 1)
    reset()
  }

  // Dev mode: show mock result view
  if (devView === 'result') {
    return (
      <>
        <DevToggle view={devView} onChange={setDevView} />
        <div className="min-h-screen bg-base py-8 px-4">
          <div className="max-w-5xl mx-auto bg-frame shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-border">
            {/* Mock report header */}
            <div className="px-6 md:px-12 pt-8 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setDevView('landing')}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  ← Tillbaka
                </button>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-2 py-1 rounded">
                  MOCKUP — tandlakare-johansson.se
                </span>
              </div>
            </div>
            {/* Mock report */}
            <div className="px-6 md:px-12 pb-12">
              <FreeReport data={mockFreeReport} url="https://tandlakare-johansson.se" />
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <DevToggle view={devView} onChange={setDevView} />
      <div className="min-h-screen bg-base py-8 px-4">
        {/* Main frame */}
        <div className="max-w-5xl mx-auto bg-frame shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-border">
          {/* Hero */}
          <div className="flex flex-col items-center px-6 md:px-12 pt-16 pb-10">
            <div className="text-center mb-10 max-w-2xl">
              <div className="inline-block bg-accent/10 text-accent text-sm font-semibold tracking-wide uppercase
                              px-4 py-1.5 rounded-full mb-6 border border-accent/20">
                GEO & AEO-optimering
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight text-gray-900">
                Syns du för{' '}
                <span className="text-accent">AI-sökmotorer?</span>
              </h1>
              <p className="text-muted text-xl leading-relaxed max-w-xl mx-auto">
                Skriv in din URL — vi analyserar din sida och berättar exakt vad som behöver fixas
                för att ChatGPT, Perplexity och Google AI ska hitta och citera dig.
              </p>
            </div>

            {/* URL Input */}
            <div className="w-full max-w-xl">
              <UrlInput key={inputKey} onSubmit={handleSubmit} disabled={isScanning} />
            </div>
          </div>

          {/* Progress / Results */}
          {(state === 'scanning' || state === 'premium-loading') && (
            <div className="px-6 md:px-12 pb-12">
              <Progress currentStep={currentStep} progressPct={progressPct} stepIndex={stepIndex} />
            </div>
          )}

          {error && (
            <div className="px-6 md:px-12 pb-8">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            </div>
          )}

          {/* Free Report */}
          {freeReport && (
            <div ref={reportRef} className="px-6 md:px-12 pb-12">
              <FreeReport data={freeReport} url={url} />

              {/* Analysis Log */}
              {analysisLog && analysisLog.length > 0 && (
                <AnalysisLogView events={analysisLog} />
              )}

              {/* Full Scan Button — alltid synlig så användaren kan försöka igen vid fel */}
              {(state === 'done' || state === 'premium-loading' || state === 'premium-done' || state === 'error') && (
                <FullScanButton
                  onClick={() => runPremium(url)}
                  loading={state === 'premium-loading'}
                  error={error}
                />
              )}
            </div>
          )}

          {/* Premium Report */}
          {premiumReport && state === 'premium-done' && (
            <div className="px-6 md:px-12 pb-12">
              <FullReport data={premiumReport} />
            </div>
          )}

          {/* Reset button when done */}
          {(state === 'done' || state === 'premium-done') && (
            <div className="px-6 md:px-12 pb-8 text-center">
              <button
                onClick={handleReset}
                className="text-muted hover:text-gray-900 text-sm transition-colors"
              >
                ← Skanna en ny sida
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-border mx-6 md:mx-12" />

          {/* SEO illustration */}
          <div className="flex flex-col items-center px-6 md:px-12 py-16">
            <div className="w-full max-w-xl">
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
                Sökmotorernas spelregler har förändrats
              </h2>
              <p className="text-muted text-center mb-8">
                Förr räckte det att synas. Nu måste AI:n välja dig.
              </p>
              <SeoSplit />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pb-4">
          <p className="text-xs text-muted/60">
            AI Search Scanner — byggd för svenska företag
          </p>
        </div>
      </div>
    </>
  )
}
