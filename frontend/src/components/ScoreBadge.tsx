interface Props { score: number }

export function ScoreBadge({ score }: Props) {
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="flex items-center gap-3">
      <span className={`text-4xl font-bold ${color}`}>{score}</span>
      <span className="text-gray-400 text-lg">/100</span>
    </div>
  )
}
