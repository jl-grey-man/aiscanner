import { useState } from 'react'
import { Landing } from './pages/Landing'
import { Report } from './pages/Report'
import { useAnalysis } from './hooks/useAnalysis'

export default function App() {
  const [url, setUrl] = useState('')
  const { state, cards, summary, error, analyze } = useAnalysis()

  function handleSubmit(inputUrl: string) {
    setUrl(inputUrl)
    analyze(inputUrl)
  }

  if (state === 'idle') {
    return <Landing onSubmit={handleSubmit} />
  }

  return (
    <Report
      url={url}
      cards={cards}
      summary={summary}
      state={state}
      error={error}
      onReset={() => window.location.reload()}
    />
  )
}
