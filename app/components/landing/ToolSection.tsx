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
    <section
      id="analysera"
      className="v3-cta"
      style={{ background: 'var(--c3-ink)', color: 'white', textAlign: 'center', padding: 'clamp(80px,12vw,160px) 0', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        {/* Heading */}
        <h2
          style={{
            fontSize: 'clamp(32px,6vw,64px)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: '16px',
          }}
        >
          Hur ser det ut
          <br />
          för{' '}
          <span
            style={{
              textDecoration: 'underline',
              textDecorationColor: 'var(--c3-pop)',
              textUnderlineOffset: '6px',
              textDecorationThickness: '4px',
            }}
          >
            din
          </span>{' '}
          sajt?
        </h2>

        <p
          style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.5)',
            marginBottom: '36px',
          }}
        >
          23 kontroller. 30 sekunder. Gratis.
        </p>

        {/* URL Input — always visible for re-scanning */}
        <div style={{ marginBottom: '12px' }}>
          <UrlInput onSubmit={analyze} disabled={isScanning} />
        </div>

        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.3)',
            marginBottom: '40px',
          }}
        >
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
