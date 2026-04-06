interface Props { current: number; total?: number }

export function Progress({ current, total = 10 }: Props) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between text-sm text-slate-400 mb-2">
        <span>Analyserar… ({current}/{total} kontroller)</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden border border-border">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
