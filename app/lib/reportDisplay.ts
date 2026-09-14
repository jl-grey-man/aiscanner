/**
 * reportDisplay.ts — Pure display-formatting helpers for the premium report.
 *
 * Extracted so the branching logic around nullable/tri-state fields (NAP
 * consistency, AI-mention booleans) is unit-testable independent of React —
 * this project has no jsdom/RTL set up, so component-level rendering is
 * verified via screenshots instead (see docs/plans/2026-09-01-golive-fixes.md).
 *
 * Task Y3: premium report gains sections for synthesis.summary/actionPlan,
 * AI-mention quotes, a GBP card and a NAP table — data that already exists
 * in ScanResult (scanResult.ts) but was never rendered.
 */

import type { DirectoryData } from './scanResult'

// ---------------------------------------------------------------------------
// NAP table (per-directory Name/Address/Phone)
// ---------------------------------------------------------------------------

export interface NapRow {
  name: string
  found: boolean
  address: string | null
  phone: string | null
  profileUrl: string | null
}

/**
 * Builds one table row per checked directory from directories.directories[].
 * Each item already carries its own extracted nap.address/nap.phone (from
 * directoryChecker.ts) — no need to cross-reference napConsistency.*.values,
 * which holds the same per-directory data aggregated for the consistency check.
 */
export function buildNapRows(directories: DirectoryData['directories']): NapRow[] {
  return directories.map((d) => ({
    name: d.name,
    found: d.found,
    address: d.nap?.address ?? null,
    phone: d.nap?.phone ?? null,
    profileUrl: d.profileUrl ?? null,
  }))
}

/** Swedish label for the tri-state NAP consistency verdict. */
export function napConsistencyLabel(consistent: boolean | null): string {
  if (consistent === true) return 'Konsekvent'
  if (consistent === false) return 'Inkonsekvent'
  return 'Otillräckligt underlag'
}

/** Tailwind classes matching the tri-state NAP consistency verdict. */
export function napConsistencyColor(consistent: boolean | null): string {
  if (consistent === true) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (consistent === false) return 'text-red-700 bg-red-50 border-red-200'
  return 'text-gray-500 bg-gray-50 border-gray-200'
}

// ---------------------------------------------------------------------------
// AI-mention test quotes
// ---------------------------------------------------------------------------

/** Swedish label for whether the AI recognized the company in the entity query. */
export function entityKnowsLabel(entityKnows: boolean): string {
  return entityKnows ? 'AI känner till företaget' : 'AI känner inte till företaget'
}

/** Swedish label for whether the AI spontaneously mentioned the company in the category query. */
export function categoryMentionedLabel(categoryMentioned: boolean): string {
  return categoryMentioned
    ? 'Nämns spontant i branschsökning'
    : 'Nämns inte spontant i branschsökning'
}
