import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/app/lib/scraper'
import { analyzeWithFlash, analyzeWithPro } from '@/app/lib/gemini'
import { buildFreePrompt, buildPremiumPrompt } from '@/app/lib/prompts'
import { findBusinessByUrl, getPlaceDetails } from '@/app/lib/places'
import { redis } from '@/app/lib/redis'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400 })
    }

    // 1. Kör gratis-analys internt (eller hämta cache)
    const cacheKey = `scan:${Buffer.from(url).toString('base64')}`
    let freeReport: any = await redis.get(cacheKey)

    if (!freeReport) {
      const scraped = await scrapeWebsite(url)
      const freePrompt = buildFreePrompt(scraped)
      freeReport = await analyzeWithFlash(freePrompt)
      await redis.setex(cacheKey, 86400, JSON.stringify(freeReport))
    } else {
      freeReport = JSON.parse(freeReport)
    }

    // 2. Hämta Google Places data med ortshint från skanningen
    const cityHint = freeReport?.localSignals?.cityName || undefined
    const place = await findBusinessByUrl(url, cityHint)

    let placeDetails = null
    let reviews: any[] = []

    if (place?.id) {
      placeDetails = await getPlaceDetails(place.id)
      reviews = placeDetails?.reviews || []
    }

    // 3. Premium-analys
    const premiumPrompt = buildPremiumPrompt(freeReport, placeDetails || place, reviews)
    const premiumReport = await analyzeWithPro(premiumPrompt)

    // 4. Spara premium-cache
    const premiumKey = `fullscan:${Buffer.from(url).toString('base64')}`
    await redis.setex(premiumKey, 86400, JSON.stringify(premiumReport))

    return NextResponse.json({
      free: freeReport,
      premium: premiumReport,
      hasPlaceData: !!place,
      placeVerified: place?._domainMatch === true
    })

  } catch (err: any) {
    console.error('Full scan error:', err)
    return NextResponse.json({ error: 'Full scan misslyckades', detail: err.message }, { status: 500 })
  }
}
