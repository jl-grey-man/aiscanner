import { useState, useCallback } from 'react'
import type { ReportCard, Summary, AnalysisState } from '../types'

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [cards, setCards] = useState<ReportCard[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (url: string) => {
    setState('scanning')
    setCards([])
    setSummary(null)
    setError(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const eventLine = chunk.split('\n').find(l => l.startsWith('event:'))
          const dataLine = chunk.split('\n').find(l => l.startsWith('data:'))
          if (!eventLine || !dataLine) continue

          const event = eventLine.replace('event: ', '').trim()
          const data = JSON.parse(dataLine.replace('data: ', '').trim())

          if (event === 'card') {
            setCards(prev => [...prev, data as ReportCard])
          } else if (event === 'summary') {
            setSummary(data as Summary)
          } else if (event === 'done') {
            setState('done')
          } else if (event === 'error') {
            setError(data.message)
            setState('error')
          }
        }
      }
    } catch (e) {
      setError('Något gick fel. Försök igen.')
      setState('error')
    }
  }, [])

  return { state, cards, summary, error, analyze }
}
