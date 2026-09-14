'use client'

import React from 'react'
import type { ScanResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY, maxAchievableScore, calculateScores } from '@/app/lib/scanResult'
import ScoreCircle from './ScoreCircle'
import PriorityCard from './PriorityCard'
import SolutionCard from './SolutionCard'
import CheckTable from './CheckTable'
import Glossary from './Glossary'
import { renderMarkdown } from './RichMarkdown'
import { APP_DOMAIN } from '@/app/lib/config'
import {
  buildNapRows,
  napConsistencyLabel,
  napConsistencyColor,
  entityKnowsLabel,
  categoryMentionedLabel,
} from '@/app/lib/reportDisplay'

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
  { category: 'content', label: 'Innehåll' },
  { category: 'ai-test', label: 'AI-synlighetstest' },
  { category: 'gbp', label: 'Google Business Profile' },
]

const SOLUTION_CATEGORY_CONFIG: { category: string; label: string }[] = [
  { category: 'technical', label: 'Teknisk grund' },
  { category: 'local', label: 'Lokal synlighet' },
  { category: 'ai-readiness', label: 'AI-beredskap' },
  { category: 'content', label: 'Innehåll' },
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
  { key: 'critical', label: 'Kritiskt', sublabel: 'fixa först', dotClass: 'bg-red-500', labelColor: 'text-red-700' },
  { key: 'important', label: 'Viktigt', sublabel: 'stärker er ytterligare', dotClass: 'bg-amber-500', labelColor: 'text-amber-700' },
  // 'nice' utelämnad avsiktligt — backend sätter aldrig priority:'nice' (se
  // scanResult.ts), gruppen renderade alltid tom. Typen behålls i schemat.
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PremiumReport({ scanResult }: { scanResult: ScanResult }): React.JSX.Element {
  const { meta, scores, checks, synthesis, reviewReplies, reviewInsights, gbp, directories, aiMentions } = scanResult

  // Build a registry lookup for weights
  const registryByKey = new Map(CHECK_REGISTRY.map(e => [e.key, e]))

  // NAP-tabell: en rad per katalog som kontrollerats (Eniro, Hitta, …)
  const napRows = buildNapRows(directories.directories)

  // Deterministisk förbättringsprognos — samma viktlogik som calculateScores,
  // räknar om fullpoängen som om alla bad/warning-checks åtgärdats till ok.
  const achievableScore = maxAchievableScore(checks)

  // Mät-täckning: hur många av de poängsatta checkarna som faktiskt gick att
  // mäta i denna scan (t.ex. ett AI-anrop som misslyckades → notMeasured).
  const { measured: checksMeasured, total: checksTotal } = calculateScores(checks)

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

  // ---- Section 5: Solutions — bara checks som behöver fixas (bad/warning) ----
  // OK-checks ska INTE visas här, även om de råkar ha en fix-text.
  const checksWithFix = checks.filter(c =>
    c.key !== 'synthesis' &&
    (c.status === 'bad' || c.status === 'warning') &&
    c.fix !== null
  )

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
            Fullständig rapport
          </div>
        </div>

        {/* ==================== 2. SAMMANFATTNING (Pro-genererad, företagsspecifik) ==================== */}
        {synthesis.summary && (
          <div className="bg-white border border-amber-200 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-600">&#9733;</span>
              <h2 className="text-xl font-bold text-gray-900">Sammanfattning</h2>
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Skräddarsydd för er
              </span>
            </div>
            <p className="text-gray-700 text-base leading-relaxed">{synthesis.summary}</p>
          </div>
        )}

        {/* ==================== 3. POÄNG ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Poäng och nyckeltal</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Free score */}
            <div className="bg-white rounded-lg p-5 text-center">
              <ScoreCircle score={scores.free} label="Gratisanalys" />
            </div>

            {/* Full score — highlighted with amber border */}
            <div className="bg-white rounded-lg p-5 text-center border border-amber-800/40">
              <ScoreCircle score={scores.full} label="Fullständig poäng" highlight />
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

          {checksMeasured < checksTotal && (
            <p className="text-xs text-gray-400 text-center -mt-2 mb-5">
              Baserat på {checksMeasured} av {checksTotal} kontroller
            </p>
          )}

          {/* De 3 viktigaste fynden */}
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

          {/* Förbättringsprognos */}
          {achievableScore > scores.full && (
            <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg p-4">
              <p className="text-emerald-700 font-medium text-sm mb-1">
                Förbättringsprognos
              </p>
              <p className="text-gray-500 text-sm">
                Om alla åtgärder genomförs kan er poäng nå upp till{' '}
                <strong className="text-gray-900">{achievableScore}</strong>.
              </p>
            </div>
          )}
        </div>

        {/* ==================== 4. ÅTGÄRDSPLAN ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8" id="atgardsplan">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-bold text-gray-900">Åtgärdsplan</h2>
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Skräddarsydd för er
            </span>
          </div>
          <p className="text-gray-400 text-sm mb-5">
            Vår AI-analys av just er webbplats, i prioritetsordning.
          </p>

          {synthesis.actionPlan ? (
            <div
              className="prose-sm mb-6"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(synthesis.actionPlan) }}
            />
          ) : (
            <p className="text-gray-400 text-sm mb-6">Ingen åtgärdsplan tillgänglig.</p>
          )}

          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Snabböversikt &mdash; hoppa direkt till lösningen
            </h3>
            {priorityGroups.map((group) => (
              <div key={group.key} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${group.dotClass}`} />
                  <h4 className={`font-semibold text-sm uppercase tracking-wide ${group.labelColor}`}>
                    {group.label} &mdash; {group.sublabel}
                  </h4>
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
        </div>

        {/* ==================== 5. DETALJERADE LÖSNINGAR ==================== */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-amber-600">&#9733;</span>
            <h2 className="text-2xl font-bold text-gray-900">Detaljerade lösningar</h2>
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Premiumrapport
            </span>
          </div>

          {solutionsByCategory.map((cat) => (
            <div key={cat.category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {cat.label}
              </h3>
              {cat.items.map((check) => (
                <SolutionCard key={check.key} check={check} unlocked />
              ))}
            </div>
          ))}
        </div>

        {/* ==================== 6. AI-TESTETS SVAR ==================== */}
        {aiMentions && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-700">&#9733;</span>
              <h2 className="text-xl font-bold text-gray-900">AI-testets svar</h2>
              <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
                Premium
              </span>
            </div>
            <p className="text-gray-400 text-sm mb-5">
              Så här svarade en AI-assistent när vi frågade om er &mdash; ordagrant, ingen tolkning.
            </p>

            <div className="mb-6">
              <span
                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 ${
                  aiMentions.entityKnows
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}
              >
                {entityKnowsLabel(aiMentions)}
              </span>
              <p className="text-gray-500 text-xs mb-1">Vi frågade:</p>
              <p className="text-gray-700 text-sm italic mb-3">&rdquo;{aiMentions.entityQuery}&rdquo;</p>
              <p className="text-gray-500 text-xs mb-1">AI svarade:</p>
              <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-600 text-sm whitespace-pre-line">
                {aiMentions.entityResponse}
              </blockquote>
            </div>

            <div>
              <span
                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 ${
                  aiMentions.categoryMentioned
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}
              >
                {categoryMentionedLabel(aiMentions.categoryMentioned)}
              </span>
              <p className="text-gray-500 text-xs mb-1">Vi frågade:</p>
              <p className="text-gray-700 text-sm italic mb-3">&rdquo;{aiMentions.categoryQuery}&rdquo;</p>
              <p className="text-gray-500 text-xs mb-1">AI svarade:</p>
              <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-600 text-sm whitespace-pre-line">
                {aiMentions.categoryResponse}
              </blockquote>
            </div>
          </div>
        )}

        {/* ==================== 7. GOOGLE BUSINESS PROFILE ==================== */}
        {gbp && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-amber-700">&#9733;</span>
              <h2 className="text-xl font-bold text-gray-900">Google Business Profile</h2>
              <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
                Premium
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-gray-400 text-xs mb-1">Betyg</p>
                <p className="text-gray-900 font-semibold">
                  {gbp.rating != null ? gbp.rating.toFixed(1) : '—'}
                  {gbp.rating != null && (
                    <span className="text-yellow-700 ml-1 text-sm">{renderStars(gbp.rating)}</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Antal recensioner</p>
                <p className="text-gray-900 font-semibold">{gbp.userRatingCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Kategori</p>
                <p className="text-gray-900 font-semibold capitalize">{meta.bransch}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Telefon</p>
                <p className="text-gray-900 font-semibold">{gbp.phone ?? '—'}</p>
              </div>
            </div>

            {gbp.address && (
              <p className="text-gray-600 text-sm mb-4">{gbp.address}</p>
            )}

            {gbp.weekdayDescriptions && gbp.weekdayDescriptions.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                  Öppettider
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {gbp.weekdayDescriptions.map((line) => (
                    <p key={line} className="text-gray-600 text-sm">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== 8. NAP-KONSISTENS PER KATALOG ==================== */}
        {napRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-700">&#9733;</span>
              <h2 className="text-xl font-bold text-gray-900">NAP-konsistens per katalog</h2>
              <span className="text-xs bg-amber-50/50 text-amber-600 px-2 py-0.5 rounded-full">
                Premium
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${napConsistencyColor(directories.napConsistency.consistent)}`}
              >
                {napConsistencyLabel(directories.napConsistency.consistent)}
              </span>
              <p className="text-gray-400 text-xs">{directories.napConsistency.finding}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Katalog</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Adress (extraherad)</th>
                    <th className="py-2 font-medium">Telefon (extraherad)</th>
                  </tr>
                </thead>
                <tbody>
                  {napRows.map((row) => (
                    <tr key={row.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 text-gray-900 font-medium">
                        {row.profileUrl ? (
                          <a
                            href={row.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-700 hover:underline"
                          >
                            {row.name}
                          </a>
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            row.found ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'
                          }`}
                        >
                          {row.found ? 'Hittad' : 'Ej hittad'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{row.address ?? '—'}</td>
                      <td className="py-2 text-gray-600">{row.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 9. KONKURRENTANALYS ==================== */}
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
            <p className="text-gray-400 text-sm">Ingen konkurrentanalys tillgänglig.</p>
          )}
        </div>

        {/* ==================== 10. RECENSIONSANALYS ==================== */}
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

          {/* Recensionssvar — Audit #3: Google Places API (New) har inget fält för
              ägarsvar, en svarsfrekvens går därför aldrig att mäta härifrån. */}
          <div className="bg-white rounded-lg p-4 mb-4 border border-gray-100">
            <p className="text-gray-600 text-sm font-medium mb-1">Recensionssvar</p>
            <p className="text-gray-400 text-sm">{reviewReplies.finding}</p>
          </div>

          {/* Recensionsinsikter — grundade teman/citat ur de faktiska recensionerna,
              varje citat verifierat ordagrant mot originaltexten (Audit #9). */}
          {reviewInsights && (reviewInsights.themes.length > 0 || reviewInsights.praise.length > 0 || reviewInsights.complaints.length > 0) ? (
            <div className="bg-white rounded-lg p-4 mb-4 border border-gray-100">
              <p className="text-gray-600 text-sm font-medium mb-3">Vad kunderna säger</p>

              {reviewInsights.themes.length > 0 && (
                <div className="space-y-2 mb-3">
                  {reviewInsights.themes.map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        t.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                        t.sentiment === 'negative' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {t.theme}
                      </span>
                      <p className="text-gray-500 text-sm italic">&ldquo;{t.quote}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}

              {reviewInsights.praise.length > 0 && (
                <div className="mb-2">
                  <p className="text-gray-500 text-xs font-medium mb-1">Beröm</p>
                  <ul className="text-gray-600 text-sm list-disc list-inside space-y-0.5">
                    {reviewInsights.praise.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {reviewInsights.complaints.length > 0 && (
                <div className="mb-2">
                  <p className="text-gray-500 text-xs font-medium mb-1">Klagomål</p>
                  <ul className="text-gray-600 text-sm list-disc list-inside space-y-0.5">
                    {reviewInsights.complaints.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {reviewInsights.sampleNote && (
                <p className="text-gray-400 text-xs mt-2">{reviewInsights.sampleNote}</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 mb-4 border border-gray-100">
              <p className="text-gray-400 text-sm">Ingen recensionsanalys av innehållet tillgänglig.</p>
            </div>
          )}

          {/* Review analysis markdown */}
          {synthesis.reviewAnalysis ? (
            <div
              className="prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(synthesis.reviewAnalysis) }}
            />
          ) : (
            <p className="text-gray-400 text-sm">Ingen recensionsanalys tillgänglig.</p>
          )}
        </div>

        {/* ==================== 11. KONTROLLER ==================== */}
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

        {/* ==================== 12. ORDLISTA ==================== */}
        <Glossary />

        {/* ==================== 13. FOOTER ==================== */}
        <p className="text-center text-gray-400 text-xs pb-8">
          Genererad av {APP_DOMAIN} &middot; Rapport-ID: {meta.scanId} &middot; Data hämtad {meta.scanDate}
        </p>
      </div>
    </div>
  )
}
