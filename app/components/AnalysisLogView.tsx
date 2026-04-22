import { useState } from 'react'
import type { LogEvent } from '@/app/hooks/useAnalysis'

interface Props {
  events: LogEvent[]
}

const CATEGORY_COLORS: Record<string, string> = {
  start: 'text-blue-700 bg-blue-50 border-blue-200',
  fetch: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  discovery: 'text-purple-700 bg-purple-50 border-purple-200',
  extract: 'text-amber-700 bg-amber-50 border-amber-200',
  ai: 'text-rose-700 bg-rose-50 border-rose-200',
  validate: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  fallback: 'text-orange-700 bg-orange-50 border-orange-200',
  gbp: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  phase: 'text-teal-700 bg-teal-50 border-teal-200',
  done: 'text-gray-700 bg-gray-100 border-gray-300',
  scrape: 'text-lime-700 bg-lime-50 border-lime-200',
}

function CategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_COLORS[category] || 'text-gray-600 bg-gray-50 border-gray-200'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${style}`}>
      {category}
    </span>
  )
}

export function AnalysisLogView({ events }: Props) {
  const [open, setOpen] = useState(false)

  if (!events || events.length === 0) return null

  const duration = events.length > 0 ? events[events.length - 1].time : 0

  return (
    <div className="mt-10 border-2 border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📝</span>
          <span className="font-bold text-gray-900">Analyslogg</span>
          <span className="text-xs text-gray-500 font-medium">
            {events.length} händelser · {duration.toFixed(1)}s
          </span>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 bg-white">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((event, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-400 font-mono tabular-nums shrink-0 w-12 text-right pt-0.5">
                  +{event.time.toFixed(2)}s
                </span>
                <CategoryBadge category={event.category} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium">{event.message}</p>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <pre className="mt-1 text-[11px] text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
