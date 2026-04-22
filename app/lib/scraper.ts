import * as cheerio from 'cheerio'

export interface PageSummary {
  url: string
  title: string
  metaDescription: string
  h1: string
  h2s: string[]
  bodyText: string
  schemaScripts: string[]
  hasLocalBusinessSchema: boolean
  hasRestaurantSchema: boolean
  phones: string[]
  cities: string[]
  menuSummary: string
  hasContactInfo: boolean
}

export interface ScrapedData {
  url: string
  robotsTxt: string | null
  sitemapXml: string | null
  llmsTxt: string | null
  sitemapUrlCount: number | null
  pages: PageSummary[]
}

const PAGE_PATTERNS: Record<string, RegExp> = {
  contact: /kontakt|contact/,
  about: /om(-| )?oss|about/,
  services: /tjanster|services|behandlingar|menu|meny/,
  booking: /boka|book/,
  location: /hitta|besok|visit/,
}

const SWEDISH_CITIES = [
  'Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Linköping',
  'Örebro', 'Västerås', 'Norrköping', 'Helsingborg', 'Jönköping',
  'Umeå', 'Lund'
]

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, '')
}

function isEnglishPath(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return path.startsWith('/en') || path.startsWith('/en-') || path.startsWith('/english/')
  } catch {
    return false
  }
}

function getPathWithoutLang(url: string): string {
  try {
    const path = new URL(url).pathname
    return path.replace(/^\/(en|sv|se|english)\//, '/')
  } catch {
    return url
  }
}

export function filterAndSelectUrls(urls: string[], baseDomain: string, max: number = 4): string[] {
  const mainNormalized = normalizeUrl(baseDomain)

  // 1. Dedup + normalisera, ta bort förstasidan från poolen
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const url of urls) {
    const n = normalizeUrl(url)
    if (seen.has(n)) continue
    if (n === mainNormalized || n === mainNormalized + '/') continue
    seen.add(n)
    normalized.push(url.trim())
  }

  // 2. Separera svenska, engelska, övriga
  const svUrls: string[] = []
  const enUrls: string[] = []
  const otherUrls: string[] = []

  for (const url of normalized) {
    try {
      if (isEnglishPath(url)) {
        enUrls.push(url)
      } else {
        otherUrls.push(url)
      }
    } catch {
      otherUrls.push(url)
    }
  }

  // 3. Om engelsk sida har svensk motsvarighet — kasta engelskan
  const finalPool: string[] = [...otherUrls]

  for (const enUrl of enUrls) {
    const enPath = getPathWithoutLang(enUrl)
    const hasSvVersion = finalPool.some(u => getPathWithoutLang(u) === enPath)
    if (!hasSvVersion) {
      finalPool.push(enUrl)
    }
  }

  // 4. Gruppera efter typ och välj en av varje
  const selected: string[] = []
  const usedPaths = new Set<string>()

  for (const [type, regex] of Object.entries(PAGE_PATTERNS)) {
    const match = finalPool.find(u => {
      try {
        const path = new URL(u).pathname.toLowerCase()
        return regex.test(path) && !usedPaths.has(path)
      } catch {
        return false
      }
    })
    if (match) {
      selected.push(match)
      usedPaths.add(new URL(match).pathname)
    }
  }

  // 5. Fyll på med övriga om plats kvar
  const remaining = finalPool.filter(u => !selected.includes(u))
  while (selected.length < max && remaining.length > 0) {
    const next = remaining.shift()!
    selected.push(next)
  }

  return selected.slice(0, max)
}

export function extractSummary(html: string, url: string): PageSummary {
  const $ = cheerio.load(html)

  // Ta bort brus
  $('script, style, nav, footer, header, aside, iframe, noscript').remove()

  const bodyText = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800) // HÅRD GRÄNS: max 800 tecken per sida

  const schemaScripts: string[] = []
  let hasLocalBusinessSchema = false
  let hasRestaurantSchema = false

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text().trim()
    if (text.length > 10) {
      schemaScripts.push(text.slice(0, 500)) // max 500 tecken per schema
      const lower = text.toLowerCase()
      if (lower.includes('localbusiness')) hasLocalBusinessSchema = true
      if (lower.includes('restaurant') || lower.includes('foodestablishment')) hasRestaurantSchema = true
    }
  })

  const phones = [...bodyText.matchAll(/(?:\+46|0)\s?[0-9]{1,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}/g)].map(m => m[0])
  const cities = [...bodyText.matchAll(new RegExp(`\\b(?:${SWEDISH_CITIES.join('|')})\\b`, 'g'))].map(m => m[0])

  const menuSummary = bodyText.includes('kr') && (bodyText.includes('menu') || bodyText.includes('meny') || bodyText.includes('rätt') || bodyText.includes('ratt'))
    ? 'Innehåller meny med priser'
    : bodyText.includes('kr')
    ? 'Innehåller prisuppgifter'
    : 'Ingen meny/priser hittade'

  const hasContactInfo = phones.length > 0 || bodyText.includes('@') || /kontakt|contact|telefon|tel/i.test(bodyText)

  return {
    url,
    title: $('title').text().slice(0, 200),
    metaDescription: $('meta[name="description"]').attr('content')?.slice(0, 300) || '',
    h1: $('h1').first().text().slice(0, 200),
    h2s: $('h2').map((_, el) => $(el).text().slice(0, 150)).get().slice(0, 3),
    bodyText,
    schemaScripts,
    hasLocalBusinessSchema,
    hasRestaurantSchema,
    phones: [...new Set(phones)],
    cities: [...new Set(cities)],
    menuSummary,
    hasContactInfo,
  }
}

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  // 1. Hämta förstasidan
  const mainRes = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000)
  })
  const mainHtml = await mainRes.text()

  // 2. Hämta robots, sitemap, llms parallellt
  const base = new URL(url).origin

  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
    fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    fetch(`${base}/llms.txt`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
  ])

  const robotsTxt = robotsRes?.ok ? await robotsRes.text() : null
  const sitemapXml = sitemapRes?.ok ? await sitemapRes.text() : null
  const llmsTxt = llmsRes?.ok ? await llmsRes.text() : null
  const sitemapUrlCount = sitemapXml ? (sitemapXml.match(/<url>/g) || []).length : null

  // 3. Parsa sitemap och välj sidor
  let extraUrls: string[] = []

  if (sitemapXml && sitemapUrlCount && sitemapUrlCount > 0 && sitemapUrlCount < 500) {
    const urlMatches = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)]
    const allUrls = urlMatches.map(m => m[1]).filter(u => u.startsWith(base))
    extraUrls = filterAndSelectUrls(allUrls, url, 4)
  } else {
    // Fallback: extrahera interna länkar från förstasidan
    const linkMatches = [...mainHtml.matchAll(/href="(\/[^"]+)"/g)]
    const internalPaths = [...new Set(linkMatches.map(m => m[1]))]
      .filter(path =>
        !path.startsWith('/wp-') &&
        !path.startsWith('/wp-content/') &&
        !path.includes('.pdf') &&
        !path.includes('.jpg') &&
        !path.includes('.png') &&
        !path.includes('/tag/') &&
        !path.includes('/category/') &&
        !path.includes('/author/')
      )
      .map(path => new URL(path, base).toString())

    extraUrls = filterAndSelectUrls(internalPaths, url, 4)
  }

  // 4. Hämta extra sidor parallellt
  const extraPages = await Promise.all(
    extraUrls.map(async (pageUrl) => {
      try {
        const res = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000)
        })
        if (!res.ok) return null
        const html = await res.text()
        return extractSummary(html, pageUrl)
      } catch {
        return null
      }
    })
  )

  // 5. Bygg huvudsidan och kombinera
  const mainPage = extractSummary(mainHtml, url)
  const validExtras = extraPages.filter((p): p is PageSummary => p !== null)

  return {
    url,
    robotsTxt,
    sitemapXml,
    llmsTxt,
    sitemapUrlCount,
    pages: [mainPage, ...validExtras],
  }
}
