import type { PremiumReportData } from '@/app/hooks/useAnalysis'

interface Props {
  data: PremiumReportData
}

function ScoreColor({ score }: { score: number }) {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

export function FullReport({ data }: Props) {
  return (
    <div className="mt-10 space-y-10 border-t-4 border-accent pt-10">
      {/* Score */}
      <div className="p-6 bg-accent/5 border border-accent/15 rounded-xl">
        <h2 className={`text-3xl font-bold mb-2 ${ScoreColor({ score: data.score })}`}>
          Lokal AI-Dominans: {data.score}/100
        </h2>
        <p className="text-gray-700 leading-relaxed">{data.summary}</p>
      </div>

      {/* NAP Consistency */}
      {data.napConsistency && (
        <div>
          <h3 className="font-bold text-lg mb-4">
            NAP-konsistens ({data.napConsistency.score}/10)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 bg-frame border border-border rounded-xl">
              <div className="font-semibold text-accent mb-2">Webbsida</div>
              <div>{data.napConsistency.websiteNap?.name || '—'}</div>
              <div className="text-muted">{data.napConsistency.websiteNap?.address || '—'}</div>
              <div className="text-muted">{data.napConsistency.websiteNap?.phone || '—'}</div>
            </div>
            <div className="p-4 bg-frame border border-border rounded-xl">
              <div className="font-semibold text-accent mb-2">Google</div>
              <div>{data.napConsistency.googleNap?.name || '—'}</div>
              <div className="text-muted">{data.napConsistency.googleNap?.address || '—'}</div>
              <div className="text-muted">{data.napConsistency.googleNap?.phone || '—'}</div>
            </div>
          </div>
          {data.napConsistency.issues?.map((issue: string, i: number) => (
            <div key={i} className="mt-2 text-red-600 text-sm">⚠️ {issue}</div>
          ))}
        </div>
      )}

      {/* GBP Analysis */}
      {data.gbpAnalysis && (
        <div>
          <h3 className="font-bold text-lg mb-4">
            Google Business Profile ({data.gbpAnalysis.score}/10)
          </h3>
          <div className="space-y-2 text-sm">
            {data.gbpAnalysis.strengths?.length > 0 && (
              <div className="text-emerald-700">✅ {data.gbpAnalysis.strengths.join(', ')}</div>
            )}
            {data.gbpAnalysis.weaknesses?.length > 0 && (
              <div className="text-red-600">❌ {data.gbpAnalysis.weaknesses.join(', ')}</div>
            )}
          </div>
        </div>
      )}

      {/* Reviews */}
      {data.reviewAnalysis && (
        <div>
          <h3 className="font-bold text-lg mb-4">
            Recensioner ({data.reviewAnalysis.score}/10)
          </h3>
          <div className="text-sm space-y-1">
            <div>
              {data.reviewAnalysis.totalReviews} recensioner, snitt {data.reviewAnalysis.avgRating}
            </div>
            <div>Sentiment: {data.reviewAnalysis.sentiment}</div>
            {data.reviewAnalysis.divergenceWarning && (
              <div className="text-red-600 mt-1">{data.reviewAnalysis.divergenceWarning}</div>
            )}
          </div>
        </div>
      )}

      {/* Competitors */}
      {data.competitorComparison && data.competitorComparison.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-4">Konkurrenter</h3>
          <div className="space-y-3">
            {data.competitorComparison.map((comp, i) => (
              <div key={i} className="p-4 bg-frame border border-border rounded-xl">
                <div className="font-semibold">
                  {comp.name} — {comp.score}/100
                </div>
                <div className="text-sm text-muted mt-1">{comp.whyTheyWin}</div>
                <div className="text-sm text-red-600 mt-1">{comp.yourGap}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tailored Fixes */}
      {data.tailoredFixes && data.tailoredFixes.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-4">Din handlingsplan</h3>
          <div className="space-y-4">
            {data.tailoredFixes.map((fix, i) => (
              <div key={i} className="p-4 bg-frame border-l-4 border-accent rounded-r-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-accent text-white text-xs px-2 py-1 rounded font-semibold">
                    #{fix.priority}
                  </span>
                  <span className="font-semibold">{fix.title}</span>
                  <span className="text-xs bg-base px-2 py-1 rounded border border-border">
                    {fix.expectedImpact} effekt
                  </span>
                </div>
                <div className="text-sm mt-2">{fix.action}</div>
                {fix.code && (
                  <pre className="mt-3 p-3 bg-gray-800 text-green-400 text-xs overflow-auto rounded-lg">
                    {fix.code}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
