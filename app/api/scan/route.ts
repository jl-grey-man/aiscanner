import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/app/lib/scraper'
import { analyzeWithFlash } from '@/app/lib/gemini'
import { buildFreePrompt } from '@/app/lib/prompts'
import { redis } from '@/app/lib/redis'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400 })
    }

    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rateKey = `ratelimit:${ip}`
    const current = await redis.incr(rateKey)
    if (current === 1) await redis.expire(rateKey, 3600)
    if (current > 3) {
      return NextResponse.json({ error: 'Max 3 analyser per timme' }, { status: 429 })
    }

    // Cache
    const cacheKey = `scan:${Buffer.from(url).toString('base64')}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json({ cached: true, data: JSON.parse(cached) })
    }

    // Scrape + Analyze
    const scraped = await scrapeWebsite(url)
    const prompt = buildFreePrompt(scraped)
    const analysis = await analyzeWithFlash(prompt)

    // Spara
    await redis.setex(cacheKey, 86400, JSON.stringify(analysis))

    return NextResponse.json({ cached: false, data: analysis })
  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ error: 'Analysen misslyckades', detail: err.message }, { status: 500 })
  }
}
