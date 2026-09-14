import { describe, it, expect } from 'vitest'
import { fillTemplate } from '@/app/lib/templateFill'

describe('fillTemplate', () => {
  it('replaces all known placeholders with real values', () => {
    const template = `<script type="application/ld+json">
{
  "name": "<FÖRETAGSNAMN>",
  "telephone": "<TELEFONNUMMER>",
  "address": {
    "streetAddress": "<GATUADRESS>",
    "addressLocality": "<STAD>",
    "postalCode": "<POSTNUMMER>"
  },
  "url": "https://<DOMÄN>"
}
</script>`
    const result = fillTemplate(template, {
      companyName: 'Sprej Hårstudio',
      phone: '060-123 45 67',
      streetAddress: 'Storgatan 1',
      city: 'Sundsvall',
      postalCode: '852 30',
      domain: 'sprej.nu',
    })

    expect(result).toContain('"name": "Sprej Hårstudio"')
    expect(result).toContain('"telephone": "060-123 45 67"')
    expect(result).toContain('"streetAddress": "Storgatan 1"')
    expect(result).toContain('"addressLocality": "Sundsvall"')
    expect(result).toContain('"postalCode": "852 30"')
    expect(result).toContain('"url": "https://sprej.nu"')
    expect(result).not.toMatch(/<FÖRETAGSNAMN>|<TELEFONNUMMER>|<GATUADRESS>|<STAD>|<POSTNUMMER>|<DOMÄN>/)
  })

  it('replaces every occurrence of a repeated placeholder', () => {
    const template = 'Tel: <a href="tel:<TELEFONNUMMER>"><TELEFONNUMMER></a>'
    const result = fillTemplate(template, { phone: '070-000 00 00' })
    expect(result).toBe('Tel: <a href="tel:070-000 00 00">070-000 00 00</a>')
  })

  it('leaves unknown placeholders untouched (never fabricates facts)', () => {
    const template = '"@type": "<VERKSAMHETSTYP>", "name": "<FÖRETAGSNAMN>", "org": "<ORGNUMMER>"'
    const result = fillTemplate(template, { companyName: 'Tvåkanten' })
    expect(result).toBe('"@type": "<VERKSAMHETSTYP>", "name": "Tvåkanten", "org": "<ORGNUMMER>"')
  })

  it('leaves a placeholder untouched when the matching meta value is null or missing', () => {
    const template = '<FÖRETAGSNAMN> i <STAD>'
    const result = fillTemplate(template, { companyName: 'Tvåkanten', city: null })
    expect(result).toBe('Tvåkanten i <STAD>')
  })

  it('leaves a placeholder untouched when the matching meta value is an empty/whitespace string', () => {
    const template = 'Tel: <TELEFONNUMMER>'
    const result = fillTemplate(template, { phone: '   ' })
    expect(result).toBe('Tel: <TELEFONNUMMER>')
  })

  it('does not fill TJÄNST (branch word — needs grammatical agreement we cannot guarantee)', () => {
    const template = '<FÖRETAGSNAMN> — <TJÄNST> i <STAD>'
    const result = fillTemplate(template, { companyName: 'Sprej', city: 'Sundsvall' })
    expect(result).toBe('Sprej — <TJÄNST> i Sundsvall')
  })

  it('returns the template unchanged when meta is empty', () => {
    const template = '<FÖRETAGSNAMN> — <TELEFONNUMMER>'
    expect(fillTemplate(template, {})).toBe(template)
  })

  it('trims surrounding whitespace from filled values', () => {
    const result = fillTemplate('<STAD>', { city: '  Göteborg  ' })
    expect(result).toBe('Göteborg')
  })
})
