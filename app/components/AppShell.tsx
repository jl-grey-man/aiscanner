'use client'

import { useEffect, useRef, useState } from 'react'
import { useAnalysis } from '@/app/hooks/useAnalysis'
import { Progress } from '@/app/components/Progress'
import { FreeReport } from '@/app/components/report/FreeReport'
import { PremiumReport } from '@/app/components/report/PremiumReport'
import { Hero } from '@/app/components/landing/Hero'
import { SearchChanged } from '@/app/components/landing/SearchChanged'
import { ConcreteExample } from '@/app/components/landing/ConcreteExample'
import { WhatAILooksAt } from '@/app/components/landing/WhatAILooksAt'
import { ToolSection } from '@/app/components/landing/ToolSection'
import { ReportExample } from '@/app/components/landing/ReportExample'
import { Premium } from '@/app/components/landing/Premium'
import { FaqSection } from '@/app/components/landing/FaqSection'
import { Footer } from '@/app/components/landing/Footer'

// Toggle:n + auto-trigger av paid-scan är BARA i dev — i prod kostar varje paid-scan ~$0.35
// och ska bara köras när någon faktiskt betalar (framtida payment-flow triggar analyzePaid).
// För att se paid-rapporten utan att betala: /preview (mock-data) eller npm run dev lokalt.
const IS_DEV = process.env.NODE_ENV === 'development'

export function AppShell() {
  const {
    state,
    scanResult,
    scanResultPaid,
    paidLoading,
    paidError,
    error,
    currentStep,
    progressPct,
    stepIndex,
    analyze,
    analyzePaid,
    reset,
  } = useAnalysis()

  const [showPremium, setShowPremium] = useState(false)
  const paidTriggeredRef = useRef(false)

  const isLoading = state === 'scanning'
  const isDone = state === 'done'
  const isError = state === 'error'

  // In dev: auto-kick off paid scan after free completes, so toggle is instant.
  useEffect(() => {
    if (IS_DEV && isDone && scanResult && !scanResultPaid && !paidLoading && !paidTriggeredRef.current) {
      paidTriggeredRef.current = true
      analyzePaid(scanResult.meta.url, scanResult.meta.city ?? undefined)
    }
  }, [isDone, scanResult, scanResultPaid, paidLoading, analyzePaid])

  // Reset the trigger flag when scan resets
  useEffect(() => {
    if (state === 'idle' || state === 'scanning') {
      paidTriggeredRef.current = false
    }
  }, [state])

  // Landing page — show when idle or not yet started
  if (state === 'idle') {
    return (
      <>
        <Hero onAnalyze={analyze} />
        <SearchChanged />
        <ConcreteExample />
        <WhatAILooksAt />
        <ToolSection onAnalyze={analyze} />
        <ReportExample />
        <Premium />
        <FaqSection />
        <Footer />
      </>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-2xl">
          <Progress
            currentStep={currentStep}
            progressPct={progressPct}
            stepIndex={stepIndex}
          />
        </div>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-lg w-full text-center shadow-sm">
          <div className="text-red-500 text-4xl mb-4">!</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Analysen misslyckades</h2>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 bg-accent hover:bg-accent-glow text-white font-semibold rounded-xl transition-colors"
          >
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  // Done — show report
  if (isDone && scanResult) {
    return (
      <div>
        {/* Top bar with reset + dev toggle */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              Ny analys
            </button>
            {IS_DEV && (
              <div className="flex items-center gap-2">
                {paidError && !scanResultPaid && (
                  <button
                    type="button"
                    onClick={() => {
                      paidTriggeredRef.current = false
                      analyzePaid(scanResult.meta.url, scanResult.meta.city ?? undefined)
                    }}
                    className="text-xs bg-red-100 text-red-800 border border-red-300 px-3 py-1.5 rounded-lg font-medium hover:bg-red-200 transition-colors"
                  >
                    Premium misslyckades — försök igen [DEV]
                  </button>
                )}
                {!paidError && (
                  <button
                    type="button"
                    onClick={() => setShowPremium((v) => !v)}
                    disabled={!scanResultPaid}
                    className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {showPremium
                      ? 'Visa gratisrapport'
                      : scanResultPaid
                        ? 'Visa premiumrapport [DEV]'
                        : paidLoading
                          ? 'Premium laddar... [DEV]'
                          : 'Premium ej startad [DEV]'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Report — premium if dev-toggle on AND paid result loaded, else free */}
        {showPremium && IS_DEV && scanResultPaid ? (
          <PremiumReport scanResult={scanResultPaid} />
        ) : (
          <FreeReport scanResult={scanResult} />
        )}
      </div>
    )
  }

  // Fallback (e.g. done but no scanResult)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <button
        type="button"
        onClick={reset}
        className="px-6 py-3 bg-accent text-white rounded-xl font-semibold"
      >
        Tillbaka
      </button>
    </div>
  )
}
