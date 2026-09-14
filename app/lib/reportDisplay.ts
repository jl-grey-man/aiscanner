/**
 * reportDisplay.ts — Pure display-formatting helpers for the premium report.
 *
 * Extracted so the branching logic around nullable/tri-state fields (NAP
 * consistency, AI-mention classification, SolutionCard code source) is
 * unit-testable independent of React — this project has no jsdom/RTL set up,
 * so component-level rendering is verified via screenshots instead (see
 * docs/plans/2026-09-01-golive-fixes.md).
 *
 * Task Y3: premium report gains sections for synthesis.summary/actionPlan,
 * AI-mention quotes, a GBP card and a NAP table — data that already exists
 * in ScanResult (scanResult.ts) but was never rendered.
 */

import type { AIMentionData, CheckResult, DirectoryData } from './scanResult'

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

/**
 * Swedish label for how the AI answered the entity query.
 *
 * Audit #4: `entityClassification` is the source of truth — `entityKnows` is
 * false both when the AI doesn't know the company and when it gives wrong
 * facts about it, and "känner inte till" would be misleading in the latter
 * case. Scans stored before the classification existed fall back to the boolean.
 */
export function entityKnowsLabel(
  mention: Pick<AIMentionData, 'entityKnows'> & { entityClassification?: AIMentionData['entityClassification'] },
): string {
  const classification = mention.entityClassification ?? (mention.entityKnows ? 'knows' : 'doesNotKnow')
  if (classification === 'knows') return 'AI känner till företaget'
  if (classification === 'wrongFacts') return 'AI har felaktiga uppgifter om företaget'
  return 'AI känner inte till företaget'
}

/** Swedish label for whether the AI spontaneously mentioned the company in the category query. */
export function categoryMentionedLabel(categoryMentioned: boolean): string {
  return categoryMentioned
    ? 'Nämns spontant i branschsökning'
    : 'Nämns inte spontant i branschsökning'
}

// ---------------------------------------------------------------------------
// SolutionCard — which code block to show
// ---------------------------------------------------------------------------

export interface SolutionCodeDisplay {
  /** Code source picked for the card (may be hidden, see showCode). */
  code: string | null
  /** true = code comes from genericCodeTemplate (may contain <PLACEHOLDERS>). */
  isTemplate: boolean
  /** Whether the code block is rendered at all. */
  showCode: boolean
  /** Key of the card whose code block already covers this check (paid, masterSchema.ts). */
  codeRef: string | null
}

function nonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/**
 * Picks the code shown in a SolutionCard, in priority order:
 * 1. `richCodeExample` (paid, real data). With `codeRef` it holds only the delta.
 * 2. `codeRef` — a reference to the card that already has the code block
 *    (master schema / duplicate). Such a card NEVER falls back to template or
 *    Flash code, which would repeat the same block again.
 * 3. `genericCodeTemplate` — hidden in free (`unlocked=false`); in premium
 *    (`unlocked=true`) it is pre-filled server-side (templateFill.ts) and shown
 *    with a "Mall" badge instead of leaving a paying customer with no code.
 * 4. `codeExample` (Flash) when no template exists and there is no codeRef.
 */
export function pickSolutionCode(
  check: Partial<Pick<CheckResult, 'richCodeExample' | 'genericCodeTemplate' | 'codeExample' | 'codeRef'>>,
  unlocked: boolean,
): SolutionCodeDisplay {
  const codeRef = check.codeRef ?? null
  let code: string | null = null
  let isTemplate = false
  if (nonEmpty(check.richCodeExample)) {
    code = check.richCodeExample
  } else if (!codeRef && nonEmpty(check.genericCodeTemplate)) {
    code = check.genericCodeTemplate
    isTemplate = true
  } else if (!codeRef && nonEmpty(check.codeExample)) {
    code = check.codeExample
  }
  const showCode = code !== null && (!isTemplate || unlocked)
  return { code, isTemplate, showCode, codeRef }
}
