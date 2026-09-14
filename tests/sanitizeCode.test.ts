import { describe, it, expect } from 'vitest'
import { sanitizeCodeExample } from '@/app/lib/reportWriter'

const withFences = '```json\n{"@type": "Restaurant", "name": "X"}\n```'
const withRating = `<script type="application/ld+json">
{
  "@type": "Restaurant",
  "name": "X",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.2,
    "reviewCount": 942
  },
  "telephone": "031-1"
}
</script>`

describe('sanitizeCodeExample', () => {
  it('strippar markdown-fences', () => {
    const out = sanitizeCodeExample(withFences)!
    expect(out).not.toContain('```')
    expect(out).toContain('"@type"')
  })
  it('tar bort aggregateRating (Google self-serving reviews-policyn)', () => {
    const out = sanitizeCodeExample(withRating)!
    expect(out).not.toContain('aggregateRating')
    expect(out).toContain('"telephone"')
    expect(out).toContain('"name"')
  })
  it('null in → null ut', () => { expect(sanitizeCodeExample(null)).toBeNull() })

  it('tar bort en review-array rekursivt utan att röra andra fält', () => {
    const withReviewArray = `<script type="application/ld+json">
{
  "@type": "LocalBusiness",
  "name": "Sprej Hårstudio",
  "review": [
    { "@type": "Review", "author": "Anna", "reviewBody": "Bra klippning" }
  ],
  "telephone": "060-61 45 00"
}
</script>`
    const out = sanitizeCodeExample(withReviewArray)!
    expect(out).not.toContain('"review"')
    expect(out).not.toContain('reviewBody')
    expect(out).toContain('"telephone"')
    expect(out).toContain('"name"')
  })

  it('tar bort aggregateRating även när koden både har fences och script-tag (verkligt Pro-svar)', () => {
    const realWorldShape = '```html\n' + withRating + '\n```'
    const out = sanitizeCodeExample(realWorldShape)!
    expect(out).not.toContain('```')
    expect(out).not.toContain('aggregateRating')
    expect(out).toContain('"telephone"')
  })

  it('fungerar även vid trasig JSON (regex-fallback), tar bort aggregateRating-objektet', () => {
    const broken = `<script type="application/ld+json">
{
  "@type": "Restaurant",
  "name": "X",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.2,
  "telephone": "031-1"
}
</script>`
    const out = sanitizeCodeExample(broken)!
    expect(out).not.toContain('aggregateRating')
  })

  it('bevarar en giltig Google Maps place_id-sameAs-länk oförändrad', () => {
    const withMapsLink = `<script type="application/ld+json">
{
  "@type": "LocalBusiness",
  "name": "X",
  "sameAs": "https://www.google.com/maps/place/?q=place_id:ChIJH0z0ml5nZEYRwy7tjXqlzf4",
  "telephone": "031-1"
}
</script>`
    const out = sanitizeCodeExample(withMapsLink)!
    expect(out).toContain('https://www.google.com/maps/place/?q=place_id:ChIJH0z0ml5nZEYRwy7tjXqlzf4')
  })
})
