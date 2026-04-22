import { useState, useCallback, useRef, useEffect } from 'react'
import type { ReportCard, Summary, AnalysisState } from '../types'

const CARD_DELAY_MS = 1400
const MIN_SCAN_TIME_MS = 22000

const STEP_DESCRIPTIONS: Record<string, string> = {
  'Kontrollerar HTTPS-säkerhet': 'Vi kontrollerar att din anslutning är krypterad och säker...',
  'Kontrollerar språkdeklaration': 'Vi verifierar att AI-sökmotorer förstår vilket språk din sida är på...',
  'Läser robots.txt och crawl-direktiv': 'Vi läser dina crawl-direktiv för att se om AI-bottar får besöka sidan...',
  'Söker efter llms.txt': 'Vi letar efter llms.txt — den nya standarden för AI-kommunikation...',
  'Analyserar metataggar och Open Graph': 'Vi granskar dina titlar och beskrivningar som AI använder för att förstå sidan...',
  'Granskar rubrikstruktur (H1–H3)': 'Vi analyserar hur väl strukturerad din innehållshierarki är...',
  'Letar efter strukturerad data (Schema.org)': 'Vi söker efter schema-markup som hjälper AI att förstå din verksamhet...',
  'Kontrollerar innehållets aktualitet': 'Vi undersöker när ditt innehåll senast uppdaterades...',
  'AI analyserar hur tydligt företagets identitet framgår': 'Vi använder AI för att bedöma hur tydligt ditt företags identitet kommuniceras...',
  'Söker efter FAQ-innehåll': 'Vi letar efter frågor och svar som AI kan citera direkt...',
  'Hämtar externa signaler — Trustpilot, Wikipedia, Google Maps': 'Vi samlar in data från externa källor om din verksamhet...',
  'AI analyserar kundrecensioner och teman': 'Vi låter AI analysera vad dina kunder tycker och vilka teman som återkommer...',
  'Sammanställer Trustpilot-analys': 'Vi sammanställer din Trustpilot-närvaro och recensionsdata...',
  'Kontrollerar Wikipedia-närvaro': 'Vi söker efter om din verksamhet finns representerad på Wikipedia...',
  'Analyserar social närvaro och externa profiler': 'Vi granskar dina länkade sociala profiler och externa referenser...',
  'Granskar lokal närvaro och Google Business Profile': 'Vi analyserar din lokala synlighet på Google Maps...',
  'Analyserar innehållsdjup och auktoritet': 'Vi undersöker djupet och auktoriteten i ditt innehåll...',
  'Söker efter sitemap.xml': 'Vi letar efter din sitemap som hjälper AI-crawlers att navigera...',
  'Kontrollerar trovärdighet och avsändaridentitet (E-A-T)': 'Vi granskar trovärdighet, expertis och auktoritet på sidan...',
}

interface PendingStep {
  step: string
  desc: string
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [cards, setCards] = useState<ReportCard[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [currentStepDesc, setCurrentStepDesc] = useState<string>('')
  const [progressPct, setProgressPct] = useState(0)

  const pendingCardsRef = useRef<ReportCard[]>([])
  const pendingStepsRef = useRef<PendingStep[]>([])
  const pendingSummaryRef = useRef<Summary | null>(null)
  const pendingDoneRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const totalCardsRef = useRef(0)

  const clearPending = useCallback(() => {
    pendingCardsRef.current = []
    pendingStepsRef.current = []
    pendingSummaryRef.current = null
    pendingDoneRef.current = false
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const flushOne = useCallback(() => {
    if (pendingStepsRef.current.length > 0) {
      const s = pendingStepsRef.current.shift()!
      setCurrentStep(s.step)
      setCurrentStepDesc(s.desc)
    }

    if (pendingCardsRef.current.length > 0) {
      const card = pendingCardsRef.current.shift()!
      setCards(prev => [card, ...prev])
      const soFar = totalCardsRef.current - pendingCardsRef.current.length
      setProgressPct(Math.round((soFar / totalCardsRef.current) * 100))
      return
    }

    const elapsed = Date.now() - startTimeRef.current
    if (pendingSummaryRef.current && elapsed >= MIN_SCAN_TIME_MS) {
      setSummary(pendingSummaryRef.current)
      pendingSummaryRef.current = null
      return
    }

    if (pendingDoneRef.current && elapsed >= MIN_SCAN_TIME_MS && !pendingSummaryRef.current) {
      setState('done')
      pendingDoneRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const analyze = useCallback(async (url: string) => {
    clearPending()
    setState('scanning')
    setCards([])
    setSummary(null)
    setError(null)
    setCurrentStep('')
    setCurrentStepDesc('')
    setProgressPct(0)
    startTimeRef.current = Date.now()
    totalCardsRef.current = 0

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

          if (event === 'progress') {
            const step = data.step as string
            pendingStepsRef.current.push({
              step,
              desc: STEP_DESCRIPTIONS[step] || step,
            })
          } else if (event === 'card') {
            pendingCardsRef.current.push(data as ReportCard)
            totalCardsRef.current += 1
            if (!intervalRef.current) {
              intervalRef.current = setInterval(flushOne, CARD_DELAY_MS)
            }
          } else if (event === 'summary') {
            pendingSummaryRef.current = data as Summary
          } else if (event === 'done') {
            pendingDoneRef.current = true
          } else if (event === 'error') {
            setError(data.message)
            setState('error')
            clearPending()
          }
        }
      }
    } catch {
      setError('Något gick fel. Försök igen.')
      setState('error')
      clearPending()
    }
  }, [clearPending, flushOne])

  const reset = useCallback(() => {
    clearPending()
    setState('idle')
    setCards([])
    setSummary(null)
    setError(null)
    setCurrentStep('')
    setCurrentStepDesc('')
    setProgressPct(0)
  }, [clearPending])

  return { state, cards, summary, error, currentStep, currentStepDesc, progressPct, analyze, reset }
}
