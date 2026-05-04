'use client'

import type { CheckResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'

interface PriorityCardProps {
  check: CheckResult
  index: number
  linkTarget?: string
}

type Priority = NonNullable<CheckResult['priority']>

const PRIORITY_CONFIG: Record<Priority, { borderClass: string; labelColor: string }> = {
  critical:  { borderClass: 'border-l-4 border-red-500',   labelColor: 'text-red-700' },
  important: { borderClass: 'border-l-4 border-amber-500', labelColor: 'text-amber-700' },
  nice:      { borderClass: 'border-l-4 border-blue-500',  labelColor: 'text-blue-700' },
}

export default function PriorityCard({ check, index, linkTarget }: PriorityCardProps) {
  const priority = check.priority ?? 'nice'
  const { borderClass, labelColor } = PRIORITY_CONFIG[priority]
  const href = linkTarget ?? `#fix-${check.key}`
  const registryEntry = CHECK_REGISTRY.find((e) => e.key === check.key)
  const label = registryEntry?.label ?? check.key

  return (
    <a
      href={href}
      className={`block bg-white rounded-lg p-3 hover:bg-gray-50 transition-colors ${borderClass}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-gray-900 text-sm font-medium">
            {index}. {label}
          </p>
          <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">
            {check.finding}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${labelColor}`}>
          &rarr;
        </span>
      </div>
    </a>
  )
}
