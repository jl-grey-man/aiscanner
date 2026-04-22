import { ReportCard as CardComp } from '../components/ReportCard'
import { ScoreBadge } from '../components/ScoreBadge'
import { Progress } from '../components/Progress'
import { CTA } from '../components/CTA'
import type { ReportCard, Summary, AnalysisState } from '../types'

interface Props {
  url: string
  cards: ReportCard[]
  summary: Summary | null
  state: AnalysisState
  error: string | null
  currentStep: string
  progressPct: number
  onReset: () => void
}

export function Report({ url, cards, summary, state, error, currentStep, progressPct, onReset }: Props) {
  return (
    <div className="pt-4">
      {/* URL + Score header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={onReset}
                  className="text-muted hover:text-gray-900 text-sm mb-2 block transition-colors">
            ← Skanna en ny sida
          </button>
          <h2 className="font-medium text-gray-600 truncate max-w-sm text-sm">{url}</h2>
        </div>
        {summary && <ScoreBadge score={summary.score} />}
      </div>

      {/* Progress during scanning */}
      {state === 'scanning' && (
        <Progress
          currentStep={currentStep}
          progressPct={progressPct}
        />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Report cards */}
      <div className="space-y-3">
        {cards.map(card => (
          <CardComp key={card.id} card={card} />
        ))}
      </div>

      {/* Summary when done */}
      {state === 'done' && summary && (
        <div className="mt-8 p-4 bg-surface border border-border rounded-xl text-center shadow-sm">
          <p className="text-gray-600 text-sm">
            {summary.good} bra · {summary.warning} kan förbättras · {summary.bad} saknas
          </p>
        </div>
      )}

      {/* CTA when done */}
      {state === 'done' && summary && <CTA />}
    </div>
  )
}
