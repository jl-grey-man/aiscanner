'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import type { ScanResult } from '@/app/lib/scanResult'
import { FreeReport } from '@/app/components/report/FreeReport'
import { PremiumReport } from '@/app/components/report/PremiumReport'
import mockData from '@/app/lib/mockScan.json'

// Strip rich/Pro-fields to simulate a free-tier scan from the same dataset
function toFreeView(paid: ScanResult): ScanResult {
  return {
    ...paid,
    checks: paid.checks.map((c) => ({
      ...c,
      richRelevance: null,
      richSteps: null,
      richCodeExample: null,
    })),
    synthesis: {
      actionPlan: '### Kritiskt\n\n1. **LocalBusiness-schema** — Inget LocalBusiness-schema hittades.\n2. **Google Maps-inbäddning** — Ingen Google Maps-inbäddning hittades.\n\n### Viktigt\n\n1. **FAQ-schema** — FAQ-schema saknas.\n2. **Sitemap.xml** — Sitemap.xml saknas.',
      competitorNote: 'Detaljerad konkurrentjämförelse med betyg och AI-synlighetspoäng ingår i den fullständiga rapporten.',
      reviewAnalysis: null,
      summary: 'Vi hittade 2 kritiska och 4 viktiga åtgärder. Fixa de kritiska först — de har störst påverkan på er AI-synlighet.',
    },
  }
}

export default function PreviewPage() {
  // I produktion: 404. Den här sidan är bara för design-iteration lokalt.
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const [view, setView] = useState<'free' | 'premium'>('free')
  const paidResult = mockData as unknown as ScanResult
  const freeResult = toFreeView(paidResult)
  const current = view === 'free' ? freeResult : paidResult

  return (
    <div>
      {/* Sticky preview-toolbar */}
      <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 font-semibold text-sm">PREVIEW</span>
            <span className="text-amber-600 text-xs">
              Fake-data, ingen riktig scan. Endast tillgänglig i dev.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView('free')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                view === 'free'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              Gratisrapport
            </button>
            <button
              type="button"
              onClick={() => setView('premium')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                view === 'premium'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              Premiumrapport
            </button>
          </div>
        </div>
      </div>

      {/* Rapport */}
      {view === 'free' ? (
        <FreeReport scanResult={current} />
      ) : (
        <PremiumReport scanResult={current} />
      )}
    </div>
  )
}
