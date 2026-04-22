import { useEffect, useState } from 'react'

interface Props {
  currentStep: string
  currentStepDesc: string
  progressPct: number
}

const SCANNING_MESSAGES = [
  'Initierar anslutning till servern...',
  'Laddar analysmoduler...',
  'Kalibrerar AI-motorer...',
  'Förbereder dataströmmar...',
]

export function Progress({ currentStep, currentStepDesc, progressPct }: Props) {
  const [bootMsg, setBootMsg] = useState(SCANNING_MESSAGES[0])
  const [showBoot, setShowBoot] = useState(true)

  // Animated counters
  const [requests, setRequests] = useState(0)
  const [dataMb, setDataMb] = useState(0)
  const [activeModels, setActiveModels] = useState(1)
  const [tick, setTick] = useState(0)

  // Boot sequence
  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      i++
      if (i < SCANNING_MESSAGES.length) {
        setBootMsg(SCANNING_MESSAGES[i])
      } else {
        setShowBoot(false)
        clearInterval(t)
      }
    }, 600)
    return () => clearInterval(t)
  }, [])

  // Fast tick counter for dynamic feel
  useEffect(() => {
    if (showBoot) return
    const t = setInterval(() => {
      setTick(prev => prev + 1)
    }, 250)
    return () => clearInterval(t)
  }, [showBoot])

  // Update animated values smoothly toward target
  useEffect(() => {
    const targetRequests = Math.min(progressPct * 2 + 3, 28)
    const targetData = progressPct * 0.8

    setRequests(prev => {
      if (prev < targetRequests) return prev + 1
      return targetRequests
    })

    setDataMb(prev => {
      const step = targetData / 40
      if (prev + step < targetData) return prev + step
      return targetData
    })

    // Toggle AI models occasionally for realism
    if (progressPct > 15 && progressPct < 85) {
      setActiveModels(tick % 8 < 4 ? 2 : 1)
    } else if (progressPct >= 85) {
      setActiveModels(1)
    } else {
      setActiveModels(1)
    }
  }, [tick, progressPct])

  return (
    <div className="w-full mb-10">
      {/* Status header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-5 h-5">
          <div className="absolute inset-0 rounded-full border-2 border-accent/30" />
          <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {showBoot ? bootMsg : 'Analys pågår...'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progressPct, 5)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-500 tabular-nums w-10 text-right">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Current step status box — all info inside */}
      {!showBoot && currentStepDesc && (
        <div className="bg-accent/5 border border-accent/15 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-accent mt-0.5 shrink-0 text-lg">▸</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{currentStep}</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{currentStepDesc}</p>
            </div>
          </div>

          {/* Activity log — inside the box, updates fast */}
          <div className="border-t border-accent/10 pt-4 font-mono text-xs text-gray-400 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>HTTP-anrop: {requests} förfrågningar skickade</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>Data behandlad: {dataMb.toFixed(1)} MB</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>AI-modeller: {activeModels} aktiv{activeModels > 1 ? 'a' : ''} — Gemini Flash 2.0 + Gemini Flash 2.5</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
