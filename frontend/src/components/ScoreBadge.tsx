interface Props { score: number }

export function ScoreBadge({ score }: Props) {
  const color = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className={`text-4xl font-bold ${color}`}>{score}</span>
      <span className="text-slate-400 text-lg">/100</span>
    </div>
  )
}
