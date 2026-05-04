'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { useAnalysis } from '@/app/hooks/useAnalysis'
import { UrlInput } from '@/app/components/UrlInput'
import { Progress } from '@/app/components/Progress'
import { EnhancedReport } from '@/app/components/EnhancedReport'
import { PremiumCTA } from './PremiumCTA'

interface ToolSectionProps {
  /** When provided, the scan is handled by the parent (AppShell). */
  onAnalyze?: (url: string, city?: string) => void
}

export function ToolSection({ onAnalyze }: ToolSectionProps = {}) {
  const {
    state,
    enhancedReport,
    error,
    currentStep,
    progressPct,
    stepIndex,
    analyze: localAnalyze,
  } = useAnalysis()

  // When controlled by a parent (onAnalyze provided), the parent handles
  // loading/result states. ToolSection just shows the form.
  const isControlled = onAnalyze !== undefined

  // Use the parent-provided callback when available, otherwise fall back to
  // the local hook so ToolSection still works standalone.
  const analyze = onAnalyze ?? localAnalyze

  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isControlled && enhancedReport && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isControlled, enhancedReport])

  // In controlled mode always treat as idle (parent manages state).
  const effectiveState = isControlled ? 'idle' : state
  const isScanning = effectiveState === 'scanning'

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

        {/* Progress while scanning (standalone mode only) */}
        {!isControlled && isScanning && (
          <div style={{ textAlign: 'left', marginTop: '24px' }}>
            <Progress
              currentStep={currentStep}
              progressPct={progressPct}
              stepIndex={stepIndex}
            />
          </div>
        )}

        {/* Error state (standalone mode only) */}
        {!isControlled && effectiveState === 'error' && error && (
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

        {/* Report + PremiumCTA (standalone mode only) */}
        {!isControlled && enhancedReport && (
          <div ref={reportRef} style={{ textAlign: 'left', marginTop: '40px' }}>
            <EnhancedReport data={enhancedReport} />
            <div style={{ marginTop: '32px' }}>
              <PremiumCTA show={true} />
            </div>
          </div>
        )}
      </div>

      {/* Phone image — full-width, shown only before scan */}
      {effectiveState === 'idle' && (
        <div style={{ lineHeight: 0 }}>
          <Image
            src="/soka-telefon.webp"
            alt="Person söker på mobil"
            width={1400}
            height={787}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      )}
    </section>
  )
}
