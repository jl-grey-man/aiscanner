/**
 * scanResult.ts — ScanResult Zod-schema + poängberäkning
 *
 * Source of truth for:
 *  - All 37 check keys (CheckKeyEnum)
 *  - CheckResult shape
 *  - ScanResult shape
 *  - CHECK_REGISTRY (id, key, label, category, tier, weight)
 *  - calculateScores() — deterministic free + full score from checks
 *
 * Tasks: 1.1 (schema) + 1.10 (scoring)
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. Check-key enum — all 37 checks in canonical order
// ---------------------------------------------------------------------------

export const CheckKeyEnum = z.enum([
  // A. Teknisk grund (10)
  'https',           // #1
  'robotsTxt',       // #2
  'aiCrawlers',      // #3
  'sitemap',         // #4
  'llmsTxt',         // #5
  'canonical',       // #6
  'ogTags',          // #7
  'socialPresence',  // #8
  'hreflang',        // #9
  'cwv',             // #10

  // B. Lokal synlighet (7)
  'phone',           // #11
  'cityMentioned',   // #12
  'googleMaps',      // #13
  'localBusiness',   // #14
  'directories',     // #15
  'napConsistency',  // #16
  'openingHours',    // #17

  // C. AI-beredskap (9)
  'schemaAny',       // #18
  'localSubtype',    // #19
  'jsonLd',          // #20
  'metaTags',        // #21
  'faqSchema',       // #22
  'contentDepth',    // #23
  'serviceSchema',   // #24
  'eatSignals',      // #25
  'semanticHtml',    // #26

  // D. Innehåll (6)
  'h1',              // #27
  'title',           // #28
  'metaDescription', // #29
  'contactInfo',     // #30
  'altTexts',        // #31
  'internalLinks',   // #32

  // E. AI-synlighetstest (2 — premium)
  'aiMentions',      // #33
  'reviewReplies',   // #34

  // F. Google Business Profile (2 — premium)
  'gbpData',         // #35
  'competitors',     // #36

  // G. Syntes (1 — premium)
  'synthesis',       // #37
])

export type CheckKey = z.infer<typeof CheckKeyEnum>

// ---------------------------------------------------------------------------
// 2. CheckResult schema
// ---------------------------------------------------------------------------

export const CheckResultSchema = z.object({
  id: z.number().int().min(1).max(37),
  key: CheckKeyEnum,
  status: z.enum(['ok', 'warning', 'bad', 'notMeasured', 'notApplicable']),
  source: z.enum(['scraper', 'ai', 'api', 'computed']),
  finding: z.string(),
  fix: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  codeExample: z.string().nullable(),
  priority: z.enum(['critical', 'important', 'nice']).nullable(),
  tier: z.enum(['free', 'premium']),
  // Rich report writer fields (populated by reportWriter.ts for bad/warning checks)
  richRelevance: z.string().nullable().optional(),
  richSteps: z.string().nullable().optional(),
  richCodeExample: z.string().nullable().optional(),
})

export type CheckResult = z.infer<typeof CheckResultSchema>

// ---------------------------------------------------------------------------
// 3. Sub-schemas for ScanResult fields
// ---------------------------------------------------------------------------

const MetaSchema = z.object({
  url: z.string(),
  domain: z.string(),
  city: z.string().nullable(),
  bransch: z.string(),
  companyName: z.string(),
  scanDate: z.string(),
  scanId: z.string(),
})

const ScoresSchema = z.object({
  free: z.number().min(0).max(100),
  full: z.number().min(0).max(100),
  google: z.number().nullable(),
  googleCount: z.number().nullable(),
})

const SynthesisSchema = z.object({
  actionPlan: z.string(),
  competitorNote: z.string(),
  reviewAnalysis: z.string().nullable(),
  summary: z.string(),
})

// GBP data (from Google Places API)
const GBPDataSchema = z.object({
  name: z.string().optional(),
  rating: z.number().nullable().optional(),
  userRatingCount: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  websiteUri: z.string().nullable().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  _domainMatch: z.boolean().optional(),
}).passthrough()

// Directory data (from directoryChecker.ts)
const NAPFieldSchema = z.object({
  values: z.array(z.object({
    directory: z.string(),
    value: z.string(),
  })),
  consistent: z.boolean().nullable(),
})

const NAPConsistencySchema = z.object({
  checked: z.boolean(),
  consistent: z.boolean().nullable(),
  phone: NAPFieldSchema,
  address: NAPFieldSchema,
  finding: z.string(),
  fix: z.string(),
})

const DirectoryCheckItemSchema = z.object({
  name: z.string(),
  found: z.boolean(),
  source: z.enum(['sameAs', 'tavily', 'not_found']),
  profileUrl: z.string().optional(),
  nap: z.object({
    phone: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
})

const DirectoryDataSchema = z.object({
  foundInSameAs: z.array(z.string()),
  directories: z.array(DirectoryCheckItemSchema),
  foundCount: z.number(),
  totalChecked: z.number(),
  napConsistency: NAPConsistencySchema,
  status: z.enum(['ok', 'warning', 'bad']),
  finding: z.string(),
  fix: z.string(),
})

// AI mention data (from aiMentionChecker.ts)
const AIMentionDataSchema = z.object({
  entityQuery: z.string(),
  entityResponse: z.string(),
  entityKnows: z.boolean(),
  entitySentiment: z.enum(['positive', 'neutral', 'negative', 'unknown']),
  extractedNiche: z.string(),
  categoryQuery: z.string(),
  categoryResponse: z.string(),
  categoryMentioned: z.boolean(),
  status: z.enum(['ok', 'warning', 'bad']),
  finding: z.string(),
  fix: z.string(),
})

// Review reply data (from route.ts reviewReplyResult)
const ReviewReplyDataSchema = z.object({
  total: z.number(),
  withReply: z.number(),
  replyRate: z.number(),
  status: z.enum(['ok', 'warning', 'bad']),
  finding: z.string(),
  fix: z.string(),
  sampleNote: z.string().optional(),
})

// ---------------------------------------------------------------------------
// 4. ScanResult schema — top-level contract
// ---------------------------------------------------------------------------

export const ScanResultSchema = z.object({
  meta: MetaSchema,
  scores: ScoresSchema,
  checks: z.array(CheckResultSchema).length(37),
  synthesis: SynthesisSchema,
  gbp: GBPDataSchema.nullable(),
  directories: DirectoryDataSchema,
  aiMentions: AIMentionDataSchema.nullable(),
  reviewReplies: ReviewReplyDataSchema,
})

export type ScanResult = z.infer<typeof ScanResultSchema>
export type ScanMeta = z.infer<typeof MetaSchema>
export type ScanScores = z.infer<typeof ScoresSchema>
export type ScanSynthesis = z.infer<typeof SynthesisSchema>
export type GBPData = z.infer<typeof GBPDataSchema>
export type DirectoryData = z.infer<typeof DirectoryDataSchema>
export type AIMentionData = z.infer<typeof AIMentionDataSchema>
export type ReviewReplyData = z.infer<typeof ReviewReplyDataSchema>

// ---------------------------------------------------------------------------
// 5. CHECK_REGISTRY — static metadata for all 37 checks
// ---------------------------------------------------------------------------

export interface CheckRegistryEntry {
  id: number
  key: CheckKey
  label: string
  category: 'technical' | 'local' | 'ai-readiness' | 'content' | 'ai-test' | 'gbp' | 'synthesis'
  tier: 'free' | 'premium'
  weight: { free: number; full: number }
}

export const CHECK_REGISTRY: CheckRegistryEntry[] = [
  // A. Teknisk grund
  { id: 1,  key: 'https',          label: 'HTTPS',                     category: 'technical',    tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 2,  key: 'robotsTxt',      label: 'Robots.txt',                category: 'technical',    tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 3,  key: 'aiCrawlers',     label: 'AI-crawler-blockering',     category: 'technical',    tier: 'free',    weight: { free: 4, full: 3 } },
  { id: 4,  key: 'sitemap',        label: 'Sitemap.xml',               category: 'technical',    tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 5,  key: 'llmsTxt',        label: 'llms.txt',                  category: 'technical',    tier: 'free',    weight: { free: 2, full: 2 } },
  { id: 6,  key: 'canonical',      label: 'Canonical-tagg',            category: 'technical',    tier: 'free',    weight: { free: 2, full: 2 } },
  { id: 7,  key: 'ogTags',         label: 'Open Graph-taggar',         category: 'technical',    tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 8,  key: 'socialPresence', label: 'Social närvaro / sameAs',   category: 'technical',    tier: 'premium', weight: { free: 0, full: 3 } },
  { id: 9,  key: 'hreflang',       label: 'hreflang-taggar',           category: 'technical',    tier: 'premium', weight: { free: 0, full: 2 } },
  { id: 10, key: 'cwv',            label: 'Sidhastighet / CWV',        category: 'technical',    tier: 'free',    weight: { free: 0, full: 0 } },

  // B. Lokal synlighet
  { id: 11, key: 'phone',          label: 'Telefonnummer synligt',     category: 'local',        tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 12, key: 'cityMentioned',  label: 'Stad nämns',                category: 'local',        tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 13, key: 'googleMaps',     label: 'Google Maps-inbäddning',    category: 'local',        tier: 'free',    weight: { free: 2, full: 2 } },
  { id: 14, key: 'localBusiness',  label: 'LocalBusiness-schema',      category: 'local',        tier: 'free',    weight: { free: 5, full: 4 } },
  { id: 15, key: 'directories',    label: 'Katalogregistrering',       category: 'local',        tier: 'free',    weight: { free: 3, full: 3 } },
  { id: 16, key: 'napConsistency', label: 'NAP-konsistens',            category: 'local',        tier: 'free',    weight: { free: 4, full: 3 } },
  { id: 17, key: 'openingHours',   label: 'Öppettider',                category: 'local',        tier: 'free',    weight: { free: 2, full: 2 } },

  // C. AI-beredskap
  { id: 18, key: 'schemaAny',      label: 'Schema markup (någon typ)', category: 'ai-readiness', tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 19, key: 'localSubtype',   label: 'LocalBusiness-subtyp',      category: 'ai-readiness', tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 20, key: 'jsonLd',         label: 'JSON-LD format',            category: 'ai-readiness', tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 21, key: 'metaTags',       label: 'Meta-taggar',               category: 'ai-readiness', tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 22, key: 'faqSchema',      label: 'FAQ-schema',                category: 'ai-readiness', tier: 'free',    weight: { free: 4, full: 3 } },
  { id: 23, key: 'contentDepth',   label: 'Innehållsdjup',             category: 'ai-readiness', tier: 'free',    weight: { free: 3, full: 3 } },
  { id: 24, key: 'serviceSchema',  label: 'Service/Product/Menu-schema', category: 'ai-readiness', tier: 'premium', weight: { free: 0, full: 3 } },
  { id: 25, key: 'eatSignals',     label: 'E-A-T-signaler',            category: 'ai-readiness', tier: 'free',    weight: { free: 4, full: 3 } },
  { id: 26, key: 'semanticHtml',   label: 'Semantisk HTML',            category: 'ai-readiness', tier: 'free',    weight: { free: 2, full: 2 } },

  // D. Innehåll
  { id: 27, key: 'h1',             label: 'H1-rubrik',                 category: 'content',      tier: 'free',    weight: { free: 2, full: 2 } },
  { id: 28, key: 'title',          label: 'Title-tagg',                category: 'content',      tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 29, key: 'metaDescription', label: 'Metabeskrivning',          category: 'content',      tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 30, key: 'contactInfo',    label: 'Kontaktinfo',               category: 'content',      tier: 'free',    weight: { free: 2, full: 2 } },
  { id: 31, key: 'altTexts',       label: 'Alt-texter på bilder',      category: 'content',      tier: 'free',    weight: { free: 3, full: 2 } },
  { id: 32, key: 'internalLinks',  label: 'Internlänkning',            category: 'content',      tier: 'free',    weight: { free: 3, full: 2 } },

  // E. AI-synlighetstest (premium)
  { id: 33, key: 'aiMentions',     label: 'AI-omnämnande',             category: 'ai-test',      tier: 'premium', weight: { free: 0, full: 5 } },
  { id: 34, key: 'reviewReplies',  label: 'Recensionssvar-analys',     category: 'ai-test',      tier: 'premium', weight: { free: 0, full: 4 } },

  // F. Google Business Profile (premium)
  { id: 35, key: 'gbpData',        label: 'GBP-data',                  category: 'gbp',          tier: 'premium', weight: { free: 0, full: 4 } },
  { id: 36, key: 'competitors',    label: 'Konkurrentanalys',          category: 'gbp',          tier: 'premium', weight: { free: 0, full: 3 } },

  // G. Syntes (premium, not scored)
  { id: 37, key: 'synthesis',      label: 'Prioriterad åtgärdsplan',   category: 'synthesis',    tier: 'premium', weight: { free: 0, full: 0 } },
]

// ---------------------------------------------------------------------------
// 6. calculateScores — deterministic, weight-normalized scoring
// ---------------------------------------------------------------------------

/**
 * Score rules per status:
 *   ok          = 100% of weight
 *   warning     = 50% of weight
 *   bad         = 0% of weight
 *   notMeasured = excluded from both earned and max (as if check did not exist)
 *   notApplicable = excluded from both earned and max (same)
 *
 * Final score = (sum of earned points / sum of applicable max points) * 100
 * Rounded to nearest integer. Returns 0 if no applicable checks.
 */
export function calculateScores(checks: CheckResult[]): { free: number; full: number } {
  // Build a lookup from key → registry entry for O(1) weight access
  const registryByKey = new Map<CheckKey, CheckRegistryEntry>()
  for (const entry of CHECK_REGISTRY) {
    registryByKey.set(entry.key, entry)
  }

  let freeEarned = 0
  let freeMax = 0
  let fullEarned = 0
  let fullMax = 0

  for (const check of checks) {
    const reg = registryByKey.get(check.key)
    if (!reg) continue

    // Excluded statuses contribute nothing to earned or max
    if (check.status === 'notMeasured' || check.status === 'notApplicable') {
      continue
    }

    const multiplier =
      check.status === 'ok'      ? 1.0 :
      check.status === 'warning' ? 0.5 :
      /* bad */                    0.0

    const fw = reg.weight.free
    const uw = reg.weight.full

    freeEarned += fw * multiplier
    freeMax    += fw

    fullEarned += uw * multiplier
    fullMax    += uw
  }

  const free = freeMax > 0 ? Math.round((freeEarned / freeMax) * 100) : 0
  const full = fullMax > 0 ? Math.round((fullEarned / fullMax) * 100) : 0

  return { free, full }
}
