const DIRECTORY_DOMAINS: Record<string, string> = {
  'eniro.se': 'Eniro',
  'gulasidorna.se': 'Gulasidorna',
  'hitta.se': 'Hitta',
  'ratsit.se': 'Ratsit',
  'allabolag.se': 'Allabolag',
  'merinfo.se': 'Merinfo',
  '118100.se': '118100',
}

const ACTIVE_CHECK_DIRS = ['Eniro', 'Hitta']
const ACTIVE_CHECK_DOMAINS: Record<string, string> = {
  Eniro: 'eniro.se',
  Hitta: 'hitta.se',
}

export interface NAP {
  phone?: string
  address?: string
}

export interface DirectoryCheckItem {
  name: string
  found: boolean
  source: 'sameAs' | 'tavily' | 'not_found'
  profileUrl?: string
  nap?: NAP
}

export interface NAPField {
  values: Array<{ directory: string; value: string }>
  consistent: boolean | null
}

export interface NAPConsistency {
  checked: boolean
  consistent: boolean | null
  phone: NAPField
  address: NAPField
  finding: string
  fix: string
}

export interface DirectoryResult {
  foundInSameAs: string[]
  directories: DirectoryCheckItem[]
  foundCount: number
  totalChecked: number
  napConsistency: NAPConsistency
  status: 'ok' | 'warning' | 'bad'
  finding: string
  fix: string
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isDirectoryUrl(url: string): string | null {
  const domain = extractDomainFromUrl(url)
  return DIRECTORY_DOMAINS[domain] || null
}

// Prefer actual firm listing URLs over map/search results
function rankListingUrl(url: string, domain: string): number {
  if (domain === 'eniro.se') {
    if (url.includes('/firma')) return 3
    if (url.includes('/foretag')) return 2
    if (url.includes('/kartor') || url.includes('/search')) return 0
    return 1
  }
  if (domain === 'hitta.se') {
    if (url.includes('/foretag/') || url.match(/\/[a-z0-9]{6,}/)) return 3
    return 1
  }
  return 1
}

function extractPhoneFromText(text: string): string | undefined {
  // Swedish phone patterns: 031-123 45 67, 0700-12 34 56, +46 31 123 45 67
  const patterns = [
    /(?:\+46|0046)\s?[\d\s\-]{8,14}/,
    /0\d{1,3}[-\s]\d{2,3}[-\s]\d{2}[-\s]\d{2}/,
    /0\d{8,10}/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[0].replace(/\s+/g, ' ').trim()
  }
  return undefined
}

const STREET_SUFFIX = '(?:gata|gatan|väg|vägen|gränd|torg|torget|plats|platsen|allé|allén|stig|stigen|led|leden)'

function extractAddressFromText(text: string): string | undefined {
  // Pattern 1: "Gatannamn 12, 41767 Göteborg" or "Gatannamn 12, Göteborg"
  // Handles both single-word ("Kungsgatan") and compound ("Malös gata", "Maj på Malös gata")
  const p1 = new RegExp(
    `[\\wÅÄÖåäö\\s]+\\s+${STREET_SUFFIX}\\s+\\d+[A-Z]?,\\s*(?:\\d{5}\\s+)?[A-ZÅÄÖ][a-zåäö]+`,
    'i'
  )
  const m1 = text.match(p1)
  if (m1) {
    // Trim leading noise (keep max 4 words before the street suffix)
    const raw = m1[0].trim()
    const parts = raw.split(/\s+/)
    const suffixIdx = parts.findIndex(p => /^(gata|gatan|väg|vägen|gränd|torg|torget|plats|platsen|allé|allén|stig|stigen|led|leden)$/i.test(p))
    if (suffixIdx > 4) {
      return parts.slice(suffixIdx - 4).join(' ')
    }
    return raw
  }

  // Pattern 2: Postal code + city  "41767 Göteborg" with preceding address fragment
  const p2 = /[A-ZÅÄÖ][a-zåäö]+\s+\d+[A-Z]?,\s*\d{5}\s+[A-ZÅÄÖ][a-zåäö]+/
  const m2 = text.match(p2)
  if (m2) return m2[0].trim()

  return undefined
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\.]/g, '').replace(/^0046/, '+46').replace(/^\+46/, '0')
}

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    // Strip Swedish postal code (3+2 digits), written with or without the
    // conventional space ("411 36" or "41136") — GBP's formattedAddress always
    // uses the spaced form, while directory extractions vary.
    .replace(/\b\d{3}\s?\d{2}\b\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Legal-form suffixes carry no identifying value for name matching (almost every
// Swedish company name includes one), so they are excluded from the significant-word set.
const COMPANY_NAME_STOPWORDS = new Set(['ab', 'hb', 'kb', 'ek', 'förening'])

function significantCompanyWords(companyName: string): string[] {
  return companyName
    .split(/\s+/)
    .map(w => w.replace(/[.,()]/g, ''))
    .filter(w => w.length > 1 && !COMPANY_NAME_STOPWORDS.has(w.toLowerCase()))
}

/**
 * Does this Tavily result text actually mention the company we searched for? Tavily's
 * `site:`-search can surface a listing for a completely unrelated business (e.g. a
 * different company that happens to share part of the query) — such a result must not
 * be trusted as "found" or contribute its address/phone to the NAP comparison.
 */
function resultMatchesCompany(text: string, companyName: string): boolean {
  const words = significantCompanyWords(companyName)
  if (words.length === 0) return true // nothing distinctive to match on — don't filter
  const normText = text.toLowerCase()
  return words.some(w => normText.includes(w.toLowerCase()))
}

async function searchViaTavily(
  query: string,
  apiKey: string
): Promise<Array<{ url: string; content: string; title: string }>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    clearTimeout(timeout)
    return []
  }
}

async function checkDirectoryViaTavily(
  dirName: string,
  domain: string,
  companyName: string,
  city: string,
  apiKey: string
): Promise<{ found: boolean; profileUrl?: string; nap?: NAP }> {
  const query = `site:${domain} "${companyName}" ${city}`
  const results = await searchViaTavily(query, apiKey)

  if (results.length === 0) return { found: false }

  // Only trust results that actually mention the company — a result for an unrelated
  // business must not count as a listing at all (see resultMatchesCompany above).
  const matching = results.filter(r => resultMatchesCompany(`${r.title} ${r.content}`, companyName))
  if (matching.length === 0) return { found: false }

  // Pick best listing URL (prefer actual firm pages over search/map pages)
  const ranked = matching
    .map(r => ({ ...r, rank: rankListingUrl(r.url, domain) }))
    .sort((a, b) => b.rank - a.rank)

  const best = ranked[0]
  if (best.rank === 0) return { found: false } // only map results = not a real listing

  // Extract NAP from the matching results combined (map/search pages often have address in snippet)
  const allText = matching.map(r => r.content + ' ' + r.title).join(' ')
  const nap: NAP = {}
  const phone = extractPhoneFromText(allText)
  const address = extractAddressFromText(allText)
  if (phone) nap.phone = phone
  if (address) nap.address = address

  return {
    found: true,
    profileUrl: best.url,
    nap: Object.keys(nap).length > 0 ? nap : undefined,
  }
}

function buildNAPConsistency(directories: DirectoryCheckItem[], gbpNap?: NAP): NAPConsistency {
  const found = directories.filter(d => d.found && d.nap)
  const gbpProvidesData = !!(gbpNap && (gbpNap.phone || gbpNap.address))
  const totalSources = found.length + (gbpProvidesData ? 1 : 0)

  if (totalSources < 2) {
    return {
      checked: false,
      consistent: null,
      phone: { values: [], consistent: null },
      address: { values: [], consistent: null },
      finding: 'För få datakällor för NAP-jämförelse — behöver minst 2 kataloger med extraherad kontaktdata.',
      fix: '',
    }
  }

  const phoneValues = found
    .filter(d => d.nap?.phone)
    .map(d => ({ directory: d.name, value: d.nap!.phone! }))

  const addressValues = found
    .filter(d => d.nap?.address)
    .map(d => ({ directory: d.name, value: d.nap!.address! }))

  // Google Business Profile är den verifierade sanningskällan (kunden äger/bekräftar
  // den) — den ska alltid ingå som referensvärde, inte bara kataloger jämförda mot
  // varandra. Läggs först: jämförelsen nedan tar alla värden mot phoneValues[0]/
  // addressValues[0], så när GBP finns blir den referensen alla andra mäts mot.
  if (gbpNap?.phone) phoneValues.unshift({ directory: 'Google Business Profile', value: gbpNap.phone })
  if (gbpNap?.address) addressValues.unshift({ directory: 'Google Business Profile', value: gbpNap.address })

  const phonesNorm = phoneValues.map(v => normalizePhone(v.value))
  const addressesNorm = addressValues.map(v => normalizeAddress(v.value))

  const phoneConsistent = phonesNorm.length <= 1 || phonesNorm.every(p => p === phonesNorm[0])
  const addressConsistent = addressesNorm.length <= 1 || addressesNorm.every(a => a === addressesNorm[0])
  const consistent = phoneConsistent && addressConsistent

  const issues: string[] = []
  if (!phoneConsistent) issues.push('telefonnummer skiljer sig åt')
  if (!addressConsistent) issues.push('adress skiljer sig åt')

  return {
    checked: true,
    consistent,
    phone: { values: phoneValues, consistent: phoneConsistent },
    address: { values: addressValues, consistent: addressConsistent },
    finding: consistent
      ? 'NAP-data (namn, adress, telefon) är konsekvent över kataloger — bra för AI-entitetsmatchning.'
      : `Inkonsekvent NAP: ${issues.join(', ')}. AI-modeller kan misslyckas att koppla ihop listningarna som samma företag.`,
    fix: consistent
      ? ''
      : 'Uppdatera kataloglistningarna så att namn, adress och telefonnummer är identiska på alla ställen. Använd exakt samma format.',
  }
}

export async function checkSwedishDirectories(
  companyName: string,
  city: string,
  sameAsLinks: string[],
  gbpNap?: NAP
): Promise<DirectoryResult> {
  const tavilyApiKey = process.env.TAVILY_API_KEY || ''

  // Step 1: Find directories already in sameAs
  const foundInSameAs: string[] = []
  const sameAsDirNames = new Set<string>()

  for (const link of sameAsLinks) {
    const dirName = isDirectoryUrl(link)
    if (dirName && !sameAsDirNames.has(dirName)) {
      foundInSameAs.push(link)
      sameAsDirNames.add(dirName)
    }
  }

  // Step 2: Check each active directory via Tavily
  const directories: DirectoryCheckItem[] = []

  const checkPromises = ACTIVE_CHECK_DIRS.map(async (dirName) => {
    const domain = ACTIVE_CHECK_DOMAINS[dirName]

    // If already in sameAs, mark found (no Tavily call needed for presence)
    if (sameAsDirNames.has(dirName)) {
      const profileUrl = sameAsLinks.find(l => l.includes(domain))
      // Still try to get NAP via Tavily for consistency check
      let nap: NAP | undefined
      if (tavilyApiKey && companyName.length > 2) {
        const result = await checkDirectoryViaTavily(dirName, domain, companyName, city, tavilyApiKey)
        nap = result.nap
      }
      directories.push({ name: dirName, found: true, source: 'sameAs', profileUrl, nap })
      return
    }

    if (!tavilyApiKey || companyName.length <= 2) {
      directories.push({ name: dirName, found: false, source: 'not_found' })
      return
    }

    const result = await checkDirectoryViaTavily(dirName, domain, companyName, city, tavilyApiKey)
    directories.push({
      name: dirName,
      found: result.found,
      source: result.found ? 'tavily' : 'not_found',
      profileUrl: result.profileUrl,
      nap: result.nap,
    })
  })

  await Promise.all(checkPromises)

  const foundCount = directories.filter(d => d.found).length
  const totalChecked = directories.length
  const napConsistency = buildNAPConsistency(directories, gbpNap)

  let status: 'ok' | 'warning' | 'bad'
  let finding: string
  let fix: string

  const foundNames = directories.filter(d => d.found).map(d => d.name).join(', ')
  const missingNames = directories.filter(d => !d.found).map(d => d.name).join(', ')

  if (foundCount >= 2 && napConsistency.consistent === true) {
    status = 'ok'
    finding = `Företaget hittades på ${foundCount}/${totalChecked} kataloger (${foundNames}) med konsekvent NAP-data.`
    fix = ''
  } else if (foundCount >= 2 && napConsistency.consistent === false) {
    status = 'warning'
    finding = `Hittades på ${foundNames} men ${napConsistency.finding}`
    fix = napConsistency.fix
  } else if (foundCount >= 2 && napConsistency.consistent === null) {
    // Found on multiple directories but couldn't extract enough NAP data to compare
    status = 'ok'
    finding = `Företaget hittades på ${foundCount}/${totalChecked} kataloger (${foundNames}).`
    fix = ''
  } else if (foundCount === 1) {
    status = 'warning'
    finding = `Hittades på ${foundNames}. Saknas på: ${missingNames}.`
    fix = `Registrera på ${missingNames}. AI-modeller tränas på katalogdata — fler listningar stärker entitetsprofilen.`
  } else {
    status = 'bad'
    finding = `Hittades inte på någon av katalogerna (${directories.map(d => d.name).join(', ')}).`
    fix = `Registrera på Eniro och Hitta — gratis och stärker AI-synligheten avsevärt.`
  }

  return {
    foundInSameAs,
    directories,
    foundCount,
    totalChecked,
    napConsistency,
    status,
    finding,
    fix,
  }
}
