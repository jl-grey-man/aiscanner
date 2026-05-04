'use client'

interface ScoreCircleProps {
  score: number
  label: string
  size?: number
  highlight?: boolean
}

function getColor(score: number): string {
  if (score >= 70) return '#10b981' // green (emerald-500)
  if (score >= 40) return '#f59e0b' // amber (amber-400)
  return '#ef4444'                  // red (red-500)
}

export default function ScoreCircle({ score, label, size = 90, highlight = false }: ScoreCircleProps) {
  const radius = (size / 2) * 0.88
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = size * 0.089
  const circumference = 2 * Math.PI * radius
  const clampedScore = Math.max(0, Math.min(100, score))
  const dashOffset = circumference - (circumference * clampedScore) / 100
  const color = getColor(clampedScore)
  const fontSize = size * 0.27

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative inline-flex items-center justify-center rounded-full${highlight ? ' ring-2 ring-amber-400 ring-offset-2' : ''}`}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Score arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <span
          className="absolute font-bold text-gray-900"
          style={{ fontSize, lineHeight: 1 }}
        >
          {clampedScore}
        </span>
      </div>
      <p className={`text-xs mt-1 ${highlight ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
        {label}
      </p>
    </div>
  )
}
