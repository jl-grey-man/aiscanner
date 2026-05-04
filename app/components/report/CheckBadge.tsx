'use client'

import type { CheckResult } from '@/app/lib/scanResult'

interface CheckBadgeProps {
  status: CheckResult['status']
}

const BADGE_CONFIG: Record<
  CheckResult['status'],
  { label: string; className: string }
> = {
  ok:            { label: 'OK',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  warning:       { label: '~',   className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  bad:           { label: 'FEL', className: 'bg-red-50 text-red-700 border border-red-200' },
  notMeasured:   { label: '—',   className: 'bg-gray-50 text-gray-500 border border-gray-200' },
  notApplicable: { label: 'N/A', className: 'bg-gray-50 text-gray-500 border border-gray-200' },
}

export default function CheckBadge({ status }: CheckBadgeProps) {
  const { label, className } = BADGE_CONFIG[status]

  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-semibold leading-none ${className}`}
      style={{ minWidth: '2rem' }}
    >
      {label}
    </span>
  )
}
