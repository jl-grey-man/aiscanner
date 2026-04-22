import { useState } from 'react'
import type { ReportCard as CardType } from '../types'

const STATUS = {
  good:    { icon: '✅', label: 'Bra',              bg: 'bg-emerald-50 border-emerald-200', accent: 'text-emerald-700' },
  warning: { icon: '⚠️', label: 'Kan förbättras',  bg: 'bg-amber-50 border-amber-200', accent: 'text-amber-700' },
  bad:     { icon: '❌', label: 'Saknas eller fel', bg: 'bg-red-50 border-red-200', accent: 'text-red-700' },
}

interface Props { card: CardType }

export function ReportCard({ card }: Props) {
  const [open, setOpen] = useState(false)
  const s = STATUS[card.status]
  const hasMore = card.fix || card.details?.length || card.why

  return (
    <div className={`border rounded-xl transition-all shadow-sm ${s.bg}`}>
      <div
        className={`p-5 ${hasMore ? 'cursor-pointer' : ''}`}
        onClick={() => hasMore ? setOpen(o => !o) : undefined}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-xl mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{card.title}</h3>
              <p className="text-gray-600 text-sm mt-1 leading-relaxed">{card.finding}</p>
            </div>
          </div>
          {hasMore && (
            <span className="text-gray-400 text-sm ml-4 shrink-0 mt-1">
              {open ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {card.details && card.details.length > 0 && (
            <div className="bg-frame/70 rounded-lg p-4 border border-border/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Vad vi hittade</h4>
              <ul className="space-y-1">
                {card.details.map((d, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">
                    {d.startsWith('✓') || d.startsWith('❌') || d.startsWith('⚠️') || d.startsWith('  →') || d === ''
                      ? d
                      : `• ${d}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {card.why && (
            <div className="bg-frame/70 rounded-lg p-4 border border-border/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Varför det spelar roll</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{card.why}</p>
            </div>
          )}

          {card.impact && (
            <div className={`rounded-lg p-4 border ${
              card.status === 'good' ? 'bg-emerald-50/50 border-emerald-200/50' :
              card.status === 'warning' ? 'bg-amber-50/50 border-amber-200/50' :
              'bg-red-50/50 border-red-200/50'
            }`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.accent}`}>
                {card.status === 'good' ? 'Status' : 'Förväntad effekt'}
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed font-medium">{card.impact}</p>
            </div>
          )}

          {card.fix && (
            <div className="bg-frame rounded-lg p-4 border border-border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">Så fixar du det</h4>
              <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono bg-base rounded p-3 overflow-x-auto">
                {card.fix}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
