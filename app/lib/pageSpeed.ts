/**
 * pageSpeed.ts — Google PageSpeed Insights (PSI) data fetcher for #10 cwv check.
 *
 * Returns Core Web Vitals (LCP, CLS, INP) plus an overall performance score.
 * Prefers CrUX field data (real user metrics) when available, falls back to
 * Lighthouse lab data, falls back to notMeasured if neither is available.
 */

type CwvStatus = 'ok' | 'warning' | 'bad' | 'notMeasured'

export interface CwvMetrics {
  status: CwvStatus
  lcp: number | null // seconds
  cls: number | null // unitless
  inp: number | null // milliseconds
  performanceScore: number | null // 0-100
  source: 'field' | 'lab' | null
  finding: string
  fix: string | null
}

const GOOD_LCP_S = 2.5
const POOR_LCP_S = 4.0
const GOOD_CLS = 0.1
const POOR_CLS = 0.25
const GOOD_INP_MS = 200
const POOR_INP_MS = 500

function classifyLcp(lcp: number): 'good' | 'ni' | 'poor' {
  if (lcp <= GOOD_LCP_S) return 'good'
  if (lcp <= POOR_LCP_S) return 'ni'
  return 'poor'
}
function classifyCls(cls: number): 'good' | 'ni' | 'poor' {
  if (cls <= GOOD_CLS) return 'good'
  if (cls <= POOR_CLS) return 'ni'
  return 'poor'
}
function classifyInp(inp: number): 'good' | 'ni' | 'poor' {
  if (inp <= GOOD_INP_MS) return 'good'
  if (inp <= POOR_INP_MS) return 'ni'
  return 'poor'
}

export async function getCwvMetrics(url: string, timeoutMs = 12000): Promise<CwvMetrics> {
  const apiKey = process.env.GOOGLE_PSI_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return {
      status: 'notMeasured',
      lcp: null, cls: null, inp: null, performanceScore: null, source: null,
      finding: 'PageSpeed Insights-nyckel saknas — sidhastighet kunde inte mätas.',
      fix: null,
    }
  }

  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  psiUrl.searchParams.set('url', url)
  psiUrl.searchParams.set('key', apiKey)
  psiUrl.searchParams.set('category', 'PERFORMANCE')
  psiUrl.searchParams.set('strategy', 'MOBILE')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(psiUrl.toString(), { signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[PSI] ${res.status} for ${url}: ${body.slice(0, 200)}`)
      return {
        status: 'notMeasured',
        lcp: null, cls: null, inp: null, performanceScore: null, source: null,
        finding: `PageSpeed Insights-API svarade inte (HTTP ${res.status}).`,
        fix: null,
      }
    }

    const data: any = await res.json()

    // Prefer real-user (CrUX) field data when available — this is what Google ranks on
    const field = data.loadingExperience?.metrics
    let lcp: number | null = null
    let cls: number | null = null
    let inp: number | null = null
    let source: 'field' | 'lab' | null = null

    if (field && (field.LARGEST_CONTENTFUL_PAINT_MS || field.CUMULATIVE_LAYOUT_SHIFT_SCORE || field.INTERACTION_TO_NEXT_PAINT)) {
      source = 'field'
      const lcpMs = field.LARGEST_CONTENTFUL_PAINT_MS?.percentile
      const clsRaw = field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile
      const inpMs = field.INTERACTION_TO_NEXT_PAINT?.percentile
      lcp = typeof lcpMs === 'number' ? lcpMs / 1000 : null
      // CrUX returns CLS as integer ×100 (e.g. 9 means 0.09)
      cls = typeof clsRaw === 'number' ? clsRaw / 100 : null
      inp = typeof inpMs === 'number' ? inpMs : null
    } else {
      // Fall back to Lighthouse lab data
      const audits = data.lighthouseResult?.audits
      if (audits) {
        source = 'lab'
        const lcpAudit = audits['largest-contentful-paint']?.numericValue
        const clsAudit = audits['cumulative-layout-shift']?.numericValue
        const inpAudit = audits['interaction-to-next-paint']?.numericValue
          ?? audits['total-blocking-time']?.numericValue
        lcp = typeof lcpAudit === 'number' ? lcpAudit / 1000 : null
        cls = typeof clsAudit === 'number' ? clsAudit : null
        inp = typeof inpAudit === 'number' ? inpAudit : null
      }
    }

    const perfScoreRaw = data.lighthouseResult?.categories?.performance?.score
    const performanceScore = typeof perfScoreRaw === 'number' ? Math.round(perfScoreRaw * 100) : null

    if (lcp === null && cls === null && inp === null) {
      return {
        status: 'notMeasured',
        lcp: null, cls: null, inp: null, performanceScore, source: null,
        finding: 'PageSpeed Insights returnerade ingen mätbar data för denna sida.',
        fix: null,
      }
    }

    // Classify each metric, count "poor" + "ni"
    const classes = [
      lcp !== null ? classifyLcp(lcp) : null,
      cls !== null ? classifyCls(cls) : null,
      inp !== null ? classifyInp(inp) : null,
    ].filter(Boolean) as Array<'good' | 'ni' | 'poor'>

    const poorCount = classes.filter(c => c === 'poor').length
    const niCount = classes.filter(c => c === 'ni').length

    let status: CwvStatus
    if (poorCount === 0 && niCount === 0) status = 'ok'
    else if (poorCount === 0 && niCount <= 1) status = 'warning'
    else status = 'bad'

    const sourceLabel = source === 'field' ? 'CrUX-fältdata' : 'Lighthouse-labbdata'
    const parts: string[] = []
    if (lcp !== null) parts.push(`LCP ${lcp.toFixed(2)} s`)
    if (cls !== null) parts.push(`CLS ${cls.toFixed(3)}`)
    if (inp !== null) parts.push(`INP ${Math.round(inp)} ms`)
    const metricsStr = parts.join(', ')

    let finding: string
    let fix: string | null = null
    if (status === 'ok') {
      finding = `${metricsStr} (${sourceLabel}) — Core Web Vitals klarar Googles gränser.`
    } else if (status === 'warning') {
      finding = `${metricsStr} (${sourceLabel}) — ett mått ligger i "behöver förbättras"-zonen.`
      fix = 'Förbättra det måttet som ligger nära gränsen — optimera bilder/fonter (LCP), reservera utrymme för dynamiskt innehåll (CLS), eller minska JavaScript-arbete på huvudtråden (INP).'
    } else {
      const problems: string[] = []
      if (lcp !== null && classifyLcp(lcp) !== 'good') problems.push(`LCP ${lcp.toFixed(2)} s (mål: ≤${GOOD_LCP_S} s)`)
      if (cls !== null && classifyCls(cls) !== 'good') problems.push(`CLS ${cls.toFixed(3)} (mål: ≤${GOOD_CLS})`)
      if (inp !== null && classifyInp(inp) !== 'good') problems.push(`INP ${Math.round(inp)} ms (mål: ≤${GOOD_INP_MS} ms)`)
      finding = `${metricsStr} (${sourceLabel}) — flera Core Web Vitals klarar inte Googles gränser: ${problems.join('; ')}.`
      fix = 'Prioritera de mått som ligger sämst. LCP: optimera hero-bilder, fonter och server-svarstid. CLS: sätt explicit storlek på bilder/embeds. INP: minska tunga JS-bibliotek och tredjepartsskript.'
    }

    return { status, lcp, cls, inp, performanceScore, source, finding, fix }
  } catch (err: any) {
    const reason = err.name === 'AbortError' ? 'tog för lång tid (timeout)' : err.message
    console.warn(`[PSI] failed for ${url}: ${reason}`)
    return {
      status: 'notMeasured',
      lcp: null, cls: null, inp: null, performanceScore: null, source: null,
      finding: `PageSpeed Insights kunde inte mätas: ${reason}.`,
      fix: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}
