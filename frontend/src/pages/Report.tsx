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
  onReset: () => void
}

export function Report({ url, cards, summary, state, error, onReset }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={onReset}
                  className="text-slate-500 hover:text-slate-300 text-sm mb-2 block transition-colors">
            ← Skanna en ny sida
          </button>
          <h2 className="font-medium text-slate-300 truncate max-w-sm text-sm">{url}</h2>
        </div>
        {summary && <ScoreBadge score={summary.score} />}
      </div>

      {state === 'scanning' && <Progress current={cards.length} />}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {cards.map(card => (
          <CardComp key={card.id} card={card} />
        ))}
      </div>

      {state === 'done' && summary && (
        <div className="mt-8 p-4 bg-surface border border-border rounded-xl text-center">
          <p className="text-slate-400 text-sm">
            {summary.good} bra · {summary.warning} kan förbättras · {summary.bad} saknas
          </p>
        </div>
      )}

      {state === 'done' && summary && <CTA />}
    </div>
  )
}
