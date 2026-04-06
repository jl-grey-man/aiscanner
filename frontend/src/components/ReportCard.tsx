import { useState } from 'react'
import type { ReportCard as CardType } from '../types'

const STATUS = {
  good:    { icon: '✅', label: 'Bra',              border: 'border-green-500/20 bg-green-500/5' },
  warning: { icon: '⚠️', label: 'Kan förbättras',  border: 'border-yellow-500/20 bg-yellow-500/5' },
  bad:     { icon: '❌', label: 'Saknas eller fel', border: 'border-red-500/20 bg-red-500/5' },
}

interface Props { card: CardType }

export function ReportCard({ card }: Props) {
  const [open, setOpen] = useState(false)
  const s = STATUS[card.status]

  return (
    <div className={`border rounded-xl p-5 transition-all ${s.border}`}>
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => card.fix ? setOpen(o => !o) : undefined}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">{s.icon}</span>
          <div>
            <h3 className="font-semibold text-white">{card.title}</h3>
            <p className="text-slate-400 text-sm mt-0.5">{card.finding}</p>
          </div>
        </div>
        {card.fix && (
          <span className="text-slate-500 text-sm ml-4 shrink-0 mt-0.5">
            {open ? '↑' : '↓ Fix'}
          </span>
        )}
      </div>

      {open && card.fix && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">{card.fix}</p>
        </div>
      )}
    </div>
  )
}
