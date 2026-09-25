import { describe, it, expect } from 'vitest'
import { extractSummary } from '@/app/lib/scraper'

// bjurfors.se-buggen (verifierad live sep 2026): contactInfo (#30) blev "ok" trots att
// sidan varken har ett telefonnummer eller en e-postadress synlig. Grundorsaken var att
// hasContactInfo hade en tredje, bar nyckelordsgren (/kontakt|contact|telefon|\btel\b/i)
// som slog till på navigeringslänken "Kontakta mäklare" -- bjurfors.se har varken
// <nav> eller <header> så menyn strippas aldrig bort innan bodyText extraheras.
describe('extractSummary — hasContactInfo (#30)', () => {
  it('blir false när sidan bara har en "kontakt"-navigeringslänk, inget telefonnummer eller e-postadress (bjurfors.se-fallet)', () => {
    const html = `
      <html><body>
        <div class="topbar">
          <a href="/kontakt-maklare">Kontakta mäklare</a>
          <a href="/vardera">Värdera din bostad</a>
        </div>
        <main>
          <h1>Bjurfors</h1>
          <p>Vi hjälper dig hitta ditt nästa hem. Kontakta oss för mer information.</p>
        </main>
      </body></html>
    `
    const summary = extractSummary(html, 'https://www.bjurfors.se')
    expect(summary.phones).toEqual([])
    expect(summary.hasContactInfo).toBe(false)
  })

  it('förblir true när sidan har ett riktigt telefonnummer (tvakanten.se/sprej.nu-fallet)', () => {
    const html = `
      <html><body>
        <main>
          <h1>Sprej Hårstudio</h1>
          <p>Ring oss på 031-123 45 67 för bokning.</p>
        </main>
      </body></html>
    `
    const summary = extractSummary(html, 'https://www.sprej.nu')
    expect(summary.phones.length).toBeGreaterThan(0)
    expect(summary.hasContactInfo).toBe(true)
  })

  it('blir true när e-postadressen finns bortom de första 800 tecknen (söker i hela bodyText, inte den kapade AI-prompt-slicen)', () => {
    const filler = 'Lorem ipsum dolor sit amet. '.repeat(40) // väl över 800 tecken
    const html = `
      <html><body>
        <main>
          <p>${filler}</p>
          <p>Skriv till oss: info@example.se</p>
        </main>
      </body></html>
    `
    const summary = extractSummary(html, 'https://www.example.se')
    expect(summary.bodyText.length).toBeLessThanOrEqual(800)
    expect(summary.bodyText).not.toContain('info@example.se')
    expect(summary.hasContactInfo).toBe(true)
  })

  it('blir false när sidan varken har telefon, e-post eller ens ordet "kontakt"', () => {
    const html = `<html><body><main><h1>Om oss</h1><p>Vi älskar hantverk.</p></main></body></html>`
    const summary = extractSummary(html, 'https://www.example.se')
    expect(summary.hasContactInfo).toBe(false)
  })
})
