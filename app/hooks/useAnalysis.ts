import { useState, useCallback, useRef, useEffect } from 'react'

const STEP_MESSAGES = [
  'Hämtar hemsidan...',
  'Analyserar teknisk struktur...',
  'Granskar meta-taggar och schema...',
  'Letar efter robots.txt och sitemap...',
  'Kontrollerar lokal närvaro...',
  'AI analyserar innehåll...',
  'Bearbetar AI-svar...',
  'Klar!',
]

const LAST_REAL_STEP = STEP_MESSAGES.length - 2 // index 6

export interface Check {
  title: string
  status: 'good' | 'warning' | 'bad'
  finding: string
  what?: string
  why?: string
  fix?: string
}

export interface Phase {
  id: string
  label: string
  checks: Check[]
}

export interface LogEvent {
  time: number
  category: string
  message: string
  details: Record<string, unknown>
}

export interface FreeReportData {
  score: number
  summary: string
  categories: Record<string, { score: number; label: string }>
  phases: Phase[]
  criticalIssues: Array<{
    severity: string
    category: string
    title: string
    description: string
    fix: string
    codeExample: string | null
  }>
  quickWins: Array<{ title: string; fix: string; effort: string }>
  localSignals: {
    napFound: boolean
    cityFound: boolean
    cityName: string | null
    hasLocalBusinessSchema: boolean
    schemaType: string | null
  }
}

export interface PremiumReportData {
  score: number
  summary: string
  napConsistency: {
    score: number
    websiteNap: { name: string; address: string; phone: string }
    googleNap: { name: string; address: string; phone: string }
    issues: string[]
  }
  gbpAnalysis: {
    score: number
    strengths: string[]
    weaknesses: string[]
  }
  reviewAnalysis: {
    score: number
    totalReviews: number
    avgRating: number
    sentiment: string
    keywords: string[]
    divergenceWarning: string | null
  }
  competitorComparison: Array<{
    name: string
    score: number
    whyTheyWin: string
    yourGap: string
  }>
  tailoredFixes: Array<{
    priority: number
    title: string
    action: string
    code: string | null
    expectedImpact: string
  }>
}

export type AnalysisState = 'idle' | 'scanning' | 'done' | 'error' | 'premium-loading' | 'premium-done'

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [freeReport, setFreeReport] = useState<FreeReportData | null>(null)
  const [premiumReport, setPremiumReport] = useState<PremiumReportData | null>(null)
  const [analysisLog, setAnalysisLog] = useState<LogEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [simulatedProgress, setSimulatedProgress] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  const simulateSteps = useCallback(() => {
    setStepIndex(0)
    setSimulatedProgress(null)
    let i = 0
    intervalRef.current = setInterval(() => {
      i++
      if (i < LAST_REAL_STEP) {
        setStepIndex(i)
      } else if (i === LAST_REAL_STEP) {
        setStepIndex(LAST_REAL_STEP)
        // Start creeping progress from 88% toward 99%
        let p = 88
        clearInterval(intervalRef.current!)
        intervalRef.current = setInterval(() => {
          p += Math.random() * 1.5 + 0.3 // 0.3–1.8% per tick
          if (p >= 99) {
            p = 99
            clearInterval(intervalRef.current!)
            intervalRef.current = null
          }
          setSimulatedProgress(p)
        }, 400)
      }
    }, 1100)
  }, [clearTimers])

  const analyze = useCallback(async (url: string) => {
    clearTimers()
    setState('scanning')
    setFreeReport(null)
    setPremiumReport(null)
    setError(null)
    setSimulatedProgress(null)
    simulateSteps()

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Fel')
      setFreeReport(json.data)
      setAnalysisLog(json.log || null)
      setStepIndex(STEP_MESSAGES.length - 1)
      setSimulatedProgress(100)
      setState('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Något gick fel'
      setError(msg)
      setState('error')
    } finally {
      clearTimers()
    }
  }, [clearTimers, simulateSteps])

  const runPremium = useCallback(async (url: string) => {
    clearTimers()
    setState('premium-loading')
    setPremiumReport(null)
    setError(null)
    setSimulatedProgress(null)
    simulateSteps()

    try {
      const res = await fetch('/api/full-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Fel')
      setPremiumReport(json.premium)
      setAnalysisLog((json.log || json.free_log) || null)
      setStepIndex(STEP_MESSAGES.length - 1)
      setSimulatedProgress(100)
      setState('premium-done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Något gick fel'
      setError(msg)
      setState('error')
    } finally {
      clearTimers()
    }
  }, [clearTimers, simulateSteps])

  const reset = useCallback(() => {
    clearTimers()
    setState('idle')
    setFreeReport(null)
    setPremiumReport(null)
    setAnalysisLog(null)
    setError(null)
    setStepIndex(0)
    setSimulatedProgress(null)
  }, [clearTimers])

  const currentStep = STEP_MESSAGES[Math.min(stepIndex, STEP_MESSAGES.length - 1)]

  // Use simulated progress when active (creeping 88→99%), otherwise calculate from step
  const progressPct = simulatedProgress !== null
    ? Math.round(simulatedProgress)
    : Math.round(((stepIndex + 1) / STEP_MESSAGES.length) * 100)

  return {
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
  }
}
