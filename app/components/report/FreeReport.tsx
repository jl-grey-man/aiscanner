'use client'

import React from 'react'
import type { ScanResult, CheckResult, CheckRegistryEntry } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'
import { ScoreCircle, PriorityCard, SolutionCard, LockedSection, CheckTable, Glossary } from '@/app/components/report'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREE_CHECKS = CHECK_REGISTRY.filter((r) => r.tier === 'free')

const CATEGORY_CONFIG: { category: string; label: string }[] = [
  { category: 'technical',    label: 'Teknisk grund' },
  { category: 'local',        label: 'Lokal synlighet' },
  { category: 'ai-readiness', label: 'AI-beredskap' },
  { category: 'content',      label: 'Innehåll' },
]

const PRIORITY_GROUPS: {
  priority: NonNullable<CheckResult['priority']>
  title: string
  subtitle: string
  dotClass: string
  titleColor: string
}[] = [
  { priority: 'critical',  title: 'Kritiskt',   subtitle: 'fixa först',              dotClass: 'bg-red-500',   titleColor: 'text-red-700' },
  { priority: 'important', title: 'Viktigt',     subtitle: 'stärker er ytterligare', dotClass: 'bg-amber-500', titleColor: 'text-amber-700' },
  { priority: 'nice',      title: 'Bra att ha',  subtitle: 'finslipar',               dotClass: 'bg-blue-500',  titleColor: 'text-blue-700' },
]

// ---------------------------------------------------------------------------
// Helpers — pure, no side effects
// ---------------------------------------------------------------------------

/** Build a lookup from check key to registry entry */
function buildRegistryMap(): Map<string, CheckRegistryEntry> {
  const m = new Map<string, CheckRegistryEntry>()
  for (const entry of CHECK_REGISTRY) m.set(entry.key, entry)
  return m
}

/** Get the top N checks with status=bad, sorted by weight descending */
function getTopBadChecks(checks: CheckResult[], n: number): CheckResult[] {
  const registryMap = buildRegistryMap()
  return checks
    .filter((c) => c.status === 'bad')
    .sort((a, b) => {
      const wa = registryMap.get(a.key)?.weight.free ?? 0
      const wb = registryMap.get(b.key)?.weight.free ?? 0
      return wb - wa
    })
    .slice(0, n)
}

/** Get only free-tier checks from the scan result */
function getFreeChecks(checks: CheckResult[]): CheckResult[] {
  const freeKeys = new Set(FREE_CHECKS.map((r) => r.key))
  return checks.filter((c) => freeKeys.has(c.key))
}

/** Get checks with a given priority from free-tier only */
function getFreePriorityChecks(
  checks: CheckResult[],
  priority: NonNullable<CheckResult['priority']>,
): CheckResult[] {
  const freeKeys = new Set(FREE_CHECKS.map((r) => r.key))
  return checks.filter(
    (c) => c.priority === priority && freeKeys.has(c.key),
  )
}

/** Get premium checks that have priority set (for locked teasers) */
function getPremiumPriorityChecks(checks: CheckResult[]): CheckResult[] {
  const premiumKeys = new Set(
    CHECK_REGISTRY.filter((r) => r.tier === 'premium').map((r) => r.key),
  )
  return checks.filter(
    (c) => c.priority !== null && premiumKeys.has(c.key),
  )
}

/** Get top N free-tier critical checks that have a fix */
function getTopFreeSolutionChecks(checks: CheckResult[], n: number): CheckResult[] {
  const registryMap = buildRegistryMap()
  const freeKeys = new Set(FREE_CHECKS.map((r) => r.key))
  return checks
    .filter((c) => freeKeys.has(c.key) && c.fix && (c.priority === 'critical' || c.priority === 'important'))
    .sort((a, b) => {
      // critical before important
      const pa = a.priority === 'critical' ? 0 : 1
      const pb = b.priority === 'critical' ? 0 : 1
      if (pa !== pb) return pa - pb
      // then by weight descending
      const wa = registryMap.get(a.key)?.weight.free ?? 0
      const wb = registryMap.get(b.key)?.weight.free ?? 0
      return wb - wa
    })
    .slice(0, n)
}

/** Render star rating as text characters */
function renderStars(rating: number): string {
  const full = Math.floor(rating)
  const half = rating - full >= 0.25 && rating - full < 0.75
  const stars: string[] = []
  for (let i = 0; i < full; i++) stars.push('\u2605')
  if (half) stars.push('\u2605')
  return stars.join('')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreeReport({ scanResult }: { scanResult: ScanResult }): React.JSX.Element {
  const { meta, scores, checks, synthesis } = scanResult
  const freeChecks = getFreeChecks(checks)
  const topBad = getTopBadChecks(freeChecks, 3)
  const topSolutions = getTopFreeSolutionChecks(checks, 2)
  const premiumPriority = getPremiumPriorityChecks(checks)

  // Running counter for priority cards across all groups
  let priorityIndex = 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ==================== 1. HEADER ==================== */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-gray-500 text-sm">analyze.pipod.net</span>
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
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-emerald-700 text-sm font-semibold">
            Gratisanalys
          </div>
        </div>

        {/* ==================== 2. SCORE CIRCLES ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Sammanfattning</h2>

          <div className={`grid ${scores.google !== null ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
            {/* Free score — full color */}
            <div className="bg-white rounded-lg p-5 text-center">
              <ScoreCircle score={scores.free} label="Gratisanalys" />
            </div>

            {/* Full score — LOCKED */}
            <div className="bg-white rounded-lg p-5 text-center border border-amber-800/40 relative">
              <div className="blur-sm opacity-50 pointer-events-none select-none">
                <ScoreCircle score={scores.full} label="Fullständig poäng" highlight />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="w-6 h-6 text-amber-500 mb-1"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-2xl font-bold text-gray-300">?</span>
                <p className="text-amber-700 text-xs font-medium mt-1">Fullständig poäng</p>
              </div>
            </div>

            {/* Google rating (if available) */}
            {scores.google !== null && (
              <div className="bg-white rounded-lg p-5 text-center">
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {scores.google.toFixed(1)}
                </div>
                <div className="flex justify-center gap-0.5 mb-1">
                  <span className="text-yellow-700 text-lg">{renderStars(scores.google)}</span>
                </div>
                <p className="text-gray-400 text-xs">
                  Google{scores.googleCount !== null ? ` (${scores.googleCount} recensioner)` : ''}
                </p>
              </div>
            )}
          </div>

          {/* ==================== 3. SAMMANFATTNING ==================== */}
          {topBad.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                De {topBad.length} viktigaste fynden
              </h3>
              <div className="space-y-2">
                {topBad.map((check, i) => {
                  const reg = CHECK_REGISTRY.find((e) => e.key === check.key)
                  const label = reg?.label ?? check.key
                  return (
                    <div key={check.key} className="flex gap-3 items-start">
                      <span className="text-red-700 mt-0.5 shrink-0">{i + 1}.</span>
                      <p className="text-gray-600 text-sm">
                        <strong className="text-gray-900">{label}.</strong>{' '}
                        {check.finding}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Estimerad förbättring */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-emerald-700 font-medium text-sm mb-1">
              Estimerad förbättring efter åtgärder
            </p>
            <p className="text-gray-500 text-sm">
              Om alla kritiska och viktiga åtgärder genomförs kan er AI-synlighetspoäng förbättras avsevärt.
              Den fullständiga rapporten innehåller en detaljerad uppskattning med konkurrentjämförelse.
            </p>
          </div>
        </div>

        {/* ==================== 4. ÅTGÄRDSPLAN ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8" id="atgardsplan">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Åtgärdsplan</h2>
          <p className="text-gray-400 text-sm mb-5">
            Sorterad efter prioritet. Börja uppifrån &mdash; de första åtgärderna ger störst effekt.
          </p>

          {PRIORITY_GROUPS.map((group) => {
            const groupChecks = getFreePriorityChecks(checks, group.priority)
            if (groupChecks.length === 0) return null

            return (
              <div key={group.priority} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-3 h-3 ${group.dotClass} rounded-full shrink-0`} />
                  <h3 className={`${group.titleColor} font-semibold text-sm uppercase tracking-wide`}>
                    {group.title} &mdash; {group.subtitle}
                  </h3>
                </div>
                <div className="space-y-2">
                  {groupChecks.map((check) => {
                    priorityIndex++
                    return (
                      <PriorityCard
                        key={check.key}
                        check={check}
                        index={priorityIndex}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Premium locked teasers */}
          {premiumPriority.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="w-4 h-4 text-amber-500"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-amber-600 text-xs font-medium">
                  + {premiumPriority.length} premiumåtgärder i fullständig rapport
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ==================== 5. DETALJERADE LÖSNINGAR — LÅST ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Detaljerade lösningar</h2>

          {/* Show 2 solution cards, slightly faded */}
          {topSolutions.length > 0 && (
            <div className="opacity-60 pointer-events-none select-none mb-4">
              {topSolutions.map((check) => (
                <SolutionCard key={check.key} check={check} />
              ))}
            </div>
          )}

          {/* Lock overlay */}
          <div className="relative border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex flex-col items-center justify-center py-10 bg-white/90 backdrop-blur-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-8 h-8 text-amber-500 mb-3"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-gray-700 font-medium text-sm max-w-xs text-center mb-3">
                Lås upp alla lösningar med steg-för-steg-instruktioner och kodexempel
              </p>
              <button
                type="button"
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                Lås upp alla lösningar — 499 kr
              </button>
            </div>
          </div>
        </div>

        {/* ==================== 6. KONTROLLER ==================== */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">
            Alla {freeChecks.length} kontroller
          </h2>
          {CATEGORY_CONFIG.map(({ category, label }) => (
            <CheckTable
              key={category}
              checks={freeChecks}
              category={category}
              categoryLabel={label}
            />
          ))}
        </div>

        {/* ==================== 7. ORDLISTA ==================== */}
        <Glossary />

        {/* ==================== 8. KONKURRENTANALYS — LÅST ==================== */}
        <LockedSection title="Konkurrentanalys" ctaText="Lås upp konkurrentanalys med fullständig rapport — 499 kr">
          <p className="text-gray-500 text-sm mb-4">
            Vi jämför er AI-synlighet med era tre största konkurrenter baserat på samma kontroller.
            Se vem som leder, var ni ligger efter, och exakt vad som krävs för att gå om.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="text-gray-400 text-sm w-6 text-center font-bold">1</div>
              <div className="flex-1">
                <p className="text-gray-900 text-sm font-medium">Konkurrent A</p>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '82%' }} />
                </div>
              </div>
              <span className="text-emerald-700 font-bold">82</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="text-gray-400 text-sm w-6 text-center font-bold">2</div>
              <div className="flex-1">
                <p className="text-gray-900 text-sm font-medium">Konkurrent B</p>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '71%' }} />
                </div>
              </div>
              <span className="text-emerald-700 font-bold">71</span>
            </div>
          </div>
        </LockedSection>

        {/* ==================== 9. RECENSIONSANALYS — LÅST ==================== */}
        <LockedSection title="Recensionsanalys" ctaText="Lås upp recensionsanalys med fullständig rapport — 499 kr">
          <p className="text-gray-500 text-sm mb-3">
            AI-sökmotorer som ChatGPT läser era Google-recensioner för att bedöma er tjänstekvalitet.
            Den fullständiga rapporten analyserar era recensioner, identifierar nyckelord och ger konkreta
            rekommendationer för att stärka er profil.
          </p>
          <div className="bg-white rounded-lg p-4">
            <p className="text-gray-600 text-sm font-medium mb-2">Vad ingår</p>
            <ul className="text-gray-500 text-sm space-y-1 list-disc list-inside">
              <li>Analys av recensionssvar och svarsfrekvens</li>
              <li>Nyckelord som AI extraherar från recensionerna</li>
              <li>Konkreta tips för att öka antal recensioner</li>
            </ul>
          </div>
        </LockedSection>

        {/* ==================== 10. FOOTER ==================== */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Vill du ha den fullständiga rapporten?
          </h2>
          <p className="text-gray-500 text-sm mb-4 max-w-lg mx-auto">
            Den fullständiga rapporten innehåller detaljerade lösningar med kodexempel,
            konkurrentanalys, recensionsanalys och en prioriterad åtgärdsplan.
          </p>
          <button
            type="button"
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            Beställ fullständig analys — 499 kr
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs pb-8">
          Genererad av analyze.pipod.net &middot; Rapport-ID: {meta.scanId} &middot; Data hämtad {meta.scanDate}
        </p>
      </div>
    </div>
  )
}

export default FreeReport
