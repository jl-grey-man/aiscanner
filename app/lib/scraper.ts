import * as cheerio from 'cheerio'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      headers: { ...BROWSER_HEADERS, ...init.headers },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export interface PageSummary {
  url: string
  title: string
  metaDescription: string
  h1: string
  h2s: string[]
  bodyText: string
  schemaScripts: string[]
  schemaTypes: string[]
  hasLocalBusinessSchema: boolean
  hasAnyLocalBusinessSchema: boolean
  hasRestaurantSchema: boolean
  canonical: string | null
  hasGoogleMaps: boolean
  phones: string[]
  cities: string[]
  menuSummary: string
  hasContactInfo: boolean
  altTextCoverage: { total: number; withAlt: number; percentage: number }
  internalLinks: {
    total: number
    uniquePages: number
    hasContactLink: boolean
    hasAboutLink: boolean
    hasServicesLink: boolean
  }
  semanticHTML: {
    hasMain: boolean
    hasArticle: boolean
    hasSection: boolean
    hasNav: boolean
    hasAside: boolean
    langAttribute: string | null
  }
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
  'Umeå', 'Lund', 'Borås', 'Huddinge', 'Eskilstuna', 'Gävle',
  'Södertälje', 'Karlstad', 'Täby', 'Växjö', 'Halmstad', 'Sundsvall',
  'Luleå', 'Trollhättan', 'Östersund', 'Borlänge', 'Falun', 'Kalmar',
  'Skövde', 'Kristianstad', 'Karlskrona', 'Skellefteå', 'Uddevalla',
  'Varberg', 'Örnsköldsvik', 'Nyköping', 'Lidingö', 'Motala',
  'Landskrona', 'Visby', 'Kiruna', 'Ystad', 'Mora', 'Arvika',
  'Katrineholm', 'Enköping', 'Trelleborg', 'Ängelholm', 'Mariestad',
  'Alingsås',
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

// Schema.org subtypes that are subclasses of LocalBusiness
const LOCAL_BUSINESS_SUBTYPES = [
  'localbusiness', 'restaurant', 'foodestablishment', 'cafe', 'bakery', 'barorsub',
  'fastfoodrestaurant', 'icecreamshop', 'pizza', 'winerysub',
  'automotivebusiness', 'autorepair', 'autodealer', 'gasstation',
  'healthandbeuty', 'beautysalon', 'hairsalon', 'healthclub', 'spa', 'tattoopalor',
  'medicalorganization', 'dentist', 'physician', 'hospital', 'pharmacy', 'optician',
  'veterinarycare',
  'realestate', 'realestateagent', 'lodgingbusiness', 'hotel', 'hostel', 'motel',
  'financialservice', 'accountingservice', 'bankorsub', 'insuranceagency',
  'homeandconstructionbusiness', 'electrician', 'generalcontractor', 'hvacbusiness',
  'housepaintingordecorating', 'locksmith', 'movingcompany', 'plumber', 'roofingcontractor',
  'legalservice', 'attorney', 'notary',
  'professionalservice', 'accountant', 'architect',
  'store', 'bookstore', 'clothingstore', 'computerstore', 'floristandgardensupply',
  'furniturestore', 'groceryorsupers', 'hardwarestore', 'hobbyshop', 'homegoods',
  'jewellerystore', 'liquorstore', 'movierentalorsale', 'musicstore', 'officesupply',
  'outletstore', 'pawnshop', 'petstore', 'shoestore', 'sportinggoods', 'tirestore',
  'toystore', 'wholesalestore',
  'sportactivity', 'sportscluborsub', 'bowlingalley', 'golfcourse', 'tenniscomplex',
  'sportsactivity', 'fitnesscentre',
  'entertainmentbusiness', 'amusementpark', 'artgallery', 'casino', 'comedyclub',
  'movietheater', 'nightclub',
  'childcare', 'educationalorganization', 'school', 'preschool', 'daycare',
  'foodanddrinkestablishment', 'bar', 'brewery', 'distillery', 'winery',
]

export function extractSummary(html: string, url: string): PageSummary {
  const $ = cheerio.load(html)

  // 1. EXTRAHERA SCHEMA FÖRST (innan script-taggar tas bort)
  const schemaScripts: string[] = []
  const schemaTypes: string[] = []
  let hasLocalBusinessSchema = false
  let hasAnyLocalBusinessSchema = false
  let hasRestaurantSchema = false

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text().trim()
    if (text.length > 10) {
      schemaScripts.push(text.slice(0, 500)) // max 500 tecken per schema
      try {
        const parsed = JSON.parse(text)
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of items) {
          const typeRaw = item['@type']
          const types = Array.isArray(typeRaw) ? typeRaw : typeRaw ? [typeRaw] : []
          for (const t of types) {
            const tStr = String(t)
            schemaTypes.push(tStr)
            const lower = tStr.toLowerCase()
            if (lower === 'localbusiness') hasLocalBusinessSchema = true
            if (LOCAL_BUSINESS_SUBTYPES.some(sub => lower.includes(sub))) {
              hasAnyLocalBusinessSchema = true
            }
            if (lower.includes('restaurant') || lower.includes('foodestablishment') ||
                lower.includes('cafe') || lower.includes('bakery') || lower.includes('bar') ||
                lower.includes('brewery') || lower.includes('winery')) {
              hasRestaurantSchema = true
            }
          }
        }
      } catch {
        // Fallback: text-based detection for malformed JSON
        const lower = text.toLowerCase()
        if (lower.includes('"localbusiness"') || lower.includes("'localbusiness'")) {
          hasLocalBusinessSchema = true
          hasAnyLocalBusinessSchema = true
        }
        LOCAL_BUSINESS_SUBTYPES.forEach(sub => {
          if (lower.includes(`"${sub}"`) || lower.includes(`'${sub}'`)) {
            hasAnyLocalBusinessSchema = true
          }
        })
        if (lower.includes('"restaurant"') || lower.includes('"foodestablishment"') ||
            lower.includes('"cafe"') || lower.includes('"bakery"')) {
          hasRestaurantSchema = true
        }
      }
    }
  })

  // 2. Extrahera canonical INNAN element tas bort
  const canonical = $('link[rel="canonical"]').attr('href') || null

  // 3. Detektera Google Maps INNAN iframe tas bort
  let hasGoogleMaps = false
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || ''
    if (/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i.test(src)) {
      hasGoogleMaps = true
    }
  })
  // Kolla även vanliga länktexter och embeds
  if (!hasGoogleMaps) {
    const rawHtml = $.html()
    if (/google\.com\/maps|maps\.google\.com|goo\.gl\/maps/i.test(rawHtml)) {
      hasGoogleMaps = true
    }
  }

  // 3b. Alt-texter (task 1.2) — INNAN script-taggar tas bort
  const allImgs = $('img')
  const totalImgs = allImgs.length
  const withAltImgs = allImgs.filter((_, el) => {
    const alt = $(el).attr('alt')
    return alt !== undefined && alt !== ''
  }).length
  const altTextCoverage = totalImgs === 0
    ? { total: 0, withAlt: 0, percentage: 100 }
    : { total: totalImgs, withAlt: withAltImgs, percentage: Math.round((withAltImgs / totalImgs) * 100) }

  // 3c. Internlänkning (task 1.3) — INNAN nav tas bort
  let pageHostname: string
  try {
    pageHostname = new URL(url).hostname
  } catch {
    pageHostname = ''
  }
  const internalHrefs = new Set<string>()
  let internalLinkTotal = 0
  let hasContactLink = false
  let hasAboutLink = false
  let hasServicesLink = false
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    let normalized: string | null = null
    if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
      try {
        const resolved = new URL(href, url)
        normalized = resolved.pathname.toLowerCase().replace(/\/$/, '') || '/'
      } catch {
        // skip
      }
    } else {
      try {
        const parsed = new URL(href)
        if (parsed.hostname === pageHostname) {
          normalized = parsed.pathname.toLowerCase().replace(/\/$/, '') || '/'
        }
      } catch {
        // skip
      }
    }
    if (normalized !== null) {
      internalLinkTotal++
      internalHrefs.add(normalized)
      if (/kontakt|contact/.test(normalized)) hasContactLink = true
      if (/om(-|_)?oss|about/.test(normalized)) hasAboutLink = true
      if (/tj[aä]nster|services|behandlingar|menu|meny/.test(normalized)) hasServicesLink = true
    }
  })
  const internalLinks = {
    total: internalLinkTotal,
    uniquePages: internalHrefs.size,
    hasContactLink,
    hasAboutLink,
    hasServicesLink,
  }

  // 3d. Semantisk HTML + språk (task 1.4) — INNAN nav/aside/article tas bort
  const semanticHTML = {
    hasMain: $('main').length > 0,
    hasArticle: $('article').length > 0,
    hasSection: $('section').length > 0,
    hasNav: $('nav').length > 0,
    hasAside: $('aside').length > 0,
    langAttribute: $('html').attr('lang') || null,
  }

  // 4. Ta bort brus
  $('script, style, nav, footer, header, aside, iframe, noscript').remove()

  const bodyText = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800) // HÅRD GRÄNS: max 800 tecken per sida

  // Telefon: bodyText-regex + JSON-LD "telephone" (AI-sökmotorer läser structured data)
  const bodyPhones = Array.from(bodyText.matchAll(/(?:\+46|0)\s?[0-9]{1,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}/g)).map(m => m[0])
  const schemaPhones: string[] = []
  for (const script of schemaScripts) {
    try {
      const parsed = JSON.parse(script)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (typeof item.telephone === 'string' && item.telephone.trim()) {
          schemaPhones.push(item.telephone.trim())
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  const phones = Array.from(new Set([...bodyPhones, ...schemaPhones]))

  // Stad: case-insensitive (GÖTEBORG, göteborg, Göteborg alla matchar)
  const cities = Array.from(bodyText.matchAll(new RegExp(`(?<![a-zA-ZåäöÅÄÖ])(?:${SWEDISH_CITIES.join('|')})(?![a-zA-ZåäöÅÄÖ])`, 'gi'))).map(m => m[0])

  const menuSummary = bodyText.includes('kr') && (bodyText.includes('menu') || bodyText.includes('meny') || bodyText.includes('rätt') || bodyText.includes('ratt'))
    ? 'Innehåller meny med priser'
    : bodyText.includes('kr')
    ? 'Innehåller prisuppgifter'
    : 'Ingen meny/priser hittade'

  const hasContactInfo = phones.length > 0 || /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(bodyText) || /kontakt|contact|telefon|\btel\b/i.test(bodyText)

  return {
    url,
    title: $('title').text().slice(0, 200),
    metaDescription: $('meta[name="description"]').attr('content')?.slice(0, 300) || '',
    h1: $('h1').first().text().slice(0, 200),
    h2s: $('h2').map((_, el) => $(el).text().slice(0, 150)).get().slice(0, 3),
    bodyText,
    schemaScripts,
    schemaTypes: Array.from(new Set(schemaTypes)),
    hasLocalBusinessSchema,
    hasAnyLocalBusinessSchema,
    hasRestaurantSchema,
    canonical,
    hasGoogleMaps,
    phones,
    cities: Array.from(new Set(cities)),
    menuSummary,
    hasContactInfo,
    altTextCoverage,
    internalLinks,
    semanticHTML,
  }
}

function getFetchErrorMessage(err: any, url: string): string {
  const msg = err?.message || String(err)
  const causeMsg = err?.cause?.message || ''
  const fullMsg = msg + ' ' + causeMsg

  if (fullMsg.includes('ENOTFOUND') || fullMsg.includes('getaddrinfo') || fullMsg.includes('failed to resolve')) {
    return `Kunde inte hitta servern för ${url} — kontrollera att domänen stämmer`
  }
  if (fullMsg.includes('ETIMEDOUT') || fullMsg.includes('timeout') || err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return `Servern svarade inte i tid (${url}) — prova igen om en stund`
  }
  if (fullMsg.includes('ECONNREFUSED')) {
    return `Anslutningen nekades till ${url} — servern verkar vara nere`
  }
  if (fullMsg.includes('CERT_') || fullMsg.includes('certificate') || fullMsg.includes('SSL')) {
    return `SSL-certifikatfel för ${url}`
  }
  if (fullMsg.includes('redirect') || fullMsg.includes('REDIRECT')) {
    return `För många omdirigeringar från ${url}`
  }
  // WAF-blockering (t.ex. Cloudflare 466)
  if (err?.status === 466 || fullMsg.includes('466')) {
    return `${url} blockerade anslutningen (WAF). Försök med en annan URL.`
  }
  return `Kunde inte hämta ${url}: ${causeMsg || msg}`
}

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  // 1. Hämta förstasidan
  let mainRes: Response
  try {
    mainRes = await fetchWithTimeout(url, {}, 15000)
  } catch (err: any) {
    throw new Error(getFetchErrorMessage(err, url))
  }
  if (!mainRes.ok) {
    throw new Error(`Servern svarade med status ${mainRes.status} för ${url}`)
  }
  const mainHtml = await mainRes.text()

  // 2. Hämta robots, sitemap, llms parallellt
  const base = new URL(url).origin

  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
    fetchWithTimeout(`${base}/robots.txt`, {}, 8000).catch(() => null),
    fetchWithTimeout(`${base}/sitemap.xml`, {}, 8000).catch(() => null),
    fetchWithTimeout(`${base}/llms.txt`, {}, 8000).catch(() => null),
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
    const linkMatches = Array.from(mainHtml.matchAll(/href="(\/[^"]+)"/g))
    const internalPaths = Array.from(new Set(linkMatches.map(m => m[1])))
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
        const res = await fetchWithTimeout(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }, 8000)
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
