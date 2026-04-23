import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/app/lib/scraper'
import { analyzeWithFlash } from '@/app/lib/gemini'
import { buildFreePrompt } from '@/app/lib/prompts'

function ensurePhases(analysis: any): any {
  if (analysis.phases && analysis.phases.length > 0) {
    // Filter out phases with empty/missing checks
    analysis.phases = analysis.phases.filter((p: any) =>
      Array.isArray(p.checks) && p.checks.length > 0
    )
    if (analysis.phases.length > 0) {
      return analysis
    }
  }

  // Fallback: build phases from categories + criticalIssues + quickWins
  const categories: Record<string, { label: string; checks: any[] }> = {
    technical: { label: 'Teknisk grund', checks: [] },
    local: { label: 'Lokal synlighet', checks: [] },
    aireadiness: { label: 'AI-beredskap', checks: [] },
    content: { label: 'Innehåll', checks: [] },
  }

  // Map critical issues to checks
  for (const issue of analysis.criticalIssues || []) {
    const cat = issue.category || 'technical'
    const key = categories[cat] ? cat : 'technical'
    categories[key].checks.push({
      title: issue.title,
      status: issue.severity === 'high' ? 'bad' : 'warning',
      finding: issue.description,
      what: issue.description,
      why: 'Påverkar AI-synlighet och sökresultat',
      fix: issue.fix,
    })
  }

  // Map quick wins to good checks
  for (const win of analysis.quickWins || []) {
    categories.content.checks.push({
      title: win.title,
      status: 'good',
      finding: win.fix,
      fix: win.fix,
    })
  }

  // If a category has no checks, add a generic one based on its score
  for (const [key, cat] of Object.entries(analysis.categories || {}) as [string, any][]) {
    const phase = categories[key]
    if (phase && phase.checks.length === 0) {
      phase.checks.push({
        title: `${cat.label} — övergripande bedömning`,
        status: cat.score >= 7 ? 'good' : cat.score >= 4 ? 'warning' : 'bad',
        finding: `Poäng ${cat.score}/10 för ${cat.label.toLowerCase()}`,
      })
    }
  }

  // Build phases array
  const phases = Object.entries(categories)
    .filter(([_, p]) => p.checks.length > 0)
    .map(([id, p]) => ({ id, label: p.label, checks: p.checks }))

  if (phases.length === 0) {
    // Ultimate fallback: one generic phase
    phases.push({
      id: 'general',
      label: 'Generell bedömning',
      checks: [{
        title: 'Övergripande analys',
        status: analysis.score >= 50 ? 'warning' : 'bad',
        finding: analysis.summary || 'Ingen detaljerad data tillgänglig',
      }],
    })
  }

  analysis.phases = phases
  return analysis
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400 })
    }

    // Scrape + Analyze
    const scraped = await scrapeWebsite(url)
    const prompt = buildFreePrompt(scraped)
    const analysis = await analyzeWithFlash(prompt)

    // Ensure phases always exist for the UI
    ensurePhases(analysis)

    return NextResponse.json({ data: analysis })
  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ error: 'Analysen misslyckades', detail: err.message }, { status: 500 })
  }
}
