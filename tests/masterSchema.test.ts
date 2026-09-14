import { describe, it, expect } from 'vitest'
import {
  buildMasterSchema,
  schemaTypeFor,
  toInternationalPhone,
  openingHoursSpecification,
  pickMasterOwner,
  referencesMaster,
  extractSchemaDelta,
  applyMasterSchema,
  type OpeningPeriod,
  type CodeCarrier,
} from '@/app/lib/masterSchema'

// Verklig data från Google Places (hämtad 2026-09-14)
const sprejMeta = {
  companyName: 'Sprej Hårstudio',
  url: 'https://sprej.nu',
  city: 'Sundsvall',
  phone: '060-61 45 00',
  streetAddress: 'Varvsgränd 2',
  postalCode: '852 32',
  formattedAddress: 'Varvsgränd 2, 852 32 Sundsvall, Sverige',
  latitude: 62.391354,
  longitude: 17.3025904,
  placeId: 'ChIJH0z0ml5nZEYRwy7tjXqlzf4',
  primaryType: 'hair_salon',
  googleRating: 4.8,
}

const tvakantenPeriods: OpeningPeriod[] = [
  { open: { day: 0, hour: 13, minute: 0 }, close: { day: 0, hour: 23, minute: 0 } },
  { open: { day: 2, hour: 12, minute: 0 }, close: { day: 2, hour: 23, minute: 0 } },
  { open: { day: 3, hour: 12, minute: 0 }, close: { day: 3, hour: 23, minute: 0 } },
  { open: { day: 4, hour: 12, minute: 0 }, close: { day: 5, hour: 0, minute: 0 } },
  { open: { day: 5, hour: 12, minute: 0 }, close: { day: 6, hour: 1, minute: 0 } },
  { open: { day: 6, hour: 12, minute: 0 }, close: { day: 0, hour: 1, minute: 0 } },
]

function parseScript(code: string): Record<string, any> {
  const inner = code.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]
  return JSON.parse(inner)
}

describe('buildMasterSchema', () => {
  it('bygger komplett JSON-LD enbart av verifierad data (Sprej)', () => {
    const master = buildMasterSchema(sprejMeta)!
    const data = parseScript(master.code)
    expect(master.type).toBe('HairSalon')
    expect(data['@type']).toBe('HairSalon')
    expect(data['@id']).toBe('https://sprej.nu/#localbusiness')
    expect(data.name).toBe('Sprej Hårstudio')
    expect(data.telephone).toBe('+46 60 61 45 00')
    expect(data.address).toEqual({
      '@type': 'PostalAddress', streetAddress: 'Varvsgränd 2', postalCode: '852 32',
      addressLocality: 'Sundsvall', addressCountry: 'SE',
    })
    expect(data.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 62.391354, longitude: 17.3025904 })
    expect(data.sameAs).toEqual(['https://www.google.com/maps/place/?q=place_id:ChIJH0z0ml5nZEYRwy7tjXqlzf4'])
    // Aldrig betyg, och inga öppettider när perioder saknas
    expect(master.code).not.toContain('aggregateRating')
    expect(data.openingHoursSpecification).toBeUndefined()
    expect(data.email).toBeUndefined()
  })

  it('tar med öppettider från Places-perioder och sajtens egna sameAs', () => {
    const master = buildMasterSchema({
      companyName: 'Tvåkanten', url: 'https://www.tvakanten.se', city: 'Göteborg',
      primaryType: 'scandinavian_restaurant', openingPeriods: tvakantenPeriods,
      socialLinks: ['https://www.instagram.com/tvakantengbg/', 'inte-en-url'],
    })!
    expect(master.type).toBe('Restaurant')
    expect(master.data.openingHoursSpecification).toHaveLength(4)
    expect(master.data.sameAs).toEqual(['https://www.instagram.com/tvakantengbg/'])
    // Ingen formattedAddress → staden (från användaren) räcker för addressLocality, men inget land gissas
    expect(master.data.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Göteborg' })
  })

  it('returnerar null utan företagsnamn eller giltig URL', () => {
    expect(buildMasterSchema({ ...sprejMeta, companyName: '  ' })).toBeNull()
    expect(buildMasterSchema({ ...sprejMeta, url: 'inte en url' })).toBeNull()
  })
})

describe('hjälpfunktioner', () => {
  it('schemaTypeFor: primaryType → suffix → sajtens subtyp → LocalBusiness', () => {
    expect(schemaTypeFor('hair_salon')).toBe('HairSalon')
    expect(schemaTypeFor('scandinavian_restaurant')).toBe('Restaurant')
    expect(schemaTypeFor('okand_typ', ['WebSite', 'Plumber'])).toBe('Plumber')
    expect(schemaTypeFor(null, ['WebSite', 'Organization'])).toBe('LocalBusiness')
  })

  it('toInternationalPhone: svenska nationella nummer får +46', () => {
    expect(toInternationalPhone('060-61 45 00')).toBe('+46 60 61 45 00')
    expect(toInternationalPhone('031-313 33 36')).toBe('+46 31 313 33 36')
    expect(toInternationalPhone('+46313133336')).toBe('+46313133336')
  })

  it('openingHoursSpecification: grupperar dagar med samma tider, måndag först', () => {
    expect(openingHoursSpecification(tvakantenPeriods)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday'], opens: '12:00', closes: '23:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Thursday'], opens: '12:00', closes: '00:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday', 'Saturday'], opens: '12:00', closes: '01:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday'], opens: '13:00', closes: '23:00' },
    ])
  })

  it('openingHoursSpecification: dygnet runt, och ogiltiga perioder ger null (hellre inget än fel)', () => {
    const allWeek = openingHoursSpecification([{ open: { day: 0, hour: 0, minute: 0 } }])!
    expect(allWeek[0]).toMatchObject({ opens: '00:00', closes: '23:59' })
    expect((allWeek[0].dayOfWeek as string[]).length).toBe(7)
    expect(openingHoursSpecification([{ open: { day: 1, hour: 9 }, close: null }, ...tvakantenPeriods])).toBeNull()
    expect(openingHoursSpecification([])).toBeNull()
  })
})

describe('pickMasterOwner', () => {
  const c = (key: string, status = 'bad', fix: string | null = 'fix') => ({ key, status, fix })
  it('väljer den mest relevanta schema-checken som behöver fixas och har ett kort', () => {
    expect(pickMasterOwner([c('jsonLd'), c('localSubtype'), c('localBusiness', 'ok', null)])).toBe('localSubtype')
    expect(pickMasterOwner([c('localSubtype', 'bad', null), c('schemaAny', 'warning')])).toBe('schemaAny')
    expect(pickMasterOwner([c('socialPresence'), c('https')])).toBeNull()
  })
})

describe('extractSchemaDelta', () => {
  const master = buildMasterSchema(sprejMeta)!

  it('ett block som bara upprepar huvudschemat blir null', () => {
    const repeat = `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "HairSalon", "name": "Sprej Hårstudio",
  "url": "https://sprej.nu", "telephone": "060-61 45 00",
  "address": { "@type": "PostalAddress", "streetAddress": "Varvsgränd 2", "addressLocality": "Sundsvall" } }
</script>`
    expect(extractSchemaDelta(repeat, master)).toBeNull()
  })

  it('behåller bara nya egenskaper, med huvudschemats @type/@id', () => {
    const code = `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "LocalBusiness", "name": "Sprej Hårstudio", "sameAs": ["x"], "areaServed": "Sundsvall" }
</script>`
    const delta = extractSchemaDelta(code, master)!
    const data = parseScript(delta)
    expect(data).toEqual({ '@context': 'https://schema.org', '@type': 'HairSalon', '@id': master.id, areaServed: 'Sundsvall' })
  })

  it('ersätter ett upprepat företagsobjekt (provider) med en @id-referens', () => {
    const code = `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Service", "serviceType": "Klippning",
  "provider": { "@type": "HairSalon", "name": "Sprej Hårstudio", "telephone": "060-61 45 00" } }
</script>`
    const data = parseScript(extractSchemaDelta(code, master)!)
    expect(data['@type']).toBe('Service')
    expect(data.provider).toEqual({ '@id': master.id })
  })

  it('lämnar HTML som inte är JSON-LD orörd, och otolkbar kopia av huvudschemat blir null', () => {
    const html = '<a href="tel:+46606145 00">Ring Sprej Hårstudio: 060-61 45 00</a>'
    expect(extractSchemaDelta(html, master)).toBe(html)
    const broken = master.code.replace('"name"', 'name')
    expect(extractSchemaDelta(broken, master)).toBeNull()
    expect(extractSchemaDelta(null, master)).toBeNull()
  })
})

describe('applyMasterSchema', () => {
  it('ägaren får huvudschemat, täckta checks får codeRef + delta, övriga lämnas orörda', () => {
    const master = buildMasterSchema(sprejMeta)!
    const full = '<script type="application/ld+json">{"@type":"HairSalon","name":"Sprej Hårstudio","telephone":"060-61 45 00"}</script>'
    const rich: Record<string, CodeCarrier> = {
      localBusiness: { richCodeExample: full },
      jsonLd: { richCodeExample: full },
      socialPresence: { richCodeExample: null },
      openingHours: { richCodeExample: '<p>Öppettider</p>' },
      https: { richCodeExample: 'Redirect 301 / https://sprej.nu/' },
    }
    applyMasterSchema(rich, 'localBusiness', master)
    expect(rich.localBusiness.richCodeExample).toBe(master.code)
    expect(rich.localBusiness.codeRef).toBeUndefined()
    expect(rich.jsonLd).toEqual({ richCodeExample: null, codeRef: 'localBusiness' })
    expect(rich.socialPresence.codeRef).toBe('localBusiness') // huvudschemat har sameAs
    // Huvudschemat saknar öppettider → ingen hänvisning, koden rörs inte
    expect(referencesMaster('openingHours', master)).toBe(false)
    expect(rich.openingHours).toEqual({ richCodeExample: '<p>Öppettider</p>' })
    expect(rich.https.codeRef).toBeUndefined()
  })
})
