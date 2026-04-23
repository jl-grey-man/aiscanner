'use client'

import { useState } from 'react'
import type { FreeReportData, Check } from '@/app/hooks/useAnalysis'

interface Props {
  data: FreeReportData
  url?: string
}

function ScoreColor({ score }: { score: number }) {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${styles[severity as keyof typeof styles] || styles.low}`}>
      {severity === 'high' ? 'Hög' : severity === 'medium' ? 'Medium' : 'Låg'}
    </span>
  )
}

function CheckCard({ check }: { check: Check }) {
  const [open, setOpen] = useState(check.status !== 'good')
  const hasDetails = check.fix && check.fix.trim().length > 0

  const borderColor =
    check.status === 'good' ? 'border-l-emerald-500' :
    check.status === 'warning' ? 'border-l-amber-500' :
    'border-l-red-500'

  const bgColor =
    check.status === 'good' ? 'bg-white' :
    check.status === 'warning' ? 'bg-amber-50' :
    'bg-red-50'

  const isProblem = check.status === 'bad' || check.status === 'warning'

  return (
    <div className={`border border-gray-200 ${borderColor} border-l-4 rounded-r-lg shadow-sm ${bgColor}`}>
      <div
        className={`p-4 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails ? setOpen(o => !o) : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-gray-900">{check.title}</span>
              {check.status === 'good' && <span className="text-emerald-600 text-sm">✅</span>}
              {check.status === 'warning' && <span className="text-amber-600 text-sm">⚠️</span>}
              {check.status === 'bad' && <span className="text-red-600 text-sm">❌</span>}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed font-medium">{check.finding}</p>

            {/* Why it matters for problems */}
            {isProblem && check.why && (
              <div className="mt-3">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="font-bold text-gray-700">Varför det spelar roll:</span> {check.why}
                </p>
              </div>
            )}
          </div>
          {hasDetails && (
            <span className="text-gray-400 text-sm ml-2 shrink-0 mt-0.5">
              {open ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {open && hasDetails && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-accent mb-2">
              {check.status === 'good' ? 'Bra jobbat' : 'Åtgärd'}
            </h4>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{check.fix}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function FreeReport({ data, url }: Props) {
  const allChecks = data.phases?.flatMap(p => p.checks) || []
  const goodCount = allChecks.filter(c => c.status === 'good').length
  const warningCount = allChecks.filter(c => c.status === 'warning').length
  const badCount = allChecks.filter(c => c.status === 'bad').length

  const totalChecks = allChecks.length
  const goodPct = totalChecks ? Math.round((goodCount / totalChecks) * 100) : 0
  const warningPct = totalChecks ? Math.round((warningCount / totalChecks) * 100) : 0
  const badPct = totalChecks ? Math.round((badCount / totalChecks) * 100) : 0

  return (
    <div className="space-y-10">
      {/* Dark summary box */}
      <div className="bg-gray-900 text-white rounded-xl p-6 md:p-8 shadow-lg">
        {/* Badge */}
        <div className="text-center mb-5">
          <span className="inline-block bg-accent/20 text-accent text-xs font-bold tracking-wide uppercase px-4 py-1.5 rounded-full border border-accent/40">
            {url ? `ANALYS: ${url.replace(/^https?:\/\//, '')}` : 'ANALYS'}
          </span>
        </div>

        {/* Score */}
        <div className="text-center mb-4">
          <h2 className={`text-5xl font-extrabold ${ScoreColor({ score: data.score })}`}>
            {data.score}/100
          </h2>
        </div>

        {/* Summary text */}
        <p className="text-center text-gray-300 leading-relaxed max-w-2xl mx-auto font-medium mb-8">
          {data.summary}
        </p>

        {/* Short Critical Issues + Quick Wins — inside dark box, side by side */}
        {(data.criticalIssues?.length > 0 || data.quickWins?.length > 0) && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {data.criticalIssues && data.criticalIssues.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-red-400 mb-2">Kritiska brister</div>
                <div className="space-y-2">
                  {data.criticalIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                        issue.severity === 'high' ? 'bg-red-400' : issue.severity === 'medium' ? 'bg-amber-400' : 'bg-blue-400'
                      }`} />
                      <div>
                        <span className="text-sm font-semibold text-gray-200">{issue.title}</span>
                        <p className="text-xs text-gray-400 leading-relaxed">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.quickWins && data.quickWins.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-400 mb-2">Quick Wins</div>
                <div className="space-y-2">
                  {data.quickWins.map((win, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <div>
                        <span className="text-sm font-semibold text-gray-200">{win.title}</span>
                        <p className="text-xs text-gray-400 leading-relaxed">{win.fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/20 mb-6" />

        {/* Numbers row */}
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Big score */}
          <div className="flex-shrink-0 text-center md:text-left">
            <div className={`text-4xl font-extrabold ${ScoreColor({ score: data.score })}`}>{data.score}</div>
            <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Totalpoäng</div>
          </div>

          <div className="hidden md:block w-px h-16 bg-white/20" />

          {/* Status counts */}
          <div className="flex-1 grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-extrabold text-emerald-400">{goodCount}</div>
              <div className="text-xs text-emerald-300 font-semibold">Godkänt ✅</div>
              <div className="text-xs text-gray-400 font-medium">{goodPct}%</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-amber-400">{warningCount}</div>
              <div className="text-xs text-amber-300 font-semibold">Kan förbättras ⚠️</div>
              <div className="text-xs text-gray-400 font-medium">{warningPct}%</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-red-400">{badCount}</div>
              <div className="text-xs text-red-300 font-semibold">Brist ❌</div>
              <div className="text-xs text-gray-400 font-medium">{badPct}%</div>
            </div>
          </div>

          <div className="hidden md:block w-px h-16 bg-white/20" />

          {/* Category scores */}
          <div className="flex-shrink-0 grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(data.categories).map(([key, cat]) => {
              const scorePct = cat.score * 10
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-semibold">{cat.label}:</span>
                  <span className={`text-sm font-extrabold ${ScoreColor({ score: scorePct })}`}>{cat.score}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Detailed Analysis — Phases */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-extrabold text-2xl text-gray-900">Detaljerad analys</h3>
          <span className="text-sm text-gray-500 font-semibold bg-gray-100 px-3 py-1 rounded-full">
            {allChecks.length} kontroller
          </span>
        </div>

        {data.phases && data.phases.length > 0 && (
          <div className="space-y-8">
            {data.phases.map((phase) => {
              const phaseGood = phase.checks.filter(c => c.status === 'good').length
              const phaseWarn = phase.checks.filter(c => c.status === 'warning').length
              const phaseBad = phase.checks.filter(c => c.status === 'bad').length

              return (
                <div key={phase.id} className="bg-white border-2 border-gray-200 rounded-xl shadow-md overflow-hidden">
                  {/* Phase header */}
                  <div className="px-6 py-5 bg-gray-50 border-b-2 border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-xl text-gray-900">{phase.label}</span>
                      <div className="flex items-center gap-3 text-sm font-bold">
                        {phaseGood > 0 && <span className="text-emerald-700 bg-emerald-100 px-2 py-1 rounded">{phaseGood} ✅</span>}
                        {phaseWarn > 0 && <span className="text-amber-700 bg-amber-100 px-2 py-1 rounded">{phaseWarn} ⚠️</span>}
                        {phaseBad > 0 && <span className="text-red-700 bg-red-100 px-2 py-1 rounded">{phaseBad} ❌</span>}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${(phaseGood / phase.checks.length) * 100}%` }} />
                      <div className="h-full bg-amber-500" style={{ width: `${(phaseWarn / phase.checks.length) * 100}%` }} />
                      <div className="h-full bg-red-500" style={{ width: `${(phaseBad / phase.checks.length) * 100}%` }} />
                    </div>
                    <div className="text-sm text-gray-500 mt-2 font-semibold">
                      {phaseGood} av {phase.checks.length} godkända
                    </div>
                  </div>

                  {/* Checks */}
                  <div className="p-5 space-y-4">
                    {[...phase.checks]
                      .sort((a, b) => {
                        const order = { bad: 0, warning: 1, good: 2 }
                        return order[a.status] - order[b.status]
                      })
                      .map((check, i) => (
                        <CheckCard key={i} check={check} />
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Full Critical Issues */}
      {data.criticalIssues && data.criticalIssues.length > 0 && (
        <div>
          <h3 className="font-extrabold text-2xl text-gray-900 mb-5">Kritiska brister</h3>
          <div className="space-y-4">
            {data.criticalIssues.map((issue, i) => (
              <div key={i} className="p-5 border-l-8 border-red-600 bg-red-50 rounded-r-xl shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <SeverityBadge severity={issue.severity} />
                  <span className="font-bold text-gray-900 text-lg">{issue.title}</span>
                </div>
                <div className="text-sm text-gray-800 mt-2 leading-relaxed">{issue.description}</div>
                <div className="text-sm mt-3 font-semibold text-gray-900">
                  Åtgärd: <span className="font-normal">{issue.fix}</span>
                </div>
                {issue.codeExample && issue.codeExample !== 'null' && (
                  <pre className="mt-4 p-4 bg-gray-900 text-green-400 text-sm overflow-auto rounded-lg border-2 border-gray-700">
                    {issue.codeExample}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Quick Wins */}
      {data.quickWins && data.quickWins.length > 0 && (
        <div>
          <h3 className="font-extrabold text-2xl text-gray-900 mb-5">Quick Wins</h3>
          <div className="space-y-3">
            {data.quickWins.map((win, i) => (
              <div key={i} className="p-5 bg-emerald-50 border-l-8 border-emerald-500 rounded-r-xl shadow-md">
                <div className="font-bold text-gray-900 text-lg">{win.title}</div>
                <div className="text-sm text-gray-800 mt-1 leading-relaxed">{win.fix}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
