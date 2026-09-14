'use client'

import Image from 'next/image'
import { UrlInput } from '@/app/components/UrlInput'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'

// Härlett ur CHECK_REGISTRY — samma filter som calculateScores() använder för
// free-tier. Aldrig hårdkoda antalet: det ändras varje gång en check flyttas
// mellan free/premium i registret.
const FREE_CHECK_COUNT = CHECK_REGISTRY.filter((c) => c.tier === 'free').length

interface ToolSectionProps {
  /** The scan is always handled by the parent (AppShell), which owns loading/result/error state. */
  onAnalyze: (url: string, city?: string) => void
}

export function ToolSection({ onAnalyze }: ToolSectionProps) {
  return (
    <section id="analysera" className="cta-section">
      <div className="cta-inner">
        {/* Heading */}
        <h2 className="cta-h2">
          Hur ser det ut<br/>för din sajt?
        </h2>

        <p className="cta-body">
          {FREE_CHECK_COUNT} kontroller. 30 sekunder. Gratis.
        </p>

        {/* URL Input — parent (AppShell) swaps this whole section out for a
            Progress/report view once a scan starts, so no local loading state
            is needed here. */}
        <div style={{ marginBottom: '12px' }}>
          <UrlInput onSubmit={onAnalyze} />
        </div>

        <p className="cta-fine" style={{ marginBottom: '40px' }}>
          Ingen e-post. Ingen registrering. Resultat direkt.
        </p>
      </div>

      {/* Phone image — full-width */}
      <div style={{ lineHeight: 0 }}>
        <Image
          src="/soka-telefon.webp"
          alt="Person söker på mobil"
          width={1400}
          height={787}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
    </section>
  )
}
