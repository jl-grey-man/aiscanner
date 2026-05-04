'use client'

import { useState } from 'react'
import type { CheckResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'
import { CHECK_EXPLANATIONS } from '@/app/lib/checkExplanations'
import CheckBadge from './CheckBadge'
import { renderMarkdown } from './RichMarkdown'

interface SolutionCardProps {
  check: CheckResult
}

type Priority = NonNullable<CheckResult['priority']>

const PRIORITY_LABEL: Record<Priority, { label: string; colorClass: string; dotClass: string }> = {
  critical:  { label: 'Kritiskt',   colorClass: 'text-red-700',   dotClass: 'bg-red-500' },
  important: { label: 'Viktigt',    colorClass: 'text-amber-700', dotClass: 'bg-amber-500' },
  nice:      { label: 'Bra att ha', colorClass: 'text-blue-700',  dotClass: 'bg-blue-500' },
}

export default function SolutionCard({ check }: SolutionCardProps) {
  const [copied, setCopied] = useState(false)
  const priority = check.priority ?? 'nice'
  const { label: priorityLabel, colorClass, dotClass } = PRIORITY_LABEL[priority]
  const registryEntry = CHECK_REGISTRY.find((e) => e.key === check.key)
  const checkLabel = registryEntry?.label ?? check.key

  const explanation = CHECK_EXPLANATIONS[check.key]
  const codeToShow = check.richCodeExample || check.codeExample || null

  const handleCopy = () => {
    if (codeToShow) {
      navigator.clipboard.writeText(codeToShow)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      id={`fix-${check.key}`}
      className="mb-8 pb-8 border-b border-gray-200 last:border-b-0 last:mb-0 last:pb-0"
    >
      {/* Priority indicator */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className={`text-xs font-medium uppercase tracking-wide ${colorClass}`}>
          {priorityLabel}
        </span>
      </div>

      {/* Title + badge */}
      <div className="flex items-center gap-2 mb-3">
        <CheckBadge status={check.status} />
        <h3 className="text-lg font-semibold text-gray-900">{checkLabel}</h3>
      </div>

      {/* Block 1: Vad är detta? (hardcoded explanation) */}
      {explanation && (
        <div className="bg-slate-50 rounded-lg p-4 mb-3 border border-slate-200">
          <p className="text-gray-700 text-sm font-medium mb-1">Vad är detta?</p>
          <p className="text-gray-500 text-sm">{explanation}</p>
        </div>
      )}

      {/* Block 2: Varför spelar det roll för [Företag]? */}
      {check.richRelevance ? (
        <div className="bg-white rounded-lg p-4 mb-3 border border-gray-100">
          <p className="text-gray-700 text-sm font-medium mb-1">Varför spelar det roll?</p>
          <div
            className="prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(check.richRelevance) }}
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg p-4 mb-3 border border-gray-100">
          <p className="text-gray-600 text-sm font-medium mb-1">Vad:</p>
          <p className="text-gray-500 text-sm">{check.finding}</p>
        </div>
      )}

      {/* Block 3: Steg för steg */}
      {check.richSteps ? (
        <div className="bg-white rounded-lg p-4 mb-3 border border-gray-100">
          <p className="text-gray-700 text-sm font-medium mb-2">Så här fixar ni det</p>
          <div
            className="prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(check.richSteps) }}
          />
        </div>
      ) : check.fix ? (
        <div className="bg-white rounded-lg p-4 mb-3 border border-gray-100">
          <p className="text-gray-600 text-sm font-medium mb-1">Åtgärd:</p>
          <p className="text-gray-500 text-sm">{check.fix}</p>
        </div>
      ) : null}

      {/* Block 4: Kod att kopiera */}
      {codeToShow && (
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-700 text-sm font-medium">Kod att kopiera</p>
            <button
              onClick={handleCopy}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
            >
              {copied ? (
                <span className="text-emerald-600">Kopierat!</span>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Kopiera
                </>
              )}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed">
            <code className="font-mono">{codeToShow}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
