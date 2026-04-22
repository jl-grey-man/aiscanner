import { useState } from 'react'
import { UrlInput } from './components/UrlInput'
import { SeoSplit } from './components/SeoSplit'
import { Report } from './pages/Report'
import { useAnalysis } from './hooks/useAnalysis'

export default function App() {
  const [url, setUrl] = useState('')
  const [inputKey, setInputKey] = useState(0)
  const { state, cards, summary, error, currentStep, currentStepDesc, progressPct, analyze, reset } = useAnalysis()

  function handleSubmit(inputUrl: string) {
    setUrl(inputUrl)
    analyze(inputUrl)
  }

  function handleReset() {
    setUrl('')
    setInputKey(k => k + 1)
    reset()
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero — alltid synlig */}
      <div className="flex flex-col items-center px-4 pt-20 pb-8">
        <div className="text-center mb-10 max-w-3xl">
          <div className="inline-block bg-accent/10 text-accent text-sm font-medium
                          px-4 py-1.5 rounded-full mb-6 border border-accent/20">
            GEO & AEO-optimering
          </div>
          <h1 className="text-5xl font-bold mb-5 leading-tight tracking-tight text-gray-900">
            Syns du för{' '}
            <span className="text-accent">AI-sökmotorer?</span>
          </h1>
          <p className="text-muted text-xl leading-relaxed">
            Skriv in din URL — vi analyserar din sida och berättar exakt vad som behöver fixas
            för att ChatGPT, Perplexity och Google AI ska hitta och citera dig.
          </p>
        </div>

        {/* URL Input — alltid synlig */}
        <div className="w-full max-w-2xl">
          <UrlInput key={inputKey} onSubmit={handleSubmit} disabled={state === 'scanning'} />
        </div>
      </div>

      {/* Analysis results — visas direkt under input, ovanför illustrationen */}
      {state !== 'idle' && (
        <div className="max-w-2xl mx-auto px-4 pb-12">
          <Report
            url={url}
            cards={cards}
            summary={summary}
            state={state}
            error={error}
            currentStep={currentStep}
            currentStepDesc={currentStepDesc}
            progressPct={progressPct}
            onReset={handleReset}
          />
        </div>
      )}

      {/* SEO vs AI illustration — alltid synlig, under analysresultaten */}
      <div className="flex flex-col items-center px-4 pb-20">
        <div className="w-full max-w-2xl">
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
  )
}
