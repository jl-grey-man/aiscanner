'use client'

import React from 'react'
import type { ScanResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'
import ScoreCircle from './ScoreCircle'
import PriorityCard from './PriorityCard'
import SolutionCard from './SolutionCard'
import CheckTable from './CheckTable'
import Glossary from './Glossary'
import { renderMarkdown } from './RichMarkdown'
import { APP_DOMAIN } from '@/app/lib/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate star string for a rating (full stars only for simplicity) */
function renderStars(rating: number): string {
  const full = Math.round(rating)
  const empty = 5 - full
  return '\u2605'.repeat(full) + '\u2606'.repeat(empty)
}

// Category config for sections
const CATEGORY_CONFIG: { category: string; label: string }[] = [
  { category: 'technical', label: 'Teknisk grund' },
  { category: 'local', label: 'Lokal synlighet' },
  { category: 'ai-readiness', label: 'AI-beredskap' },
  { category: 'content', label: 'Innehall' },
  { category: 'ai-test', label: 'AI-synlighetstest' },
  { category: 'gbp', label: 'Google Business Profile' },
]

const SOLUTION_CATEGORY_CONFIG: { category: string; label: string }[] = [
  { category: 'technical', label: 'Teknisk grund' },
  { category: 'local', label: 'Lokal synlighet' },
  { category: 'ai-readiness', label: 'AI-beredskap' },
  { category: 'content', label: 'Innehall' },
  { category: 'ai-test', label: 'AI-synlighetstest' },
  { category: 'gbp', label: 'Google Business Profile' },
]

// Priority config
const PRIORITY_GROUP_CONFIG: {
  key: 'critical' | 'important' | 'nice'
  label: string
  sublabel: string
  dotClass: string
  labelColor: string
}[] = [
  { key: 'critical', label: 'Kritiskt', sublabel: 'fixa forst', dotClass: 'bg-red-500', labelColor: 'text-red-700' },
  { key: 'important', label: 'Viktigt', sublabel: 'starker er ytterligare', dotClass: 'bg-amber-500', labelColor: 'text-amber-700' },
  { key: 'nice', label: 'Bra att ha', sublabel: 'finslipar', dotClass: 'bg-blue-500', labelColor: 'text-blue-700' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PremiumReport({ scanResult }: { scanResult: ScanResult }): React.JSX.Element {
  const { meta, scores, checks, synthesis, reviewReplies } = scanResult

  // Build a registry lookup for weights
  const registryByKey = new Map(CHECK_REGISTRY.map(e => [e.key, e]))

  // ---- Section 3: Top 3 critical findings ----
  const badChecks = checks
    .filter(c => c.status === 'bad' || c.status === 'warning')
    .sort((a, b) => {
      const wa = registryByKey.get(a.key)?.weight.full ?? 0
      const wb = registryByKey.get(b.key)?.weight.full ?? 0
      // Sort by weight descending, then by status (bad before warning)
      if (wb !== wa) return wb - wa
      if (a.status === 'bad' && b.status !== 'bad') return -1
      if (b.status === 'bad' && a.status !== 'bad') return 1
      return 0
    })
    .slice(0, 3)

  // ---- Section 4: Action plan — all checks with priority ----
  const checksWithPriority = checks.filter(c => c.priority !== null && c.key !== 'synthesis')

  const priorityGroups = PRIORITY_GROUP_CONFIG.map(group => ({
    ...group,
    items: checksWithPriority.filter(c => c.priority === group.key),
  })).filter(g => g.items.length > 0)

  // Global index counter for action plan numbering
  let actionIndex = 0

  // ---- Section 5: Solutions — all checks with fix ----
  const checksWithFix = checks.filter(c => c.fix !== null && c.key !== 'synthesis')

  // Group solutions by category
  const solutionsByCategory = SOLUTION_CATEGORY_CONFIG.map(cat => {
    const catKeys = new Set(
      CHECK_REGISTRY.filter(e => e.category === cat.category).map(e => e.key)
    )
    return {
      ...cat,
      items: checksWithFix.filter(c => catKeys.has(c.key)),
    }
  }).filter(g => g.items.length > 0)

  // ---- Section 8: All checks (exclude #37 synthesis) ----
  const displayChecks = checks.filter(c => c.key !== 'synthesis')

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ==================== 1. HEADER ==================== */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-gray-500 text-sm">{APP_DOMAIN}</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">{meta.domain}</span>
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{meta.companyName}</h1>
            <p className="text-gray-500 text-sm">
              {meta.domain} &middot; {meta.bransch}
              {meta.city ? ` \u00b7 ${meta.city}` : ''}
              {' '}&middot; Analys {meta.scanDate}
            </p>
          </div>
          <div className="bg-gradient-to-r from-amber-100 to-amber-200 border border-amber-600 text-amber-800 rounded-lg px-4 py-2 text-sm font-semibold shrink-0">
            Fullstandig rapport
          </div>
        </div>

        {/* ==================== 2. SCORE CIRCLES ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Sammanfattning</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Free score */}
            <div className="bg-white rounded-lg p-5 text-center">
              <ScoreCircle score={scores.free} label="Gratisanalys" />
            </div>

            {/* Full score — highlighted with amber border */}
            <div className="bg-white rounded-lg p-5 text-center border border-amber-800/40">
              <ScoreCircle score={scores.full} label="Fullstandig poang" highlight />
            </div>

            {/* Google rating */}
            <div className="bg-white rounded-lg p-5 text-center">
              {scores.google !== null ? (
                <>
                  <div className="text-4xl font-bold text-gray-900 mb-1">
                    {scores.google.toFixed(1)}
                  </div>
                  <div className="flex justify-center gap-0.5 mb-1">
                    <span className="text-yellow-700 text-lg">{renderStars(scores.google)}</span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    Google ({scores.googleCount ?? 0} recensioner)
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-gray-300 mb-1">--</div>
                  <p className="text-gray-400 text-xs">Ingen GBP</p>
                </>
              )}
            </div>
          </div>

          {/* ==================== 3. SAMMANFATTNING — Top 3 findings ==================== */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              De 3 viktigaste fynden
            </h3>
            <div className="space-y-2">
              {badChecks.map((check, idx) => {
                const reg = registryByKey.get(check.key)
                const label = reg?.label ?? check.key
                return (
                  <div key={check.key} className="flex gap-3 items-start">
                    <span className="text-red-700 mt-0.5 shrink-0">{idx + 1}.</span>
                    <p className="text-gray-600 text-sm">
                      <strong className="text-gray-900">{label}.</strong> {check.finding}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Estimerad forbattring */}
          <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg p-4">
            <p className="text-emerald-700 font-medium text-sm mb-1">
              Estimerad forbattring efter atgarder
            </p>
            <p className="text-gray-500 text-sm">
              Om alla kritiska och viktiga atgarder genomfors kan er poang ga fran{' '}
              <strong className="text-gray-900">
                {scores.full} till uppskattningsvis {Math.min(100, scores.full + 17)}&ndash;{Math.min(100, scores.full + 22)}
              </strong>
              . Det ar den forbattring som de prioriterade atgarderna kan ge.
            </p>
          </div>
        </div>

        {/* ==================== 4. ATGARDSPLAN ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8" id="atgardsplan">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Atgardsplan</h2>
          <p className="text-gray-400 text-sm mb-5">
            Sorterad efter prioritet. Borja uppifran &mdash; de forsta tre ger storst effekt.
          </p>

          {priorityGroups.map((group) => (
            <div key={group.key} className="mb-6 last:mb-0">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-3 h-3 rounded-full shrink-0 ${group.dotClass}`} />
                <h3 className={`font-semibold text-sm uppercase tracking-wide ${group.labelColor}`}>
                  {group.label} &mdash; {group.sublabel}
                </h3>
              </div>
              <div className="space-y-2">
                {group.items.map((check) => {
                  actionIndex++
                  return (
                    <PriorityCard
                      key={check.key}
                      check={check}
                      index={actionIndex}
                      linkTarget={`#fix-${check.key}`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ==================== 5. DETALJERADE LOSNINGAR ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-amber-700">&#9733;</span>
            <h2 className="text-xl font-bold text-gray-900">Detaljerade losningar</h2>
            <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
              Premiumfunktion
            </span>
          </div>

          {solutionsByCategory.map((cat) => (
            <div key={cat.category}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider pt-4 pb-2">
                {cat.label}
              </h3>
              {cat.items.map((check) => (
                <SolutionCard key={check.key} check={check} />
              ))}
            </div>
          ))}
        </div>

        {/* ==================== 6. KONKURRENTANALYS ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-amber-700">&#9733;</span>
            <h2 className="text-xl font-bold text-gray-900">Konkurrentanalys</h2>
            <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
              Premium
            </span>
          </div>

          {synthesis.competitorNote ? (
            <div
              className="prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(synthesis.competitorNote) }}
            />
          ) : (
            <p className="text-gray-400 text-sm">Ingen konkurrentanalys tillganglig.</p>
          )}
        </div>

        {/* ==================== 7. RECENSIONSANALYS ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-amber-700">&#9733;</span>
            <h2 className="text-xl font-bold text-gray-900">
              Recensionsanalys
              {scores.googleCount !== null ? ` \u2014 ${scores.googleCount} Google-recensioner` : ''}
            </h2>
            <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
              Premium
            </span>
          </div>

          {/* Review reply stats */}
          {reviewReplies.total > 0 ? (
            <div className="bg-white rounded-lg p-4 mb-4 border border-gray-100">
              <p className="text-gray-600 text-sm font-medium mb-3">Recensionssvar</p>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{reviewReplies.total}</div>
                  <p className="text-gray-400 text-xs">Totalt</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{reviewReplies.withReply}</div>
                  <p className="text-gray-400 text-xs">Med svar</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {Math.round(reviewReplies.replyRate * 100)}%
                  </div>
                  <p className="text-gray-400 text-xs">Svarsfrekvens</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    reviewReplies.replyRate >= 0.7 ? 'bg-emerald-500' :
                    reviewReplies.replyRate >= 0.4 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.round(reviewReplies.replyRate * 100)}%` }}
                />
              </div>
              {reviewReplies.sampleNote && (
                <p className="text-gray-400 text-xs mt-2">{reviewReplies.sampleNote}</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 mb-4 border border-gray-100">
              <p className="text-gray-400 text-sm">Inga recensioner hittades att analysera.</p>
            </div>
          )}

          {/* Review analysis markdown */}
          {synthesis.reviewAnalysis ? (
            <div
              className="prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(synthesis.reviewAnalysis) }}
            />
          ) : (
            <p className="text-gray-400 text-sm">Ingen recensionsanalys tillganglig.</p>
          )}
        </div>

        {/* ==================== 8. KONTROLLER ==================== */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">
            Alla {displayChecks.length} kontroller
          </h2>

          {CATEGORY_CONFIG.map(({ category, label }) => (
            <CheckTable
              key={category}
              checks={displayChecks}
              category={category}
              categoryLabel={label}
            />
          ))}
        </div>

        {/* ==================== 9. ORDLISTA ==================== */}
        <Glossary />

        {/* ==================== 10. FOOTER ==================== */}
        <p className="text-center text-gray-400 text-xs pb-8">
          Genererad av {APP_DOMAIN} &middot; Rapport-ID: {meta.scanId} &middot; Data hamtad {meta.scanDate}
        </p>
      </div>
    </div>
  )
}
