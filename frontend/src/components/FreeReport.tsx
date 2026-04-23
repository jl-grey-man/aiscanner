import type { FreeReportData, Check } from '../hooks/useAnalysis'

interface Props {
  data: FreeReportData
  url?: string
}

function ScoreColor({ score }: { score: number }) {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'good') return <span className="text-emerald-500 text-lg">●</span>
  if (status === 'warning') return <span className="text-amber-500 text-lg">●</span>
  return <span className="text-red-500 text-lg">●</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${styles[severity as keyof typeof styles] || styles.low}`}>
      {severity === 'high' ? 'Hög' : severity === 'medium' ? 'Medium' : 'Låg'}
    </span>
  )
}

function CheckRow({ check }: { check: Check }) {
  const isProblem = check.status === 'bad' || check.status === 'warning'
  const hasFix = check.fix && check.fix.trim().length > 0

  return (
    <div className="py-4 border-b border-gray-100 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StatusIcon status={check.status} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Title + Finding */}
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-gray-900">{check.title}</span>
            <span className={`text-xs font-medium shrink-0 ${
              check.status === 'good' ? 'text-emerald-600' :
              check.status === 'warning' ? 'text-amber-600' :
              'text-red-600'
            }`}>
              {check.status === 'good' ? 'Godkänt' : check.status === 'warning' ? 'Kan förbättras' : 'Brist'}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5">{check.finding}</p>

          {/* What / Why — always show for context */}
          {(check.what || check.why) && (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              {check.what && <span>{check.what}</span>}
              {check.what && check.why && <span> · </span>}
              {check.why && <span>{check.why}</span>}
            </p>
          )}

          {/* Fix — inline, no box */}
          {isProblem && hasFix && (
            <div className="mt-2 text-sm text-gray-700">
              <span className="font-semibold">Åtgärd:</span>{' '}
              <span className="whitespace-pre-wrap">{check.fix}</span>
            </div>
          )}
        </div>
      </div>
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
      {/* Dark summary box — UNCHANGED */}
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

        {/* Short Critical Issues + Quick Wins */}
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
          <div className="flex-shrink-0 text-center md:text-left">
            <div className={`text-4xl font-extrabold ${ScoreColor({ score: data.score })}`}>{data.score}</div>
            <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Totalpoäng</div>
          </div>

          <div className="hidden md:block w-px h-16 bg-white/20" />

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

      {/* Detailed Analysis — Phases (SIMPLIFIED) */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-extrabold text-3xl text-gray-900">Detaljerad analys</h3>
          <span className="text-sm text-gray-500 font-semibold bg-gray-100 px-3 py-1 rounded-full">
            {allChecks.length} kontroller
          </span>
        </div>

        {data.phases && data.phases.length > 0 && (
          <div className="space-y-10">
            {data.phases.map((phase) => {
              const phaseGood = phase.checks.filter(c => c.status === 'good').length
              const phaseWarn = phase.checks.filter(c => c.status === 'warning').length
              const phaseBad = phase.checks.filter(c => c.status === 'bad').length

              return (
                <div key={phase.id}>
                  {/* Phase header — no box, just text + progress */}
                  <div className="mb-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg text-gray-900">{phase.label}</h4>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {phaseGood > 0 && <span className="text-emerald-600">{phaseGood} ✅</span>}
                        {phaseWarn > 0 && <span className="text-amber-600">{phaseWarn} ⚠️</span>}
                        {phaseBad > 0 && <span className="text-red-600">{phaseBad} ❌</span>}
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden flex mt-2">
                      <div className="h-full bg-emerald-500" style={{ width: `${(phaseGood / phase.checks.length) * 100}%` }} />
                      <div className="h-full bg-amber-500" style={{ width: `${(phaseWarn / phase.checks.length) * 100}%` }} />
                      <div className="h-full bg-red-500" style={{ width: `${(phaseBad / phase.checks.length) * 100}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{phaseGood} av {phase.checks.length} godkända</p>
                  </div>

                  {/* Checks — flat list, no boxes */}
                  <div className="mt-2">
                    {[...phase.checks]
                      .sort((a, b) => {
                        const order = { bad: 0, warning: 1, good: 2 }
                        return order[a.status] - order[b.status]
                      })
                      .map((check, i) => (
                        <CheckRow key={i} check={check} />
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Critical Issues */}
      {data.criticalIssues && data.criticalIssues.length > 0 && (
        <div className="bg-red-50/60 border border-red-200 rounded-xl p-6">
          <h3 className="font-extrabold text-3xl text-red-900 mb-4">Kritiska brister</h3>
          <div className="space-y-4">
            {data.criticalIssues.map((issue, i) => (
              <div key={i} className="py-3 border-b border-red-200/50 last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={issue.severity} />
                  <span className="font-bold text-gray-900">{issue.title}</span>
                </div>
                <p className="text-sm text-gray-700">{issue.description}</p>
                <p className="text-sm text-gray-800 mt-1">
                  <span className="font-semibold">Åtgärd:</span>{' '}
                  <span className="font-normal">{issue.fix}</span>
                </p>
                {issue.codeExample && issue.codeExample !== 'null' && (
                  <pre className="mt-3 p-3 bg-gray-900 text-green-400 text-xs overflow-auto rounded-lg">
                    {issue.codeExample}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {data.quickWins && data.quickWins.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-6">
          <h3 className="font-extrabold text-3xl text-emerald-900 mb-4">Quick Wins</h3>
          <div className="space-y-4">
            {data.quickWins.map((win, i) => (
              <div key={i} className="py-3 border-b border-emerald-200/50 last:border-b-0">
                <div className="font-bold text-gray-900">{win.title}</div>
                <p className="text-sm text-gray-700 mt-0.5">{win.fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
