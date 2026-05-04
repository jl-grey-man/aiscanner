import { useState, useCallback, useRef, useEffect } from 'react'
import type { ScanResult } from '@/app/lib/scanResult'

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

export interface EnhancedReportData {
  url: string
  city: string
  timestamp: string
  synthesis: string
  technical: {
    aiCrawlers: { status: string; blocked: string[]; finding: string; fix: string }
    ogTags: { status: string; missing: string[]; finding: string; fix: string; codeExample?: string }
    socialPresence: { status: string; found: string[]; finding: string; fix: string }
    hreflang: { status: string; finding: string; fix: string }
  }
  faqContent: {
    faqSchema: { status: string; finding: string; fix: string; codeExample?: string }
    contentDepth: { status: string; pageCount: number; hasBlog: boolean; finding: string; fix: string }
    serviceSchema: { status: string; finding: string; fix: string; codeExample?: string }
  }
  eat: {
    eatSignals: { status: string; found: string[]; missing: string[]; finding: string; fix: string }
    orgNumber: { status: string; finding: string }
    certifications: { status: string; found: string[]; finding: string; fix: string }
  }
  directories: {
    foundCount: number
    totalChecked: number
    directories: Array<{
      name: string
      found: boolean
      source: string
      profileUrl?: string
      nap?: { phone?: string; address?: string }
    }>
    napConsistency: {
      checked: boolean
      consistent: boolean
      finding: string
      fix: string
      phone: { values: Array<{ directory: string; value: string }>; consistent: boolean }
      address: { values: Array<{ directory: string; value: string }>; consistent: boolean }
    }
    status: string
    finding: string
    fix: string
  }
  reviewReplies: {
    total: number
    withReply: number
    responseRate: number
    status: string
    finding: string
    fix: string
    sampleNote: string
  }
  aiMentions: {
    entityQuery: string
    entityResponse: string
    entityKnows: boolean
    entitySentiment: string
    extractedNiche: string
    categoryQuery: string
    categoryResponse: string
    categoryMentioned: boolean
    status: string
    finding: string
    fix: string
  } | null
  hasPlaceData: boolean
  placeData: {
    name: string
    address: string
    phone: string
    rating: number
    reviewCount: number
    verified: boolean
  } | null
}

export type AnalysisState = 'idle' | 'scanning' | 'done' | 'error' | 'premium-loading' | 'premium-done'

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [freeReport, setFreeReport] = useState<FreeReportData | null>(null)
  const [premiumReport, setPremiumReport] = useState<PremiumReportData | null>(null)
  const [enhancedReport, setEnhancedReport] = useState<EnhancedReportData | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
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
        // Start creeping progress from 88% toward 99% — slows down as it approaches 99%
        // Designed for ~90s total scan time: reaches ~93% at 30s, ~96% at 60s, ~98% at 90s
        let p = 88
        clearInterval(intervalRef.current!)
        intervalRef.current = setInterval(() => {
          const remaining = 99 - p
          // Each tick moves 1.5-3% of the remaining distance — asymptotic approach
          p += remaining * (0.015 + Math.random() * 0.015)
          if (p >= 98.9) p = 98.9 // Never quite reach 99% until actually done
          setSimulatedProgress(p)
        }, 1000)
      }
    }, 1100)
  }, [clearTimers])

  const analyze = useCallback(async (url: string, city?: string) => {
    clearTimers()
    setState('scanning')
    setFreeReport(null)
    setPremiumReport(null)
    setEnhancedReport(null)
    setScanResult(null)
    setError(null)
    setSimulatedProgress(null)
    simulateSteps()

    try {
      const res = await fetch('/api/enhanced-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, city }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Fel')
      setEnhancedReport(json as EnhancedReportData)
      setScanResult(json as ScanResult)
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
    setEnhancedReport(null)
    setScanResult(null)
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
    enhancedReport,
    scanResult,
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
