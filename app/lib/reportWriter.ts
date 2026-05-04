/**
 * reportWriter.ts — Enriches bad/warning checks with tailored Pro-generated content
 *
 * Runs 3-4 parallel Gemini 2.5 Pro calls (batched by category) to produce:
 *   - richRelevance: "Varför spelar det roll för [Företag]?"
 *   - richSteps: "Steg för steg" (numbered markdown)
 *   - richCodeExample: Company-specific, copy-paste-ready code
 *
 * Designed to run in parallel with Pro synthesis — adds zero extra latency.
 */

import type { CheckResult, CheckKey } from './scanResult'
import { CHECK_REGISTRY } from './scanResult'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RichCheckData {
  richRelevance: string | null
  richSteps: string | null
  richCodeExample: string | null
}

interface BusinessMeta {
  companyName: string
  bransch: string
  city: string | null
  url: string
  domain: string
  phone?: string
}

type CallOpenRouterFn = (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  expectMarkdown?: boolean,
  maxTokensOverride?: number,
) => Promise<any>

// ---------------------------------------------------------------------------
// Category batching config
// ---------------------------------------------------------------------------

const BATCH_CATEGORIES: string[][] = [
  ['technical'],
  ['local'],
  ['ai-readiness'],
  ['content', 'ai-test', 'gbp'],
]

const PRO_MODEL = 'google/gemini-2.5-pro-preview-03-25'

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function enrichChecksWithReportWriter(
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
): Promise<Record<string, RichCheckData>> {
  // Only enrich bad/warning checks (not ok, notMeasured, notApplicable, synthesis)
  const enrichable = checks.filter(
    c => (c.status === 'bad' || c.status === 'warning') && c.key !== 'synthesis'
  )

  if (enrichable.length === 0) return {}

  // Build category lookup
  const categoryByKey = new Map<string, string>()
  for (const entry of CHECK_REGISTRY) {
    categoryByKey.set(entry.key, entry.category)
  }

  // Group checks into batches
  const batches: { categories: string[]; checks: CheckResult[] }[] = []
  for (const cats of BATCH_CATEGORIES) {
    const catSet = new Set(cats)
    const batchChecks = enrichable.filter(c => catSet.has(categoryByKey.get(c.key) ?? ''))
    if (batchChecks.length > 0) {
      batches.push({ categories: cats, checks: batchChecks })
    }
  }

  // Run all batches in parallel
  const batchResults = await Promise.all(
    batches.map(batch => runBatch(batch.checks, meta, callOpenRouter))
  )

  // Merge all results into a single map
  const result: Record<string, RichCheckData> = {}
  for (const batchResult of batchResults) {
    for (const [key, data] of Object.entries(batchResult)) {
      result[key] = data
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-batch logic
// ---------------------------------------------------------------------------

async function runBatch(
  checks: CheckResult[],
  meta: BusinessMeta,
  callOpenRouter: CallOpenRouterFn,
): Promise<Record<string, RichCheckData>> {
  const systemPrompt = `Du är en senior svensk AI-sökningskonsult som skriver kundrapporter. Du skriver alltid på svenska. Dina texter är professionella, konkreta och handlingsbara.`

  const checkDescriptions = checks.map(c => {
    const reg = CHECK_REGISTRY.find(e => e.key === c.key)
    return {
      key: c.key,
      label: reg?.label ?? c.key,
      status: c.status,
      finding: c.finding,
      fix: c.fix ?? '',
      codeExample: c.codeExample ?? '',
      data: c.data ?? null,
    }
  })

  const userPrompt = `Företagsinformation:
- Namn: ${meta.companyName}
- Bransch: ${meta.bransch}
- Stad: ${meta.city || 'okänd'}
- URL: ${meta.url}
- Domän: ${meta.domain}
${meta.phone ? `- Telefon: ${meta.phone}` : ''}

Dessa kontroller har problem. Skriv FÖR VARJE en rapport-text med tre delar:

${JSON.stringify(checkDescriptions, null, 2)}

Returnera JSON med varje check-key som nyckel:
{
  "[check-key]": {
    "richRelevance": "1-3 meningar, nämn företagsnamnet (${meta.companyName}), förklara varför just DETTA företag påverkas.",
    "richSteps": "Numrerade steg (1. 2. 3.), max 6 steg, konkreta och handlingsbara. Markdown-format.",
    "richCodeExample": "Komplett, copy-paste-ready kod med företagets faktiska data (domän: ${meta.domain}, namn: ${meta.companyName}, stad: ${meta.city || 'okänd'}). null om checken inte lämpar sig för kodexempel (t.ex. NAP, directories, recensionssvar)."
  }
}

REGLER:
- Om en check har ett "data"-fält, ANVÄND den råa datan i din analys. Nämn specifika värden (t.ex. "Eniro har adressen Stampgatan 8 medan Hitta har Syster Estrids Gata 13").
- richRelevance: Kort, personligt, nämn ALLTID "${meta.companyName}" i texten
- richSteps: Numrerade 1-6 steg, varje steg en konkret handling. Skriv i imperativ form ("Lägg till...", "Skapa...", "Kontrollera...")
- richCodeExample: Komplett JSON-LD, HTML eller konfiguration med RÄTT data (domän, namn, stad). Använd <!-- ANPASSA: ... --> BARA där värden inte kan härledas. null om kodexempel inte är relevant
- Svara ENBART med giltig JSON — inga kodblock-markeringar, ingen text utanför JSON
- Alla texter på svenska`

  try {
    const result = await callOpenRouter(
      PRO_MODEL,
      systemPrompt,
      userPrompt,
      60000,
      false, // JSON mode
      8000,
    )

    // Parse and validate the result
    const parsed: Record<string, RichCheckData> = {}
    for (const check of checks) {
      const data = result?.[check.key]
      if (data && typeof data === 'object') {
        parsed[check.key] = {
          richRelevance: typeof data.richRelevance === 'string' ? data.richRelevance : null,
          richSteps: typeof data.richSteps === 'string' ? data.richSteps : null,
          richCodeExample: typeof data.richCodeExample === 'string' ? data.richCodeExample : null,
        }
      }
    }
    return parsed
  } catch (err: any) {
    console.error(`[ReportWriter] Batch failed:`, err.message)
    return {}
  }
}
