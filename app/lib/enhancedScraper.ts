import * as cheerio from 'cheerio'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
}

const AI_CRAWLERS = [
  'GPTBot',
  'CCBot',
  'Google-Extended',
  'anthropic-ai',
  'ClaudeBot',
  'PerplexityBot',
  'Bytespider',
  'OAI-SearchBot',
  'ChatGPT-User',
  'cohere-ai',
  'Applebot-Extended',
  'FacebookBot',
  'meta-externalagent',
]

const CERTIFICATION_KEYWORDS = [
  'auktoriserad',
  'certifierad',
  'legitimerad',
  'godkänd',
  'ISO',
  'behörig',
  'riksförbund',
]

export interface AICrawlerBlock {
  crawler: string
  path: string
  full: boolean
}

export interface EnhancedData {
  // AI crawler-blockering
  robotsTxt: string
  aiCrawlersBlocked: string[]        // crawler names only — backward compat with route.ts
  aiCrawlerBlocks: AICrawlerBlock[]  // structured: { crawler, path, full }

  // Open Graph
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  hasOgTags: boolean

  // Sociala länkar
  socialLinks: string[]
  sameAsLinks: string[]

  // hreflang
  hreflangTags: string[]

  // FAQ
  hasFAQSchema: boolean
  faqQuestions: string[]
  hasFAQContent: boolean

  // Service/Product/Menu schema
  hasServiceSchema: boolean
  hasMenuSchema: boolean
  hasProductSchema: boolean
  serviceSchemaTypes: string[]

  // Innehållsdjup
  sitemapPageCount: number
  hasBlogOrGuide: boolean
  blogPaths: string[]

  // E-A-T
  hasAboutPage: boolean
  orgNumberFound: string | null
  certificationKeywords: string[]
  hasPersonSchema: boolean
  namedPersons: string[]

  // Opening hours from JSON-LD schema (fallback for businesses without GBP)
  openingHoursFromSchema: {
    dayOfWeek: string
    opens: string
    closes: string
  }[] | null
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timeout)
  }
}

function parseRobotsTxt(robotsTxt: string): AICrawlerBlock[] {
  const blocks: AICrawlerBlock[] = []
  const seen = new Set<string>()
  const lines = robotsTxt.split('\n')
  let currentAgents: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      currentAgents.push(trimmed.slice('user-agent:'.length).trim())
    } else if (trimmed.toLowerCase().startsWith('disallow:')) {
      const path = trimmed.slice('disallow:'.length).trim()
      if (!path) {
        // Empty Disallow = allow all — reset agents and continue
        currentAgents = []
        continue
      }
      for (const agent of currentAgents) {
        for (const crawler of AI_CRAWLERS) {
          if (agent.toLowerCase() === crawler.toLowerCase() && !seen.has(crawler)) {
            seen.add(crawler)
            blocks.push({ crawler, path, full: path === '/' })
          }
        }
      }
      currentAgents = []
    } else if (trimmed === '' || trimmed.startsWith('#')) {
      // Blank line or comment resets the current User-agent block
      if (trimmed === '') currentAgents = []
    }
  }

  // Also check via regex for any AI crawler not yet found (handles multi-line blocks robustly)
  for (const crawler of AI_CRAWLERS) {
    if (seen.has(crawler)) continue
    const escaped = crawler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match User-agent: <crawler> followed by any Disallow (not just /)
    const regex = new RegExp(
      `User-agent:\\s*${escaped}[^\\n]*\\n(?:[^\\n]*\\n)*?Disallow:\\s*(\\S+)`,
      'im'
    )
    const match = regex.exec(robotsTxt)
    if (match) {
      const path = match[1]
      if (path) {
        seen.add(crawler)
        blocks.push({ crawler, path, full: path === '/' })
      }
    }
  }

  return blocks
}

function extractSocialLinks($: cheerio.CheerioAPI): string[] {
  const socialPatterns = [
    'instagram.com',
    'facebook.com',
    'linkedin.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'tiktok.com',
    'pinterest.com',
    'threads.net',
    'bsky.app',
    'mastodon.social',
    'tripadvisor.com',
    'yelp.com',
    'trustpilot.com',
  ]
  const links: string[] = []

  // Check <a href> links
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    for (const pattern of socialPatterns) {
      if (href.includes(pattern)) {
        links.push(href)
        break
      }
    }
  })

  // Check <meta> tags (e.g. article:publisher, og:see_also)
  $('meta[content]').each((_, el) => {
    const content = $(el).attr('content') || ''
    for (const pattern of socialPatterns) {
      if (content.includes(pattern)) {
        links.push(content)
        break
      }
    }
  })

  return [...new Set(links)]
}

function extractSameAs($: cheerio.CheerioAPI): string[] {
  const sameAs: string[] = []

  function collectSameAs(item: any) {
    if (item.sameAs) {
      const values = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs]
      sameAs.push(...values.filter((v: unknown) => typeof v === 'string'))
    }
    if (item['@graph'] && Array.isArray(item['@graph'])) {
      for (const node of item['@graph']) collectSameAs(node)
    }
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) collectSameAs(item)
    } catch { /* ignore */ }
  })

  return [...new Set(sameAs)]
}

function normalizeOpeningHoursDayOfWeek(raw: unknown): string {
  if (typeof raw !== 'string') return String(raw ?? '')
  // Handle schema.org URL form: "http://schema.org/Monday" → "Monday"
  const slashIdx = raw.lastIndexOf('/')
  return slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw
}

function extractOpeningHours(item: Record<string, unknown>): { dayOfWeek: string; opens: string; closes: string }[] {
  const raw = item['openingHoursSpecification']
  if (!raw) return []
  const specs = Array.isArray(raw) ? raw : [raw]
  const result: { dayOfWeek: string; opens: string; closes: string }[] = []
  for (const spec of specs) {
    if (typeof spec !== 'object' || spec === null) continue
    const s = spec as Record<string, unknown>
    const days = s['dayOfWeek']
    const opens = typeof s['opens'] === 'string' ? s['opens'] : null
    const closes = typeof s['closes'] === 'string' ? s['closes'] : null
    if (!opens || !closes) continue
    const dayList = Array.isArray(days) ? days : [days]
    for (const d of dayList) {
      const dayName = normalizeOpeningHoursDayOfWeek(d)
      if (dayName) result.push({ dayOfWeek: dayName, opens, closes })
    }
  }
  return result
}

function extractSchemaInfo($: cheerio.CheerioAPI): {
  hasFAQSchema: boolean
  faqQuestions: string[]
  hasServiceSchema: boolean
  hasMenuSchema: boolean
  hasProductSchema: boolean
  serviceSchemaTypes: string[]
  hasPersonSchema: boolean
  namedPersons: string[]
  openingHoursFromSchema: { dayOfWeek: string; opens: string; closes: string }[] | null
} {
  let hasFAQSchema = false
  const faqQuestions: string[] = []
  let hasServiceSchema = false
  let hasMenuSchema = false
  let hasProductSchema = false
  const serviceSchemaTypes: string[] = []
  let hasPersonSchema = false
  const namedPersons: string[] = []
  const openingHours: { dayOfWeek: string; opens: string; closes: string }[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text())
      const items = Array.isArray(parsed) ? parsed : [parsed]

      for (const item of items) {
        const typeRaw = item['@type']
        const types: string[] = Array.isArray(typeRaw) ? typeRaw : typeRaw ? [typeRaw] : []

        for (const t of types) {
          const lower = t.toLowerCase()
          if (lower === 'faqpage') {
            hasFAQSchema = true
            if (item.mainEntity && Array.isArray(item.mainEntity)) {
              for (const q of item.mainEntity.slice(0, 10)) {
                if (q.name) faqQuestions.push(q.name)
              }
            }
          }
          if (lower === 'service' || lower === 'professionalservice') {
            hasServiceSchema = true
            serviceSchemaTypes.push(t)
          }
          if (lower === 'menu' || lower === 'menuitem') {
            hasMenuSchema = true
            serviceSchemaTypes.push(t)
          }
          if (lower === 'product' || lower === 'offer') {
            hasProductSchema = true
            serviceSchemaTypes.push(t)
          }
          if (lower === 'person') {
            hasPersonSchema = true
            if (item.name) namedPersons.push(item.name)
          }
        }

        // Opening hours at top-level item
        openingHours.push(...extractOpeningHours(item as Record<string, unknown>))

        // Check nested @graph
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          for (const node of item['@graph']) {
            const nodeTypes: string[] = Array.isArray(node['@type']) ? node['@type'] : node['@type'] ? [node['@type']] : []
            for (const nt of nodeTypes) {
              const lower = nt.toLowerCase()
              if (lower === 'faqpage') {
                hasFAQSchema = true
                if (node.mainEntity && Array.isArray(node.mainEntity)) {
                  for (const q of node.mainEntity.slice(0, 10)) {
                    if (q.name) faqQuestions.push(q.name)
                  }
                }
              }
              if (lower === 'service' || lower === 'professionalservice') {
                hasServiceSchema = true
                serviceSchemaTypes.push(nt)
              }
              if (lower === 'menu' || lower === 'menuitem') {
                hasMenuSchema = true
                serviceSchemaTypes.push(nt)
              }
              if (lower === 'product' || lower === 'offer') {
                hasProductSchema = true
                serviceSchemaTypes.push(nt)
              }
              if (lower === 'person') {
                hasPersonSchema = true
                if (node.name) namedPersons.push(node.name)
              }
            }
            // Opening hours inside @graph nodes
            openingHours.push(...extractOpeningHours(node as Record<string, unknown>))
          }
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  })

  return {
    hasFAQSchema,
    faqQuestions: [...new Set(faqQuestions)].slice(0, 10),
    hasServiceSchema,
    hasMenuSchema,
    hasProductSchema,
    serviceSchemaTypes: [...new Set(serviceSchemaTypes)],
    hasPersonSchema,
    namedPersons: [...new Set(namedPersons)],
    openingHoursFromSchema: openingHours.length > 0 ? openingHours : null,
  }
}

function extractFAQContent($: cheerio.CheerioAPI): boolean {
  // Check for dl/dt/dd with FAQ-like content
  const hasDlFaq = $('dl dt').length > 2

  // Check for details/summary
  const hasDetails = $('details summary').length > 2

  // Check for elements with class/id containing "faq"
  const hasFaqClass = $('[class*="faq"], [id*="faq"], [class*="FAQ"], [id*="FAQ"]').length > 0

  // Check for accordion-style FAQ
  const hasAccordion = $('[class*="accordion"]').length > 0 && $('[class*="accordion"]').text().toLowerCase().includes('faq')

  return hasDlFaq || hasDetails || hasFaqClass || hasAccordion
}

export async function scrapeEnhanced(url: string): Promise<EnhancedData> {
  const base = new URL(url).origin
  const defaults: EnhancedData = {
    robotsTxt: '',
    aiCrawlersBlocked: [],
    aiCrawlerBlocks: [],
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    hasOgTags: false,
    socialLinks: [],
    sameAsLinks: [],
    hreflangTags: [],
    hasFAQSchema: false,
    faqQuestions: [],
    hasFAQContent: false,
    hasServiceSchema: false,
    hasMenuSchema: false,
    hasProductSchema: false,
    serviceSchemaTypes: [],
    sitemapPageCount: 0,
    hasBlogOrGuide: false,
    blogPaths: [],
    hasAboutPage: false,
    orgNumberFound: null,
    certificationKeywords: [],
    hasPersonSchema: false,
    namedPersons: [],
    openingHoursFromSchema: null,
  }

  // Fetch robots.txt, main page, sitemap in parallel
  const [robotsRes, mainRes, sitemapRes] = await Promise.all([
    fetchWithTimeout(`${base}/robots.txt`).catch(() => null),
    fetchWithTimeout(url).catch(() => null),
    fetchWithTimeout(`${base}/sitemap.xml`).catch(() => null),
  ])

  // Parse robots.txt
  let robotsTxt = ''
  if (robotsRes?.ok) {
    robotsTxt = (await robotsRes.text()).slice(0, 2000)
  }
  const aiCrawlerBlocks = robotsTxt ? parseRobotsTxt(robotsTxt) : []
  const aiCrawlersBlocked = aiCrawlerBlocks.map(b => b.crawler)

  // Parse main page HTML
  if (!mainRes?.ok) {
    return { ...defaults, robotsTxt, aiCrawlersBlocked, aiCrawlerBlocks }
  }

  const html = await mainRes.text()
  const $ = cheerio.load(html)

  // Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr('content') || null
  const ogDescription = $('meta[property="og:description"]').attr('content') || null
  const ogImage = $('meta[property="og:image"]').attr('content') || null
  const hasOgTags = !!(ogTitle || ogDescription || ogImage)

  // Social links
  const socialLinks = extractSocialLinks($)

  // sameAs from JSON-LD
  const sameAsLinks = extractSameAs($)

  // hreflang
  const hreflangTags: string[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang')
    if (lang) hreflangTags.push(lang)
  })

  // Schema info
  const schemaInfo = extractSchemaInfo($)

  // FAQ content in HTML
  const hasFAQContent = extractFAQContent($)

  // Parse sitemap
  let sitemapPageCount = 0
  const blogPaths: string[] = []
  let hasBlogOrGuide = false

  if (sitemapRes?.ok) {
    try {
      const sitemapText = await sitemapRes.text()
      const urlMatches = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)]
      sitemapPageCount = urlMatches.length

      const blogPatterns = /\/(blogg|blog|guide|guides|tips|nyheter|news|artikel|articles)\//i
      for (const match of urlMatches) {
        const loc = match[1]
        if (blogPatterns.test(loc)) {
          hasBlogOrGuide = true
          blogPaths.push(loc)
        }
      }
    } catch { /* ignore */ }
  }

  // Check for about page by looking at internal links
  let hasAboutPage = false
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    if (/om(-| )?oss|about/i.test(href)) {
      hasAboutPage = true
    }
  })

  // Org number
  const bodyText = $('body').text()
  const orgMatch = bodyText.match(/\d{6}-\d{4}/)
  const orgNumberFound = orgMatch ? orgMatch[0] : null

  // Certification keywords (word-boundary match to avoid false positives like "isolation" → "ISO")
  const foundCerts: string[] = []
  for (const keyword of CERTIFICATION_KEYWORDS) {
    if (new RegExp('\\b' + keyword + '\\b', 'i').test(bodyText)) {
      foundCerts.push(keyword)
    }
  }

  return {
    robotsTxt: robotsTxt.slice(0, 1500),
    aiCrawlersBlocked,
    aiCrawlerBlocks,
    ogTitle,
    ogDescription,
    ogImage,
    hasOgTags,
    socialLinks,
    sameAsLinks,
    hreflangTags: [...new Set(hreflangTags)],
    hasFAQSchema: schemaInfo.hasFAQSchema,
    faqQuestions: schemaInfo.faqQuestions,
    hasFAQContent,
    hasServiceSchema: schemaInfo.hasServiceSchema,
    hasMenuSchema: schemaInfo.hasMenuSchema,
    hasProductSchema: schemaInfo.hasProductSchema,
    serviceSchemaTypes: schemaInfo.serviceSchemaTypes,
    sitemapPageCount,
    hasBlogOrGuide,
    blogPaths: blogPaths.slice(0, 20),
    hasAboutPage,
    orgNumberFound,
    certificationKeywords: foundCerts,
    hasPersonSchema: schemaInfo.hasPersonSchema,
    namedPersons: schemaInfo.namedPersons,
    openingHoursFromSchema: schemaInfo.openingHoursFromSchema,
  }
}
