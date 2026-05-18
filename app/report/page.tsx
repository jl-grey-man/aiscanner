'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ScanResult } from '@/app/lib/scanResult'
import { PremiumReport } from '@/app/components/report/PremiumReport'

type State = 'idle' | 'finalizing' | 'scanning' | 'done' | 'error'

const STEPS = [
  'Verifierar betalning…',
  'Hämtar tidigare scan…',
  'Kör premiumanalys (~70 s)…',
  'Genererar konkurrentjämförelse…',
  'Skriver er åtgärdsplan…',
  'Klar!',
]

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReportInner />
    </Suspense>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
    </div>
  )
}

function ReportInner() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [state, setState] = useState<State>('idle')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const triggeredRef = useRef(false)

  useEffect(() => {
    if (!sessionId || triggeredRef.current) return
    triggeredRef.current = true

    const run = async () => {
      setState('finalizing')
      setStepIdx(0)

      // Animera stegen medan vi väntar
      let i = 0
      const stepInterval = setInterval(() => {
        i = Math.min(i + 1, STEPS.length - 2)
        setStepIdx(i)
      }, 12000)

      try {
        setState('scanning')
        const res = await fetch('/api/checkout/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const json = await res.json()
        clearInterval(stepInterval)

        if (!res.ok) {
          throw new Error(json.error || json.detail || `HTTP ${res.status}`)
        }
        if (!json.scanResult) {
          throw new Error('Inget scan-resultat returnerades')
        }
        setScanResult(json.scanResult)
        setStepIdx(STEPS.length - 1)
        setState('done')
      } catch (e: unknown) {
        clearInterval(stepInterval)
        const msg = e instanceof Error ? e.message : 'Något gick fel'
        setError(msg)
        setState('error')
      }
    }
    run()
  }, [sessionId])

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-lg w-full text-center shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ingen session</h2>
          <p className="text-gray-600 text-sm mb-6">
            Den här sidan kräver en session_id i URL:en. Kom du hit utan att gå via betalning?
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors"
          >
            Tillbaka till start
          </a>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-lg w-full text-center shadow-sm">
          <div className="text-red-500 text-4xl mb-4">!</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Kunde inte ladda rapporten</h2>
          <p className="text-gray-600 text-sm mb-1">{error}</p>
          <p className="text-gray-500 text-xs mb-6">Session-ID: <code>{sessionId}</code></p>
          <button
            type="button"
            onClick={() => {
              triggeredRef.current = false
              setError(null)
              setState('idle')
              window.location.reload()
            }}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors"
          >
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  if (state === 'done' && scanResult) {
    return <PremiumReport scanResult={scanResult} />
  }

  // Loading
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Förbereder er premiumrapport</h2>
          <p className="text-gray-600 text-sm">{STEPS[stepIdx]}</p>
        </div>
        <div className="text-xs text-gray-400">
          Det här tar ungefär en minut. Stäng inte fliken.
        </div>
      </div>
    </div>
  )
}
