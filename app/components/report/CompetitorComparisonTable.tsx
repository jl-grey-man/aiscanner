'use client'

import React from 'react'
import type { CompetitorComparisonData } from '@/app/lib/scanResult'
import { buildComparisonRows, COMPETITOR_COMPARISON_CHECK_COUNT } from '@/app/lib/reportDisplay'
import CheckBadge from './CheckBadge'

function websiteHost(website: string): string {
  try { return new URL(website).hostname.replace(/^www\./, '') } catch { return website }
}

/**
 * Konkurrentjämförelsens tabell — ni vs topp 3 konkurrenter, en rad per kontroll
 * (samma {@link COMPETITOR_COMPARISON_CHECK_COUNT} deterministiska kontroller som
 * `competitorComparison.ts`, ingen LLM inblandad). Premium only — hela sektionen
 * är null i free (`ScanResult.competitorComparison`).
 *
 * En konkurrent som inte kunde scannas (`scanned: false` — sajten svarade inte
 * eller nåddes inte i tid) visas ändå som kolumn, med en förklaring i stället för
 * badges — aldrig tyst som om den klarat/inte klarat kontrollerna.
 */
export default function CompetitorComparisonTable({ comparison }: { comparison: CompetitorComparisonData }) {
  const rows = buildComparisonRows(comparison)
  const total = COMPETITOR_COMPARISON_CHECK_COUNT

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Kontroll för kontroll &mdash; ni vs. {comparison.competitors.length === 1 ? 'konkurrenten' : 'konkurrenterna'}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 pr-4 font-medium sticky left-0 bg-white">Kontroll</th>
              <th className="py-2 px-3 font-medium text-center">
                <div className="text-gray-900 normal-case font-semibold">Ni</div>
                <div className="text-gray-400 font-normal normal-case">{comparison.you.okCount}/{total}</div>
              </th>
              {comparison.competitors.map((c) => (
                <th key={c.placeId ?? c.name} className="py-2 px-3 font-medium text-center min-w-[7rem]">
                  <div className="text-gray-900 normal-case font-semibold truncate max-w-[9rem]" title={c.name}>
                    {c.name}
                  </div>
                  {c.scanned ? (
                    <>
                      <div className="text-gray-400 font-normal normal-case">{c.okCount}/{total}</div>
                      <div className="text-gray-300 font-normal normal-case truncate max-w-[9rem]">{websiteHost(c.website)}</div>
                    </>
                  ) : (
                    <div className="text-red-500 font-normal normal-case">Kunde inte scannas</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-4 text-gray-700 sticky left-0 bg-white whitespace-nowrap">{row.label}</td>
                <td className="py-2 px-3 text-center">
                  <CheckBadge status={row.you} />
                </td>
                {row.competitors.map((status, i) => (
                  <td key={i} className="py-2 px-3 text-center">
                    {status === null ? (
                      <span className="text-gray-300 text-xs">&mdash;</span>
                    ) : (
                      <CheckBadge status={status} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparison.competitors.some((c) => !c.scanned) && (
        <p className="text-gray-400 text-xs mt-3">
          &mdash; = kunde inte scannas (sajten svarade inte, eller inte i tid). Ingen slutsats dras om den.
        </p>
      )}
    </div>
  )
}
