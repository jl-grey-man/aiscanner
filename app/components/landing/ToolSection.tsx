'use client'

import { useEffect, useRef } from 'react'
import { useAnalysis } from '@/app/hooks/useAnalysis'
import { UrlInput } from '@/app/components/UrlInput'
import { Progress } from '@/app/components/Progress'
import { EnhancedReport } from '@/app/components/EnhancedReport'
import { PremiumCTA } from './PremiumCTA'

export function ToolSection() {
  const {
    state,
    enhancedReport,
    error,
    currentStep,
    progressPct,
    stepIndex,
    analyze,
  } = useAnalysis()

  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (enhancedReport && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [enhancedReport])

  const isScanning = state === 'scanning'

  return (
    <section id="analysera" className="cta-section">
      <div className="cta-inner">
        {/* Heading */}
        <h2 className="cta-h2">
          Hur ser det ut<br/>för din sajt?
        </h2>

        <p className="cta-body">
          23 kontroller. 30 sekunder. Gratis.
        </p>

        {/* URL Input — always visible for re-scanning */}
        <div style={{ marginBottom: '12px' }}>
          <UrlInput onSubmit={analyze} disabled={isScanning} />
        </div>

        <p className="cta-fine" style={{ marginBottom: '40px' }}>
          Ingen e-post. Ingen registrering. Resultat direkt.
        </p>

        {/* Progress while scanning */}
        {isScanning && (
          <div style={{ textAlign: 'left', marginTop: '24px' }}>
            <Progress
              currentStep={currentStep}
              progressPct={progressPct}
              stepIndex={stepIndex}
            />
          </div>
        )}

        {/* Error state */}
        {state === 'error' && error && (
          <div
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,80,50,0.5)',
              borderRadius: '12px',
              padding: '16px 20px',
              marginTop: '24px',
              color: 'rgba(255,120,100,1)',
              textAlign: 'left',
              fontSize: '15px',
            }}
          >
            <strong>Fel:</strong> {error}
          </div>
        )}

        {/* Report + PremiumCTA */}
        {enhancedReport && (
          <div ref={reportRef} style={{ textAlign: 'left', marginTop: '40px' }}>
            <EnhancedReport data={enhancedReport} />
            <div style={{ marginTop: '32px' }}>
              <PremiumCTA show={true} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
