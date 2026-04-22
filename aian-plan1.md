# Atomic Implementation Plan — AI Scanner (pipod.net/analyze)
# För Kimi Code — implementera ett steg i taget, testa innan nästa

Instruktion till Kimi Code: Implementera steg 1–10 i ordning. Testa varje steg innan nästa. Fråga om något är oklart.

## Projektöversikt

 Uppdatera den befintliga appen, som analyserar svenska företags hemsidor för AI-sökningsberedskap. Två nivåer: (1) Gratis — analyserar HTML/robots/sitemap/llms.txt med Gemini Flash 2.0, max 3/timme, resultat direkt på sidan. (2) Premium (testläge) — triggar från en knapp på samma sida, analyserar med Gemini 2.5 Pro + Google Places API, resultat expanderar under knappen. Ingen PDF, ingen redirect — allt visas inline.

Teknisk stack: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Upstash Redis, Google Gemini API, Google Places API (New), cheerio, Vercel.

Miljövariabler (.env.local): GEMINI_API_KEY, GOOGLE_PLACES_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.

Regel: Varje steg nedan ska vara färdigt, deployat och testat innan nästa steg påbörjas.

---

## Steg 1: Setup & Grundstruktur

Mål: Repo, installationer, grundläggande sidstruktur.

Implementation:
1. Initiera Next.js-projekt om det inte finns: npx create-next-app@latest analyze-pipod --typescript --tailwind --app
2. Installera beroenden: npm install cheerio @upstash/redis @google/generative-ai
3. Skapa mappstruktur:
   app/api/scan/route.ts
   app/api/full-scan/route.ts
   app/components/ScanForm.tsx
   app/components/FreeReport.tsx
   app/components/FullScanButton.tsx
   app/components/FullReport.tsx
   app/lib/redis.ts
   app/lib/scraper.ts
   app/lib/gemini.ts
   app/lib/places.ts
   app/lib/prompts.ts
4. Skapa app/lib/redis.ts:
   import { Redis } from '@upstash/redis'
   export const redis = new Redis({
     url: process.env.UPSTASH_REDIS_REST_URL!,
     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
   })

Testkriterier: npm run dev startar utan fel. redis.ts importeras utan crash.

Acceptanskriterier:
- [ ] Projektet startar på localhost:3000
- [ ] Inga byggfel

---

## Steg 2: HTML-scraper utility

Mål: Hämta och parsa en webbsidas tekniska data.

Implementation: Skapa app/lib/scraper.ts:

import * as cheerio from 'cheerio'

export interface ScrapedData {
  url: string
  html: string
  title: string
  metaDescription: string
  robotsMeta: string | null
  h1: string
  h2s: string[]
  bodyText: string
  schemaScripts: string[]
  hasLocalBusinessSchema: boolean
  napHints: { phones: string[]; addresses: string[]; cities: string[] }
  robotsTxt: string | null
  sitemapXml: string | null
  llmsTxt: string | null
  sitemapUrlCount: number | null
}

export async function scrapeWebsite(url: string): Promise&lt;ScrapedData&gt; {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const html = await res.text()
  const $ = cheerio.load(html)

  const robotsUrl = new URL('/robots.txt', url).toString()
  const robotsRes = await fetch(robotsUrl).catch(() =&gt; null)
  const robotsTxt = robotsRes?.ok ? await robotsRes.text() : null

  const sitemapUrl = new URL('/sitemap.xml', url).toString()
  const sitemapRes = await fetch(sitemapUrl).catch(() =&gt; null)
  const sitemapXml = sitemapRes?.ok ? await sitemapRes.text() : null
  const sitemapUrlCount = sitemapXml ? (sitemapXml.match(/&lt;url&gt;/g) || []).length : null

  const llmsUrl = new URL('/llms.txt', url).toString()
  const llmsRes = await fetch(llmsUrl).catch(() =&gt; null)
  const llmsTxt = llmsRes?.ok ? await llmsRes.text() : null

  const schemaScripts: string[] = []
  let hasLocalBusinessSchema = false
  $('script[type="application/ld+json"]').each((_, el) =&gt; {
    const text = $(el).text()
    schemaScripts.push(text)
    if (text.includes('LocalBusiness')) hasLocalBusinessSchema = true
  })

  const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 15000)
  const phones = [...bodyText.matchAll(/(?:\+46|0)\s?[0-9]{1,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}/g)].map(m =&gt; m[0])
  const addresses = [...bodyText.matchAll(/\b[A-ZÅÄÖ][a-zåäö]+\s+(?:gata|väg|gränd|torg|plats)\s+\d+/gi)].map(m =&gt; m[0])
  const cities = [...bodyText.matchAll(/\b(?:Stockholm|Göteborg|Malmö|Uppsala|Linköping|Örebro|Västerås|Norrköping|Helsingborg|Jönköping|Umeå|Lund)\b/g)].map(m =&gt; m[0])

  return {
    url,
    html,
    title: $('title').text(),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    robotsMeta: $('meta[name="robots"]').attr('content') || null,
    h1: $('h1').first().text(),
    h2s: $('h2').map((_, el) =&gt; $(el).text()).get(),
    bodyText,
    schemaScripts,
    hasLocalBusinessSchema,
    napHints: { phones: [...new Set(phones)], addresses: [...new Set(addresses)], cities: [...new Set(cities)] },
    robotsTxt,
    sitemapXml,
    llmsTxt,
    sitemapUrlCount,
  }
}

Testkriterier: Anropa scrapeWebsite('https://example.com') i en temporär test-route. Verifiera att alla fält returneras. Testa med en riktig svensk företagssida.

Acceptanskriterier:
- [ ] Funktionen hämtar HTML, robots.txt, sitemap.xml, llms.txt parallellt
- [ ] Cheerio parsar titel, meta, h1, h2, schema-scripts korrekt
- [ ] NAP-hints hittar minst telefonnummer med regex
- [ ] Inga crashes vid 404 på robots/sitemap/llms

---

## Steg 3: Gemini Flash 2.0 utility

Mål: Skicka scrapad data till Gemini och få strukturerad JSON tillbaka.

Implementation: Skapa app/lib/gemini.ts:

import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function analyzeWithFlash(prompt: string) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' }
  })
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  return JSON.parse(text)
}

export async function analyzeWithPro(prompt: string) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-pro-preview-03-25',
    generationConfig: { responseMimeType: 'application/json' }
  })
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  return JSON.parse(text)
}

Skapa app/lib/prompts.ts med buildFreePrompt:

import { ScrapedData } from './scraper'

export function buildFreePrompt(data: ScrapedData): string {
  return `
Du är en svensk AI-sökningsanalytiker. Analysera hemsidan nedan för lokal AI-synlighet.
Svara ENDAST i JSON. Ingen markdown, ingen förklaring utanför JSON.

URL: ${data.url}
TITEL: ${data.title}
META DESCRIPTION: ${data.metaDescription}
ROBOTS META: ${data.robotsMeta || 'Saknas'}
H1: ${data.h1}
H2: ${data.h2s.join(' | ')}
ROBOTS.TXT: ${data.robotsTxt ? 'Finns' : 'Saknas'}
SITEMAP: ${data.sitemapXml ? `Finns, ${data.sitemapUrlCount} URL:er` : 'Saknas'}
LLMS.TXT: ${data.llmsTxt ? 'Finns' : 'Saknas'}
LOCALBUSINESS SCHEMA: ${data.hasLocalBusinessSchema ? 'Ja' : 'Nej'}
SCHEMA-SKRIPT: ${data.schemaScripts.join('\n---\n').slice(0, 3000)}
TELEFON HITTADE: ${data.napHints.phones.join(', ') || 'Inga'}
ORTER HITTADE: ${data.napHints.cities.join(', ') || 'Inga'}
BODY TEXT (första 3000 tecken): ${data.bodyText.slice(0, 3000)}

Returnera exakt detta JSON-schema:
{
  "score": 0-100,
  "summary": "2-3 meningar på svenska",
  "categories": {
    "technical": {"score": 0-10, "label": "Teknisk grund"},
    "local": {"score": 0-10, "label": "Lokal synlighet"},
    "aireadiness": {"score": 0-10, "label": "AI-beredskap"},
    "content": {"score": 0-10, "label": "Innehåll"}
  },
  "criticalIssues": [
    {
      "severity": "high|medium|low",
      "category": "technical|local|aireadiness|content",
      "title": "Svensk titel",
      "description": "Förklaring",
      "fix": "Exakt åtgärd",
      "codeExample": "null eller färdig kod"
    }
  ],
  "quickWins": [
    {"title": "...", "fix": "...", "effort": "small"}
  ],
  "localSignals": {
    "napFound": boolean,
    "cityFound": boolean,
    "cityName": "string eller null",
    "hasLocalBusinessSchema": boolean,
    "schemaType": "string eller null"
  }
}

Regler:
- score ska vara hård: &lt;50 allvarligt, 50-75 okej, &gt;75 bra
- Om LocalBusiness-schema saknas, ge färdig JSON-LD i codeExample med data från sidan
- Om ort saknas i titel/H1, föreslå exakt ny titel
- Var konkret, inga generiska råd
`
}

Testkriterier: Skapa en temporär test-route som anropar analyzeWithFlash(buildFreePrompt(testData)). Logga output. Verifiera att JSON parseas utan fel och att score och criticalIssues finns.

Acceptanskriterier:
- [ ] Gemini Flash 2.0 returnerar giltig JSON 5/5 gånger
- [ ] JSON innehåller alla obligatoriska fält
- [ ] codeExample fylls i när schema saknas

---

## Steg 4: Gratis API-route (/api/scan)

Mål: Endpoint som sammanför scraper + Gemini + rate limit + cache.

Implementation: Skapa app/api/scan/route.ts:

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

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rateKey = `ratelimit:${ip}`
    const current = await redis.incr(rateKey)
    if (current === 1) await redis.expire(rateKey, 3600)
    if (current &gt; 3) {
      return NextResponse.json({ error: 'Max 3 analyser per timme' }, { status: 429 })
    }

    const cacheKey = `scan:${Buffer.from(url).toString('base64')}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json({ cached: true, data: cached })
    }

    const scraped = await scrapeWebsite(url)
    const prompt = buildFreePrompt(scraped)
    const analysis = await analyzeWithFlash(prompt)

    await redis.setex(cacheKey, 86400, JSON.stringify(analysis))

    return NextResponse.json({ cached: false, data: analysis })
  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ error: 'Analysen misslyckades', detail: err.message }, { status: 500 })
  }
}

Testkriterier: curl -X POST http://localhost:3000/api/scan -H "Content-Type: application/json" -d '{"url":"https://example.com"}'. Verifiera JSON-response. Kör 4 gånger — fjärde ska ge 429. Kolla i Redis att cache skapas.

Acceptanskriterier:
- [ ] Returnerar analys-JSON för giltig URL
- [ ] Rate limit blockerar efter 3 anrop/timme
- [ ] Cache returnerar samma resultat utan ny Gemini-anrop
- [ ] 400 för ogiltig URL, 500 hanteras med felmeddelande

---

## Steg 5: Frontend — Input-form + Gratisrapport

Mål: Sida där användaren skriver URL och får gratisrapporten direkt.

Implementation: Skapa app/components/ScanForm.tsx:

'use client'

import { useState } from 'react'

export default function ScanForm({ onResult }: { onResult: (data: any, url: string) =&gt; void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fel')
      onResult(json.data, url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    &lt;form onSubmit={handleSubmit} className="space-y-4"&gt;
      &lt;input
        type="url"
        value={url}
        onChange={e =&gt; setUrl(e.target.value)}
        placeholder="https://dinfirma.se"
        required
        className="w-full p-3 border rounded"
      /&gt;
      &lt;button 
        type="submit" 
        disabled={loading}
        className="w-full p-3 bg-blue-600 text-white rounded disabled:opacity-50"
      &gt;
        {loading ? 'Analyserar...' : 'Analysera gratis'}
      &lt;/button&gt;
      {error && &lt;p className="text-red-600"&gt;{error}&lt;/p&gt;}
    &lt;/form&gt;
  )
}

Skapa app/components/FreeReport.tsx:

export default function FreeReport({ data }: { data: any }) {
  if (!data) return null

  return (
    &lt;div className="mt-8 space-y-6"&gt;
      &lt;div className="p-6 bg-gray-50 rounded-lg"&gt;
        &lt;h2 className="text-2xl font-bold mb-2"&gt;AI-Synlighet: {data.score}/100&lt;/h2&gt;
        &lt;p className="text-gray-700"&gt;{data.summary}&lt;/p&gt;
      &lt;/div&gt;

      &lt;div className="grid grid-cols-2 gap-4"&gt;
        {Object.entries(data.categories).map(([key, cat]: [string, any]) =&gt; (
          &lt;div key={key} className="p-4 border rounded"&gt;
            &lt;div className="text-sm text-gray-500"&gt;{cat.label}&lt;/div&gt;
            &lt;div className="text-xl font-bold"&gt;{cat.score}/10&lt;/div&gt;
          &lt;/div&gt;
        ))}
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold mb-3"&gt;Kritiska brister&lt;/h3&gt;
        &lt;div className="space-y-3"&gt;
          {data.criticalIssues?.map((issue: any, i: number) =&gt; (
            &lt;div key={i} className="p-4 border-l-4 border-red-500 bg-red-50"&gt;
              &lt;div className="font-semibold"&gt;{issue.title}&lt;/div&gt;
              &lt;div className="text-sm text-gray-700 mt-1"&gt;{issue.description}&lt;/div&gt;
              &lt;div className="text-sm mt-2"&gt;&lt;strong&gt;Fix:&lt;/strong&gt; {issue.fix}&lt;/div&gt;
              {issue.codeExample && (
                &lt;pre className="mt-2 p-2 bg-gray-800 text-green-400 text-xs overflow-auto rounded"&gt;
                  {issue.codeExample}
                &lt;/pre&gt;
              )}
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold mb-3"&gt;Quick Wins&lt;/h3&gt;
        &lt;div className="space-y-2"&gt;
          {data.quickWins?.map((win: any, i: number) =&gt; (
            &lt;div key={i} className="p-3 bg-green-50 border-l-4 border-green-500"&gt;
              &lt;div className="font-medium"&gt;{win.title}&lt;/div&gt;
              &lt;div className="text-sm"&gt;{win.fix}&lt;/div&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}

Uppdatera app/page.tsx:

'use client'

import { useState } from 'react'
import ScanForm from './components/ScanForm'
import FreeReport from './components/FreeReport'

export default function Home() {
  const [freeReport, setFreeReport] = useState(null)
  const [scannedUrl, setScannedUrl] = useState('')

  return (
    &lt;main className="max-w-2xl mx-auto p-6"&gt;
      &lt;h1 className="text-3xl font-bold mb-2"&gt;AI-Synlighetsanalys&lt;/h1&gt;
      &lt;p className="text-gray-600 mb-6"&gt;
        Se hur synlig din hemsida är för ChatGPT, Perplexity och Google AI.
      &lt;/p&gt;
      &lt;ScanForm onResult={(data, url) =&gt; { setFreeReport(data); setScannedUrl(url); }} /&gt;
      {freeReport && &lt;FreeReport data={freeReport} /&gt;}
    &lt;/main&gt;
  )
}

Testkriterier: Skriv in https://example.com i formuläret. Klicka "Analysera gratis". Vänta på resultat. Verifiera att score, kategorier, criticalIssues, quickWins visas. Testa ogiltig URL — ska visa fel. Testa 4:e anropet — ska visa rate limit-fel.

Acceptanskriterier:
- [ ] Formulär skickar POST till /api/scan
- [ ] Loader visas under analys
- [ ] Rapport renderas med alla sektioner
- [ ] Code blocks visas i monospace med syntax highlighting (grön text på mörk bakgrund)
- [ ] Responsiv layout (mobil + desktop)

---

## Steg 6: Google Places API utility

Mål: Hitta företagets Google Business Profile via URL eller namn.

Implementation: Skapa app/lib/places.ts:

export async function findBusinessByUrl(url: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const domain = new URL(url).hostname.replace(/^www\./, '')
  
  const res = await fetch(
    `https://places.googleapis.com/v1/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.editorialSummary,places.types',
      },
      body: JSON.stringify({
        textQuery: domain,
        languageCode: 'sv',
      }),
    }
  )

  if (!res.ok) return null
  const data = await res.json()
  return data.places?.[0] || null
}

export async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=sv`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,photos,editorialSummary,types,reviews',
      },
    }
  )
  if (!res.ok) return null
  return res.json()
}

Testkriterier: Anropa findBusinessByUrl('https://example.com') med en riktig svensk företagssida som har GBP. Verifiera att placeId, namn, adress, telefon returneras. Anropa getPlaceDetails med placeId. Verifiera att recensioner och öppettider finns.

Acceptanskriterier:
- [ ] Hittar företag för minst 3/5 testade svenska företags-URL:er
- [ ] Returnerar null gracefully om inget hittas
- [ ] Hanterar API-fel utan crash

---

## Steg 7: Premium prompt & Gemini 2.5 Pro utility

Mål: Bygga prompten för full-scan.

Implementation: Lägg till i app/lib/prompts.ts:

export function buildPremiumPrompt(
  freeReport: any,
  placeData: any,
  reviews: any[]
): string {
  return `
Du är en svensk lokal AI-sökningsstrateg. Du har grundrapporten och extern data.
Svara ENDAST i JSON.

GRUNDRAPPORT: ${JSON.stringify(freeReport, null, 2)}

GOOGLE BUSINESS PROFILE:
- Namn: ${placeData?.displayName?.text || 'Saknas'}
- Adress: ${placeData?.formattedAddress || 'Saknas'}
- Telefon: ${placeData?.nationalPhoneNumber || 'Saknas'}
- Kategorier: ${placeData?.types?.join(', ') || 'Saknas'}
- Betyg: ${placeData?.rating || 'Saknas'} (${placeData?.userRatingCount || 0} recensioner)
- Öppettider: ${JSON.stringify(placeData?.regularOpeningHours?.weekdayDescriptions) || 'Saknas'}
- Beskrivning: ${placeData?.editorialSummary?.text || 'Saknas'}

RECENSIONER (senaste 10):
${reviews.slice(0, 10).map((r: any) =&gt; `- ${r.rating} stjärnor: ${r.text?.text || 'Ingen text'}`).join('\n')}

Returnera exakt detta JSON:
{
  "score": 0-100,
  "summary": "2-3 meningar på svenska",
  "napConsistency": {
    "score": 0-10,
    "websiteNap": {"name": "...", "address": "...", "phone": "..."},
    "googleNap": {"name": "...", "address": "...", "phone": "..."},
    "issues": ["..."]
  },
  "gbpAnalysis": {
    "score": 0-10,
    "strengths": ["..."],
    "weaknesses": ["..."]
  },
  "reviewAnalysis": {
    "score": 0-10,
    "totalReviews": 0,
    "avgRating": 0,
    "sentiment": "positivt|blandat|negativt",
    "keywords": ["..."],
    "divergenceWarning": "string eller null"
  },
  "competitorComparison": [
    {
      "name": "Exempelkonkurrent",
      "score": 75,
      "whyTheyWin": "...",
      "yourGap": "..."
    }
  ],
  "tailoredFixes": [
    {
      "priority": 1,
      "title": "...",
      "action": "...",
      "code": "färdig kod om relevant",
      "expectedImpact": "Hög|Medium|Låg"
    }
  ]
}

Regler:
- Om GBP-data saknas, fokusera på vad som behövs för att skapa/optimera den
- Ge färdig JSON-LD LocalBusiness-schema med korrekt data från GBP
- Föreslå alltid 2-3 konkurrenter baserat på bransch och ort
- tailoredFixes ska vara rankad efter ROI för lokal AI-synlighet
`
}

Testkriterier: Skicka mock-data till analyzeWithPro(buildPremiumPrompt(mockFree, mockPlace, mockReviews)). Verifiera att JSON parseas. Kontrollera att tailoredFixes innehåller kodexempel.

Acceptanskriterier:
- [ ] Gemini 2.5 Pro returnerar giltig JSON 5/5 gånger
- [ ] JSON innehåller alla premium-fält
- [ ] tailoredFixes har färdig kod för schema

---

## Steg 8: Premium API-route (/api/full-scan)

Mål: Endpoint som kör gratisscan + Places + Pro-analys.

Implementation: Skapa app/api/full-scan/route.ts:

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

    const cacheKey = `scan:${Buffer.from(url).toString('base64')}`
    let freeReport = await redis.get(cacheKey)
    
    if (!freeReport) {
      const scraped = await scrapeWebsite(url)
      const freePrompt = buildFreePrompt(scraped)
      freeReport = await analyzeWithFlash(freePrompt)
      await redis.setex(cacheKey, 86400, JSON.stringify(freeReport))
    } else if (typeof freeReport === 'string') {
      freeReport = JSON.parse(freeReport)
    }

    const place = await findBusinessByUrl(url)
    let placeDetails = null
    let reviews: any[] = []
    
    if (place?.id) {
      placeDetails = await getPlaceDetails(place.id)
      reviews = placeDetails?.reviews || []
    }

    const premiumPrompt = buildPremiumPrompt(freeReport, placeDetails || place, reviews)
    const premiumReport = await analyzeWithPro(premiumPrompt)

    const premiumKey = `fullscan:${Buffer.from(url).toString('base64')}`
    await redis.setex(premiumKey, 86400, JSON.stringify(premiumReport))

    return NextResponse.json({ 
      free: freeReport, 
      premium: premiumReport,
      hasPlaceData: !!place 
    })

  } catch (err: any) {
    console.error('Full scan error:', err)
    return NextResponse.json({ error: 'Full scan misslyckades', detail: err.message }, { status: 500 })
  }
}

Testkriterier: curl -X POST http://localhost:3000/api/full-scan -H "Content-Type: application/json" -d '{"url":"https://example.com"}'. Verifiera att response innehåller både free och premium. Verifiera att hasPlaceData är boolean. Testa med URL som saknar GBP — ska fortfarande returnera premium med fokus på webb.

Acceptanskriterier:
- [ ] Returnerar både gratis- och premiumrapport
- [ ] Hämtar Places-data när det finns
- [ ] Fungerar även utan Places-data (graceful degradation)
- [ ] Cache för båda nivåerna

---

## Steg 9: Frontend — Full Scan-knapp + Premiumrapport

Mål: Knapp under gratisrapporten som triggar full-scan och expanderar resultatet.

Implementation: Skapa app/components/FullScanButton.tsx:

'use client'

import { useState } from 'react'

export default function FullScanButton({ url, onResult }: { 
  url: string
  onResult: (data: any) =&gt; void 
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/full-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fel')
      onResult(json.premium)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    &lt;div className="mt-8 p-6 bg-blue-50 rounded-lg text-center"&gt;
      &lt;h3 className="font-bold text-lg mb-2"&gt;Vill du se hur du står mot konkurrenterna?&lt;/h3&gt;
      &lt;p className="text-sm text-gray-600 mb-4"&gt;
        Full analys av Google Business Profile, recensioner, NAP-konsistens och konkurrenter.
      &lt;/p&gt;
      &lt;button
        onClick={handleClick}
        disabled={loading}
        className="px-6 py-3 bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
      &gt;
        {loading ? 'Analyserar marknaden...' : 'Kör Full Scan'}
      &lt;/button&gt;
      {error && &lt;p className="text-red-600 mt-2 text-sm"&gt;{error}&lt;/p&gt;}
    &lt;/div&gt;
  )
}

Skapa app/components/FullReport.tsx:

export default function FullReport({ data }: { data: any }) {
  if (!data) return null

  return (
    &lt;div className="mt-8 space-y-8 border-t-4 border-blue-600 pt-8"&gt;
      &lt;div className="p-6 bg-blue-50 rounded-lg"&gt;
        &lt;h2 className="text-2xl font-bold mb-2"&gt;Lokal AI-Dominans: {data.score}/100&lt;/h2&gt;
        &lt;p className="text-gray-700"&gt;{data.summary}&lt;/p&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold text-lg mb-3"&gt;NAP-konsistens ({data.napConsistency?.score}/10)&lt;/h3&gt;
        &lt;div className="grid grid-cols-2 gap-4 text-sm"&gt;
          &lt;div className="p-3 border rounded"&gt;
            &lt;div className="font-semibold"&gt;Webbsida&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.websiteNap?.name || '—'}&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.websiteNap?.address || '—'}&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.websiteNap?.phone || '—'}&lt;/div&gt;
          &lt;/div&gt;
          &lt;div className="p-3 border rounded"&gt;
            &lt;div className="font-semibold"&gt;Google&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.googleNap?.name || '—'}&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.googleNap?.address || '—'}&lt;/div&gt;
            &lt;div&gt;{data.napConsistency?.googleNap?.phone || '—'}&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        {data.napConsistency?.issues?.map((issue: string, i: number) =&gt; (
          &lt;div key={i} className="mt-2 text-red-600 text-sm"&gt;⚠️ {issue}&lt;/div&gt;
        ))}
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold text-lg mb-3"&gt;Google Business Profile ({data.gbpAnalysis?.score}/10)&lt;/h3&gt;
        &lt;div className="space-y-2 text-sm"&gt;
          &lt;div className="text-green-700"&gt;✅ {data.gbpAnalysis?.strengths?.join(', ')}&lt;/div&gt;
          &lt;div className="text-red-600"&gt;❌ {data.gbpAnalysis?.weaknesses?.join(', ')}&lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold text-lg mb-3"&gt;Recensioner ({data.reviewAnalysis?.score}/10)&lt;/h3&gt;
        &lt;div className="text-sm"&gt;
          &lt;div&gt;{data.reviewAnalysis?.totalReviews} recensioner, snitt {data.reviewAnalysis?.avgRating}&lt;/div&gt;
          &lt;div&gt;Sentiment: {data.reviewAnalysis?.sentiment}&lt;/div&gt;
          {data.reviewAnalysis?.divergenceWarning && (
            &lt;div className="text-red-600 mt-1"&gt;{data.reviewAnalysis.divergenceWarning}&lt;/div&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold text-lg mb-3"&gt;Konkurrenter&lt;/h3&gt;
        &lt;div className="space-y-3"&gt;
          {data.competitorComparison?.map((comp: any, i: number) =&gt; (
            &lt;div key={i} className="p-4 border rounded"&gt;
              &lt;div className="font-semibold"&gt;{comp.name} — {comp.score}/100&lt;/div&gt;
              &lt;div className="text-sm text-gray-600 mt-1"&gt;{comp.whyTheyWin}&lt;/div&gt;
              &lt;div className="text-sm text-red-600 mt-1"&gt;{comp.yourGap}&lt;/div&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h3 className="font-bold text-lg mb-3"&gt;Din handlingsplan&lt;/h3&gt;
        &lt;div className="space-y-4"&gt;
          {data.tailoredFixes?.map((fix: any, i: number) =&gt; (
            &lt;div key={i} className="p-4 bg-gray-50 border-l-4 border-blue-500 rounded"&gt;
              &lt;div className="flex items-center gap-2"&gt;
                &lt;span className="bg-blue-600 text-white text-xs px-2 py-1 rounded"&gt;#{fix.priority}&lt;/span&gt;
                &lt;span className="font-semibold"&gt;{fix.title}&lt;/span&gt;
                &lt;span className="text-xs bg-gray-200 px-2 py-1 rounded"&gt;{fix.expectedImpact} effekt&lt;/span&gt;
              &lt;/div&gt;
              &lt;div className="text-sm mt-2"&gt;{fix.action}&lt;/div&gt;
              {fix.code && (
                &lt;pre className="mt-2 p-3 bg-gray-800 text-green-400 text-xs overflow-auto rounded"&gt;
                  {fix.code}
                &lt;/pre&gt;
              )}
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}

Uppdatera app/page.tsx:

'use client'

import { useState } from 'react'
import ScanForm from './components/ScanForm'
import FreeReport from './components/FreeReport'
import FullScanButton from './components/FullScanButton'
import FullReport from './components/FullReport'

export default function Home() {
  const [freeReport, setFreeReport] = useState(null)
  const [fullReport, setFullReport] = useState(null)
  const [scannedUrl, setScannedUrl] = useState('')

  return (
    &lt;main className="max-w-2xl mx-auto p-6"&gt;
      &lt;h1 className="text-3xl font-bold mb-2"&gt;AI-Synlighetsanalys&lt;/h1&gt;
      &lt;p className="text-gray-600 mb-6"&gt;
        Se hur synlig din hemsida är för ChatGPT, Perplexity och Google AI.
      &lt;/p&gt;
      
      &lt;ScanForm onResult={(data, url) =&gt; { setFreeReport(data); setScannedUrl(url); setFullReport(null); }} /&gt;
      
      {freeReport && (
        &lt;&gt;
          &lt;FreeReport data={freeReport} /&gt;
          &lt;FullScanButton url={scannedUrl} onResult={setFullReport} /&gt;
        &lt;/&gt;
      )}
      
      {fullReport && &lt;FullReport data={fullReport} /&gt;}
    &lt;/main&gt;
  )
}

Testkriterier: Kör gratisscan. Klicka "Kör Full Scan". Vänta på att premiumrapport expanderar under knappen. Verifiera alla sektioner: NAP, GBP, recensioner, konkurrenter, fixar. Testa med företag som har GBP — ska visa NAP-jämförelse. Testa med företag som saknar GBP — ska visa "Saknas" utan crash.

Acceptanskriterier:
- [ ] Knappen visas endast efter gratisrapport
- [ ] Loader-text "Analyserar marknaden..." visas
- [ ] Premiumrapport expanderar under knappen (samma sida, ingen redirect)
- [ ] Alla 5 premium-moduler renderas korrekt
- [ ] Kodblock visas i monospace med syntax highlighting
- [ ] Fungerar på mobil

---

## Steg 10: Polish & Deploy

Mål: Gör det snyggt och produktionsklart för test.

Implementation:
1. Lägg till loading skeletons om du vill
2. Lägg till felhantering för Gemini-timeout (Vercel har 30s max på hobby-plan)
3. Konfigurera next.config.js för externa bilder om du ska visa bilder senare
4. Deploy till Vercel: vercel --prod
5. Lägg till miljövariabler i Vercel Dashboard

UI-förbättringar som ska finnas:
- Score-färg: rött &lt;50, gult 50-75, grönt &gt;75
- Kopiera-knapp på kodblock (valfritt men bra)
- Kollaps/expand på criticalIssues (valfritt)

Testkriterier: Deploya till Vercel. Testa med 3 riktiga svenska företags-URL:er. Testa rate limit i produktion. Testa cache i produktion. Kör Lighthouse — ska vara &gt;90 på Performance.

Acceptanskriterier:
- [ ] Live på analyze.pipod.net (eller test-URL)
- [ ] Gratisrapport fungerar för 3 olika företag
- [ ] Full scan fungerar för minst 1 företag med GBP
- [ ] Rate limit fungerar i produktion
- [ ] Cache fungerar i produktion
- [ ] Inga console errors
- [ ] Mobilvänlig

---

## Sammanfattning av dataflöde

Användare skriver URL
    ↓
/api/scan (POST)
    ↓
scrapeWebsite() → HTML + robots + sitemap + llms
    ↓
Gemini Flash 2.0 → JSON-rapport
    ↓
Spara i Redis (24h)
    ↓
Visa FreeReport
    ↓
[Användare klickar "Kör Full Scan"]
    ↓
/api/full-scan (POST)
    ↓
Hämta gratisrapport (cache)
    ↓
Google Places API → GBP-data
    ↓
Gemini 2.5 Pro → Premium JSON
    ↓
Spara i Redis (24h)
    ↓
Visa FullReport (expanderar under knappen)

---

## Kostnadsuppskattning per analys

Gratis (Flash 2.0): ~$0.001–0.005
Google Places API: ~$0.005–0.02
Premium (2.5 Pro): ~$0.05–0.20
Full scan totalt: ~$0.10–0.30

Sälj för 499–999 kr = ~95% marginal.

---

## Nästa steg efter test (inte i denna plan)

- Stripe-betalning för premium
- Spara rapporter i PostgreSQL (användarhistorik)
- E-postrapport (skicka PDF/länk)
- Scraping av Eniro/Hitta.se/Gulasidor (steg 2)
- Autentisering (spara historik)
- Admin-dashboard

Instruktion till Kimi Code: Implementera steg 1–10 i ordning. Testa varje steg innan nästa. Fråga om något är oklart.