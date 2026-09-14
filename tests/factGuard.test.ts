import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildVerifiedFacts,
  formatFactsForPrompt,
  formatHoursSv,
  groundCode,
  groundMarkdown,
  groundReport,
  hoursFromPeriods,
  hoursFromWeekdayDescriptions,
  hoursToSpecification,
  normalizePath,
  phoneDigits,
  GROUNDING_RULES,
  type Correction,
  type VerifiedFacts,
} from '@/app/lib/factGuard'
import { buildMasterSchema, type OpeningPeriod } from '@/app/lib/masterSchema'

// Verklig Google Places-data för Tvåkanten (hämtad 2026-09-14)
const tvakantenWeekday = [
  'måndag: Stängt', 'tisdag: 12:00–23:00', 'onsdag: 12:00–23:00', 'torsdag: 12:00–00:00',
  'fredag: 12:00–01:00', 'lördag: 12:00–01:00', 'söndag: 13:00–23:00',
]
const tvakantenPeriods: OpeningPeriod[] = [
  { open: { day: 0, hour: 13, minute: 0 }, close: { day: 0, hour: 23, minute: 0 } },
  { open: { day: 2, hour: 12, minute: 0 }, close: { day: 2, hour: 23, minute: 0 } },
  { open: { day: 3, hour: 12, minute: 0 }, close: { day: 3, hour: 23, minute: 0 } },
  { open: { day: 4, hour: 12, minute: 0 }, close: { day: 5, hour: 0, minute: 0 } },
  { open: { day: 5, hour: 12, minute: 0 }, close: { day: 6, hour: 1, minute: 0 } },
  { open: { day: 6, hour: 12, minute: 0 }, close: { day: 0, hour: 1, minute: 0 } },
]

const tvakanten = (): VerifiedFacts => buildVerifiedFacts({
  url: 'https://tvakanten.se',
  pages: [
    {
      url: 'https://www.tvakanten.se/',
      title: 'Tvåkanten — Restaurang & bar på Avenyn',
      h1: 'Välkommen till Tvåkanten',
      bodyText: 'Klassisk restaurang på Kungsportsavenyen sedan 1974. Råbiff 245 kr.',
      phones: ['031-313 33 36', '+46313133336'],
      internalLinks: { paths: ['/', '/om-oss', '/meny', '/boka-bord'] },
    },
    {
      url: 'https://www.tvakanten.se/meny/',
      h1: 'Meny',
      bodyText: 'Råbiff med kapris och rödlök 245 kr. Toast Skagen 195 kr.',
    },
  ],
  sitemapXml: '<urlset><url><loc><![CDATA[https://www.tvakanten.se/evenemang/]]></loc></url><url><loc>https://tvakanten.se/Om-Oss/</loc></url><url><loc>https://annan.se/x</loc></url></urlset>',
  placePhone: '031-313 33 36',
  weekdayHours: tvakantenWeekday,
  openingPeriods: tvakantenPeriods,
  faqQuestions: ['Kan man boka bord?'],
})

// Sprej: GBP har inga öppettider och skrapningen hittade 0 interna länkar och ingen sitemap
const sprej = (): VerifiedFacts => buildVerifiedFacts({
  url: 'https://sprej.nu',
  pages: [{ url: 'https://sprej.nu/', title: 'Sprej Hårstudio', bodyText: 'Frisör i Sundsvall.', phones: ['060 - 61 45 00'], internalLinks: { paths: [] } }],
  sitemapXml: null,
  placePhone: '060-61 45 00',
  weekdayHours: null,
  openingPeriods: null,
})

const noPhone = (): VerifiedFacts => ({ ...sprej(), phones: [] })

function ctx(field = 'test') {
  const log: Correction[] = []
  return { field, log }
}

afterEach(() => vi.restoreAllMocks())

describe('normalisering', () => {
  it('normalizePath tar bort query, hash, versaler och avslutande snedstreck', () => {
    expect(normalizePath('/Om-Oss/?a=1#x')).toBe('/om-oss')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })
  it('phoneDigits jämför nationellt och internationellt format lika', () => {
    expect(phoneDigits('+46 31-313 33 36')).toBe(phoneDigits('031-313 33 36'))
    expect(phoneDigits('0046 60 61 45 00')).toBe(phoneDigits('060 - 61 45 00'))
  })
})

describe('öppettider', () => {
  it('periods och weekdayDescriptions ger samma verifierade vecka, midnatt hanteras', () => {
    const fromPeriods = hoursFromPeriods(tvakantenPeriods)!
    const fromDesc = hoursFromWeekdayDescriptions(tvakantenWeekday)!
    expect(fromPeriods).toEqual(fromDesc)
    expect(fromPeriods[4]).toEqual(['12:00-00:00'])
    expect(fromPeriods[1]).toEqual([])
  })
  it('formatHoursSv grupperar bara dagar med exakt samma tider', () => {
    expect(formatHoursSv(hoursFromPeriods(tvakantenPeriods)!)).toBe(
      'måndag stängt, tisdag–onsdag 12:00–23:00, torsdag 12:00–00:00, fredag–lördag 12:00–01:00, söndag 13:00–23:00',
    )
  })
  it('ofullständiga weekdayDescriptions ger null (hellre inga tider än fel tider)', () => {
    expect(hoursFromWeekdayDescriptions(tvakantenWeekday.slice(0, 5))).toBeNull()
  })
})

describe('buildVerifiedFacts', () => {
  it('samlar kända sökvägar från sitemap (CDATA, www/naken domän), länkar och sidor — bara egen värd', () => {
    const f = tvakanten()
    expect(f.origin).toBe('https://www.tvakanten.se')
    expect(f.knownPaths).toEqual(expect.arrayContaining(['/', '/om-oss', '/meny', '/boka-bord', '/evenemang']))
    expect(f.knownPaths).not.toContain('/x')
  })
  it('dubblerade telefonnummer i olika format räknas en gång, Google först', () => {
    expect(tvakanten().phones).toEqual(['031-313 33 36'])
  })
  it('meny-/tjänstesidor och FAQ-frågor hamnar i prompt-blocket', () => {
    const block = formatFactsForPrompt(tvakanten())
    expect(block).toContain('https://www.tvakanten.se/meny')
    expect(block).toContain('Toast Skagen 195 kr')
    expect(block).toContain('Kan man boka bord?')
    expect(block).toContain('torsdag 12:00–00:00')
  })
  it('utan data säger prompt-blocket uttryckligen att inget finns', () => {
    const block = formatFactsForPrompt(sprej())
    expect(block).toContain('Öppettider: saknas')
    expect(block).toContain('inga hittades')
    expect(block).toContain('inget — inga rätter')
    expect(GROUNDING_RULES).toContain('HITTA ALDRIG PÅ')
  })
})

describe('groundMarkdown — Tvåkantens riktiga syntes (före fixen)', () => {
  const actionPlan = `### Kritiskt
1.  **Implementera FAQPage JSON-LD:** Lägg till strukturerad data för vanliga frågor.
    \`\`\`json
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Vilka öppettider har Tvåkanten?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Tvåkanten har öppet tisdag-torsdag 12:00-23:00, fredag-lördag 12:00-01:00 och söndag 13:00-23:00. Måndagar stängt. Se vår hemsida för eventuella avvikelser under helgdagar."
          }
        }
      ]
    }
    \`\`\`
2.  **Implementera Menu-schema:** Strukturera dryckesmenyn.
    \`\`\`json
    {
      "@context": "https://schema.org",
      "@type": "Menu",
      "name": "Tvåkantens Dryckesmeny",
      "hasMenuSection": [
        {
          "@type": "MenuSection",
          "name": "Cocktails",
          "hasMenuItem": [
            { "@type": "MenuItem", "name": "Old Fashioned", "description": "Bourbon, socker, Angostura bitter.", "offers": { "@type": "Offer", "price": "145", "priceCurrency": "SEK" } }
          ]
        }
      ]
    }
    \`\`\`
3.  Ring 031-555 12 34 för bokning.`

  it('rättar fel öppettider, tar bort påhittad meny och rättar telefon — och loggar allt', () => {
    const c = ctx('synthesis.actionPlan')
    const out = groundMarkdown(actionPlan, tvakanten(), c)!
    expect(out).toContain('måndag stängt, tisdag–onsdag 12:00–23:00, torsdag 12:00–00:00, fredag–lördag 12:00–01:00, söndag 13:00–23:00')
    expect(out).not.toContain('tisdag-torsdag 12:00-23:00')
    expect(out).not.toContain('Old Fashioned')
    expect(out).not.toContain('"@type": "Menu"')
    expect(out).toContain('Ring 031-313 33 36 för bokning.')
    expect(out).toContain('"@type": "FAQPage"')
    const kinds = c.log.map(l => `${l.kind}:${l.action}`)
    expect(kinds).toEqual(expect.arrayContaining(['öppettider:rättad', 'meny:borttagen', 'telefon:rättad']))
  })
  it('påhittade tider som inte handlar om öppettider (lunch) tas bort i stället för att "rättas" (riktig syntes 2026-09-14)', () => {
    const c = ctx()
    const code = JSON.stringify({ '@type': 'Question', name: 'Erbjuder ni lunch?', acceptedAnswer: { '@type': 'Answer', text: 'Ja, vi serverar lunch tisdag till fredag mellan 11:30 och 15:00. Se vår aktuella lunchmeny på hemsidan.' } })
    const data = JSON.parse(groundCode(code, tvakanten(), c)!)
    expect(data.acceptedAnswer.text).toBe('Se vår aktuella lunchmeny på hemsidan.')
    expect(c.log).toEqual([expect.objectContaining({ kind: 'öppettider', action: 'borttagen' })])
  })
  it('korrekta påståenden lämnas orörda utan logg', () => {
    const c = ctx()
    const text = 'Tvåkanten har öppet fredag–lördag 12–01 och söndag 13:00–23:00. Måndagar stängt. Ring 031-313 33 36.'
    expect(groundMarkdown(text, tvakanten(), c)).toBe(text)
    expect(c.log).toEqual([])
  })
})

describe('groundCode — interna URL:er', () => {
  it('tar bort länkar till undersidor som inte finns (Sprej: 0 länkar skrapade), behåller startsidan', () => {
    const code = `<nav>
  <ul>
    <li><a href="/">Hem</a></li>
    <li><a href="/behandlingar/">Behandlingar</a></li>
    <li><a href="/priser/">Priser</a></li>
    <li><a href="https://sprej.nu/kontakt/">Kontakt</a></li>
  </ul>
</nav>`
    const c = ctx('internalLinks.richCodeExample')
    const out = groundCode(code, sprej(), c)!
    expect(out).toContain('<a href="/">Hem</a>')
    expect(out).not.toMatch(/behandlingar|priser|kontakt/)
    expect(c.log.filter(l => l.kind === 'url' && l.action === 'borttagen')).toHaveLength(3)
  })
  it('behåller länkar till sidor som finns', () => {
    const c = ctx()
    const code = '<a href="/meny/">Meny</a>\n<a href="https://www.tvakanten.se/om-oss">Om oss</a>'
    expect(groundCode(code, tvakanten(), c)).toBe(code)
    expect(c.log).toEqual([])
  })
  it('tar bort okända URL-värden i JSON-LD men behåller rot, @id och externa länkar', () => {
    const code = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"HairSalon","@id":"https://sprej.nu/#localbusiness","name":"Sprej Hårstudio","url":"https://sprej.nu","hasMenu":"https://sprej.nu/priser","image":"https://sprej.nu/wp-content/uploads/logo.png","sameAs":["https://www.google.com/maps/place/?q=place_id:ChIJH0z0ml5nZEYRwy7tjXqlzf4","https://www.instagram.com/sprej"]}
</script>`
    const c = ctx()
    const out = groundCode(code, sprej(), c)!
    const data = JSON.parse(out.replace(/<\/?script[^>]*>/g, ''))
    expect(data.hasMenu).toBeUndefined()
    expect(data.image).toBeUndefined()
    expect(data['@id']).toBe('https://sprej.nu/#localbusiness')
    expect(data.sameAs).toHaveLength(2)
  })
})

describe('groundCode — öppettider och telefon i JSON-LD', () => {
  const withHours = (spec: unknown, telephone = '+46 31 999 99 99') => `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Tvåkanten', telephone, openingHoursSpecification: spec })}
</script>`

  it('ersätter avvikande openingHoursSpecification med de verifierade tiderna och rättar telefonen', () => {
    const wrong = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'], opens: '12:00', closes: '23:00' }]
    const c = ctx()
    const out = groundCode(withHours(wrong), tvakanten(), c)!
    const data = JSON.parse(out.replace(/<\/?script[^>]*>/g, ''))
    expect(data.openingHoursSpecification).toEqual(hoursToSpecification(hoursFromPeriods(tvakantenPeriods)!))
    expect(data.telephone).toBe('+46 31 313 33 36')
    expect(c.log.map(l => l.kind).sort()).toEqual(['telefon', 'öppettider'])
  })
  it('utan verifierade tider tas öppettiderna bort helt', () => {
    const c = ctx()
    const spec = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '09:00', closes: '18:00' }]
    const out = groundCode(withHours(spec, '060-61 45 00'), sprej(), c)!
    expect(out).not.toContain('openingHoursSpecification')
    expect(out).toContain('"telephone": "060-61 45 00"')
    expect(c.log).toEqual([expect.objectContaining({ kind: 'öppettider', action: 'borttagen' })])
  })
  it('utan känd telefon tas telephone bort', () => {
    const c = ctx()
    const out = groundCode(withHours(undefined, '060-12 34 56'), noPhone(), c)!
    expect(out).not.toContain('telephone')
  })
  it('huvudschemat (deterministiskt från verifierad data) passerar orört', () => {
    const master = buildMasterSchema({
      companyName: 'Tvåkanten', url: 'https://www.tvakanten.se/', city: 'Göteborg', phone: '031-313 33 36',
      streetAddress: 'Kungsportsavenyen 27', postalCode: '411 36', formattedAddress: 'Kungsportsavenyen 27, 411 36 Göteborg, Sverige',
      latitude: 57.7, longitude: 11.97, placeId: 'ChIJabc', primaryType: 'restaurant', openingPeriods: tvakantenPeriods,
    })!
    const c = ctx()
    const out = groundCode(master.code, tvakanten(), c)!
    expect(JSON.parse(out.replace(/<\/?script[^>]*>/g, ''))).toEqual(master.data)
    expect(c.log).toEqual([])
  })
  it('MenuItem och pris som finns i skrapat innehåll behålls', () => {
    const code = JSON.stringify({ '@type': 'Menu', hasMenuItem: [
      { '@type': 'MenuItem', name: 'Toast Skagen', offers: { '@type': 'Offer', price: '195', priceCurrency: 'SEK' } },
      { '@type': 'MenuItem', name: 'Råbiff', offers: { '@type': 'Offer', price: '299', priceCurrency: 'SEK' } },
    ] })
    const c = ctx()
    const data = JSON.parse(groundCode(code, tvakanten(), c)!)
    expect(data.hasMenuItem).toHaveLength(2)
    expect(data.hasMenuItem[0].offers.price).toBe('195')
    expect(data.hasMenuItem[1].offers).toBeUndefined()
    expect(c.log).toEqual([expect.objectContaining({ kind: 'pris', action: 'borttagen' })])
  })
})

describe('groundMarkdown — prosa i richSteps', () => {
  it('tar bort steg som hänvisar till påhittade undersidor, gör om länkar till text', () => {
    const steps = '1. Lägg till länkar till /behandlingar/ och /priser/ i menyn.\n2. Skapa en [prissida](/priser) med era tjänster.\n3. Kontrollera `/llms.txt` och https://search.google.com/test/rich-results.'
    const c = ctx()
    const out = groundMarkdown(steps, sprej(), c)!
    expect(out).not.toContain('/behandlingar/')
    expect(out).toContain('1. Skapa en prissida med era tjänster.')
    expect(out).toContain('2. Kontrollera `/llms.txt` och https://search.google.com/test/rich-results.')
    expect(c.log.every(l => l.kind === 'url')).toBe(true)
  })
  it('numrerar om stegen när ett steg tas bort (påstående om en okänd sida, inget skapa-förslag), andra listor orörda', () => {
    const c = ctx()
    const steps = '1. Identifiera de vanligaste frågorna.\n2. Läs mer om detta på `/vanliga-fragor`.\n3. Publicera frågorna.\n4. Testa sidan.\n\n### Nästa\n\n5. Följ upp.'
    expect(groundMarkdown(steps, tvakanten(), c)).toBe('1. Identifiera de vanligaste frågorna.\n2. Publicera frågorna.\n3. Testa sidan.\n\n### Nästa\n\n5. Följ upp.')
    expect(c.log).toEqual([expect.objectContaining({ kind: 'url', action: 'borttagen' })])
  })
  it('utan verifierade öppettider tas meningen med tider bort, resten av raden behålls', () => {
    const c = ctx()
    const out = groundMarkdown('Lägg in öppettiderna i profilen. Ni har öppet vardagar 09–18. Kontrollera sedan i Google.', sprej(), c)!
    expect(out).toBe('Lägg in öppettiderna i profilen. Kontrollera sedan i Google.')
    expect(c.log[0]).toMatchObject({ kind: 'öppettider', action: 'borttagen' })
  })
  it('ger inga falsklarm på vanlig text, datum och betyg', () => {
    const text = 'Lägg koden i <head> och/eller i temat. Betyget 4,8/5 från 2026-09-14 räcker 2–3 veckor. Klicka på Spara.'
    const c = ctx()
    expect(groundMarkdown(text, tvakanten(), c)).toBe(text)
    expect(c.log).toEqual([])
  })
})

// Fix sep 2026: factGuard tog bort HELA meningen när ett steg uttryckligen föreslog att
// SKAPA en ny sida med sökvägen bara som exempel (t.ex. "Skapa en ny undersida, exempelvis
// /vanliga-fragor") — unknownInternalRefs() kunde inte skilja ett sådant förslag från ett
// påstående om att sidan redan finns. GROUNDING_RULES kräver uttryckligen att nya sidor
// föreslås "med ord" — det förslaget ska alltså få stå kvar; ett påstående om en okänd
// sida, eller en riktig länk till en, ska fortfarande tas bort.
describe('groundMarkdown — förslag om att SKAPA en ny sida', () => {
  it('ett uttryckligt "skapa en ny sida"-förslag med sökvägen bara som exempel får stå kvar', () => {
    const steps = '1. Identifiera de vanligaste frågorna.\n2. Skapa en ny undersida, exempelvis /vanliga-fragor.\n3. Publicera frågorna.'
    const c = ctx()
    expect(groundMarkdown(steps, tvakanten(), c)).toBe(steps)
    expect(c.log).toEqual([])
  })

  it('samma sökväg som ett påstående (inget skapa-förslag) tas fortfarande bort', () => {
    const c = ctx()
    const out = groundMarkdown('1. Identifiera de vanligaste frågorna.\n2. Läs mer om detta på /vanliga-fragor.\n3. Publicera frågorna.', tvakanten(), c)!
    expect(out).not.toContain('/vanliga-fragor')
    expect(c.log).toEqual([expect.objectContaining({ kind: 'url', action: 'borttagen' })])
  })

  it('en riktig länk till en okänd sida tas bort även när meningen föreslår att skapa en ny sida', () => {
    const c = ctx()
    const out = groundMarkdown('Skapa en ny sida med era priser, se [Priser](/priser) för inspiration.', tvakanten(), c)!
    expect(out).toBe('Skapa en ny sida med era priser, se Priser för inspiration.')
    expect(c.log).toEqual([expect.objectContaining({ kind: 'url', action: 'borttagen' })])
  })

  it('"skapa" utan ordet sida/undersida i närheten flaggar fortfarande sökvägen', () => {
    const c = ctx()
    // Hela meningen är den enda sökvägsreferensen och tas bort helt (blir null).
    const out = groundMarkdown('Skapa ett konto och besök /vanliga-fragor för mer information.', tvakanten(), c)
    expect(out).toBeNull()
    expect(c.log).toEqual([expect.objectContaining({ kind: 'url', action: 'borttagen' })])
  })
})

describe('groundReport', () => {
  it('muterar rika fält och syntes, loggar varje ändring med fältnamn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const checks = [
      { key: 'internalLinks', richSteps: '1. Länka till /priser/.\n2. Länka till startsidan.', richCodeExample: '<a href="/priser/">Priser</a>\n<a href="/">Hem</a>', richRelevance: 'Sprej Hårstudio behöver fler länkar.' },
      { key: 'https', richSteps: null, richCodeExample: null, richRelevance: null },
    ]
    const synthesis = { actionPlan: '### Kritiskt\n\n1. Ring 060-99 99 99.', summary: 'Kort sammanfattning.' }
    const log = groundReport(checks, synthesis, sprej())
    expect(checks[0].richSteps).toBe('1. Länka till startsidan.')
    expect(checks[0].richCodeExample).toBe('<a href="/">Hem</a>')
    expect(synthesis.actionPlan).toBe('### Kritiskt\n\n1. Ring 060-61 45 00.')
    expect(log.map(l => l.field)).toEqual(expect.arrayContaining(['internalLinks.richSteps', 'internalLinks.richCodeExample', 'synthesis.actionPlan']))
    expect(warn).toHaveBeenCalledTimes(log.length)
    expect(warn.mock.calls[0][0]).toMatch(/^\[FactCheck\] /)
  })
})
