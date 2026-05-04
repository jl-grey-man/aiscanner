'use client'

import type { CheckResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'
import CheckBadge from './CheckBadge'

interface CheckTableProps {
  checks: CheckResult[]
  category: string
  categoryLabel: string
}

const STATUS_ORDER: Record<CheckResult['status'], number> = {
  bad:           0,
  warning:       1,
  ok:            2,
  notMeasured:   3,
  notApplicable: 4,
}

export default function CheckTable({ checks, category, categoryLabel }: CheckTableProps) {
  // Build a set of keys that belong to this category
  const categoryKeys = new Set(
    CHECK_REGISTRY
      .filter((entry) => entry.category === category)
      .map((entry) => entry.key)
  )

  // Filter checks for this category and sort by status priority
  const filtered = checks
    .filter((c) => categoryKeys.has(c.key))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  if (filtered.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
      {/* Table header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          {categoryLabel}
        </h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide w-8">
              #
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
              Kontroll
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide w-16">
              Status
            </th>
            <th className="text-left px-3 py-2 pr-5 text-xs font-medium text-gray-400 uppercase tracking-wide">
              Fynd
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((check) => {
            const regEntry = CHECK_REGISTRY.find((e) => e.key === check.key)
            const checkLabel = regEntry?.label ?? check.key
            return (
            <tr
              key={check.key}
              className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors"
            >
              <td className="px-5 py-3 text-gray-400 text-xs">{check.id}</td>
              <td className="px-3 py-3">
                <a
                  href={`#fix-${check.key}`}
                  className="text-gray-900 font-medium hover:text-blue-600 transition-colors"
                >
                  {checkLabel}
                </a>
              </td>
              <td className="px-3 py-3">
                <CheckBadge status={check.status} />
              </td>
              <td className="px-3 py-3 pr-5 text-gray-500 text-xs leading-relaxed">
                {check.finding}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
