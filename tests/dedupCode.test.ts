import { describe, it, expect } from 'vitest'
import { codeSimilarity, dedupeCodeExamples, buildMasterSchema, type CodeCarrier } from '@/app/lib/masterSchema'

// Två verkliga Pro-block från Sprejs paid-scan före Audit #7 (difflib-likhet 0,72)
const sprejLocalBusiness = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HairSalon",
  "name": "Sprej Hårstudio",
  "url": "https://sprej.nu",
  "telephone": "060-61 45 00",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Varvsgränd 2",
    "addressLocality": "Sundsvall",
    "postalCode": "852 32",
    "addressCountry": "SE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 62.391354,
    "longitude": 17.3025904
  },
  "sameAs": "https://www.google.com/maps/place/?q=place_id:ChIJH0z0ml5nZEYRwy7tjXqlzf4"
}
</script>`
const sprejLocalSubtype = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"HairSalon","name":"Sprej Hårstudio","url":"https://sprej.nu",
 "telephone":"060-61 45 00","address":{"@type":"PostalAddress","streetAddress":"Varvsgränd 2",
 "addressLocality":"Sundsvall","postalCode":"852 32","addressCountry":"SE"}}
</script>`
const ogTags = `<meta property="og:title" content="Sprej Hårstudio – frisör i Sundsvall">
<meta property="og:description" content="Klippning och färgning på Varvsgränd 2">
<meta property="og:url" content="https://sprej.nu/">`
const robots = `User-agent: GPTBot
Allow: /
Sitemap: https://sprej.nu/sitemap.xml`

describe('codeSimilarity', () => {
  it('är 1 för samma kod med annan whitespace/citattecken', () => {
    expect(codeSimilarity('{ "x": 1,\n  "y": 2 }', "{'x':1,'y':2}")).toBe(1)
  })
  it('flaggar nästan lika (inte exakt lika) schema-block', () => {
    expect(codeSimilarity(sprejLocalBusiness, sprejLocalSubtype)).toBeGreaterThanOrEqual(0.6)
  })
  it('håller isär olika sorters kod', () => {
    expect(codeSimilarity(sprejLocalBusiness, ogTags)).toBeLessThan(0.6)
    expect(codeSimilarity(ogTags, robots)).toBeLessThan(0.6)
  })
  it('två små olika JSON-LD-block blir inte lika bara för att de delar omslaget', () => {
    const a = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Tar ni drop-in?"}]}</script>'
    const b = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","serviceType":"Hårfärgning","areaServed":"Sundsvall"}</script>'
    expect(codeSimilarity(a, b)).toBeLessThan(0.6)
  })
})

describe('dedupeCodeExamples', () => {
  it('nullar nästan-dubbletter i rapportordning och sätter codeRef till första förekomsten', () => {
    const rich: Record<string, CodeCarrier> = {
      jsonLd: { richCodeExample: sprejLocalSubtype },         // #20
      schemaAny: { richCodeExample: sprejLocalBusiness },     // #18 — kommer först i rapporten
      ogTags: { richCodeExample: ogTags },
      robotsTxt: { richCodeExample: robots },
    }
    dedupeCodeExamples(rich)
    expect(rich.schemaAny.richCodeExample).toBe(sprejLocalBusiness)
    expect(rich.jsonLd).toEqual({ richCodeExample: null, codeRef: 'schemaAny' })
    expect(rich.ogTags.richCodeExample).toBe(ogTags)
    expect(rich.robotsTxt.richCodeExample).toBe(robots)
  })

  it('`first` (huvudschemats ägare) behåller alltid sin kod även om den kommer senare i registret', () => {
    const rich: Record<string, CodeCarrier> = {
      socialPresence: { richCodeExample: sprejLocalSubtype }, // #8
      localBusiness: { richCodeExample: sprejLocalBusiness },  // #14
    }
    dedupeCodeExamples(rich, { first: 'localBusiness' })
    expect(rich.localBusiness.richCodeExample).toBe(sprejLocalBusiness)
    expect(rich.socialPresence).toEqual({ richCodeExample: null, codeRef: 'localBusiness' })
  })

  it('skriver inte över en befintlig hänvisning', () => {
    const rich: Record<string, CodeCarrier> = {
      schemaAny: { richCodeExample: sprejLocalBusiness },
      jsonLd: { richCodeExample: sprejLocalSubtype, codeRef: 'localBusiness' },
    }
    dedupeCodeExamples(rich)
    expect(rich.jsonLd).toEqual({ richCodeExample: null, codeRef: 'localBusiness' })
  })

  it('kort som inte renderas blir aldrig mål för en hänvisning', () => {
    const rich: Record<string, CodeCarrier> = {
      socialPresence: { richCodeExample: sprejLocalSubtype },
      localBusiness: { richCodeExample: sprejLocalBusiness },
    }
    dedupeCodeExamples(rich, { referenceable: new Set(['localBusiness']) })
    expect(rich.localBusiness).toEqual({ richCodeExample: sprejLocalBusiness })
    expect(rich.socialPresence.richCodeExample).toBe(sprejLocalSubtype)
  })

  // Audit sep 2026: serviceSchema fick codeRef till huvudschemats ägare enbart för att
  // dess kod råkade vara textmässigt lik (delar företagsnamn/adress/telefon) — trots att
  // MASTER_COVERAGE inte listar 'serviceSchema' alls, dvs. huvudschemat innehåller aldrig
  // ett Service-schema. SolutionCard visade då "koden ingår redan" utan att den gjorde det.
  it('BUGGEN: utan huvudschemat skickat länkas serviceSchema till ägaren enbart via textlikhet', () => {
    const rich: Record<string, CodeCarrier> = {
      serviceSchema: { richCodeExample: sprejLocalSubtype },
      localBusiness: { richCodeExample: sprejLocalBusiness },
    }
    dedupeCodeExamples(rich, { first: 'localBusiness' }) // ingen master skickas — dokumenterar rotorsaken
    expect(rich.serviceSchema).toEqual({ richCodeExample: null, codeRef: 'localBusiness' })
  })

  it('FIXEN: med huvudschemat skickat behåller serviceSchema sin egen kod — MASTER_COVERAGE saknar serviceSchema helt', () => {
    const master = buildMasterSchema({
      companyName: 'Sprej Hårstudio', url: 'https://sprej.nu', city: 'Sundsvall',
      phone: '060-61 45 00', streetAddress: 'Varvsgränd 2', postalCode: '852 32',
    })!
    const rich: Record<string, CodeCarrier> = {
      serviceSchema: { richCodeExample: sprejLocalSubtype },
      localBusiness: { richCodeExample: sprejLocalBusiness },
    }
    dedupeCodeExamples(rich, { first: 'localBusiness', master })
    expect(rich.serviceSchema.richCodeExample).toBe(sprejLocalSubtype)
    expect(rich.serviceSchema.codeRef).toBeUndefined()
    expect(rich.localBusiness.richCodeExample).toBe(sprejLocalBusiness)
  })

  it('täckta checks (MASTER_COVERAGE) länkas fortfarande till ägaren när huvudschemat verkligen täcker dem', () => {
    const master = buildMasterSchema({
      companyName: 'Sprej Hårstudio', url: 'https://sprej.nu', city: 'Sundsvall',
      socialLinks: ['https://www.facebook.com/sprej'],
    })!
    expect(master.data.sameAs).toBeDefined() // täcker socialPresence (MASTER_COVERAGE: ['sameAs'])
    const rich: Record<string, CodeCarrier> = {
      socialPresence: { richCodeExample: sprejLocalSubtype },
      localBusiness: { richCodeExample: sprejLocalBusiness },
    }
    dedupeCodeExamples(rich, { first: 'localBusiness', master })
    expect(rich.socialPresence).toEqual({ richCodeExample: null, codeRef: 'localBusiness' })
  })
})
