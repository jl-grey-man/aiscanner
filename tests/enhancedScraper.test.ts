import { describe, it, expect } from 'vitest'
import * as cheerio from 'cheerio'
import { extractFAQContent, detectLanguageSwitcher } from '@/app/lib/enhancedScraper'

// QA-körning juni 2026 (docs/qa-run-2026-06/RESULTS.md): roranalys.se faqSchema fick "bad" av
// scannern trots att truth-agenten (verifierad mot live-HTML) bedömde "warning" — sajten har ett
// synligt accordion-FAQ. Grundorsak: den gamla `extractFAQContent()` krävde att ordet "faq" fanns
// i ACKORDIONENS EGEN text (`.text().includes('faq')`), men roranalys.se har rubriken "FAQ" i en
// SYSKON-div (`<div class="module text"><h3>FAQ</h3></div>` följt av `<div class="module accordion">`
// med de faktiska frågorna) — .text() på accordion-elementet innehåller alltså aldrig ordet "faq".
// VERIFICATION-PROTOCOL.md listar "accordion" som ett eget, självständigt HTML-mönster (jämte
// dl/dt, details/summary, class/id "faq") utan krav på begleitande text. Dessa tester är en direkt
// regression av den verifierade roranalys-HTML-strukturen (se docs/qa-run-2026-06/RESULTS.md).

describe('extractFAQContent', () => {
  it('detects an accordion-style FAQ even when "faq" never appears inside the accordion itself (roranalys.se case)', () => {
    const html = `
      <div class="row">
        <div id="m4603" class="module text"><h3 class="subtitle">FAQ</h3></div>
        <div id="m3761" class="module accordion" data-req="accordion">
          <ul>
            <li><p class="itemTitle"><span>Vad är relining och varför är det ett bra alternativ till stambyte?</span></p></li>
            <li><p class="itemTitle"><span>Hur ofta bör man utföra stamspolning?</span></p></li>
          </ul>
        </div>
      </div>
    `
    const $ = cheerio.load(html)
    expect(extractFAQContent($)).toBe(true)
  })

  it('still returns false when there is no FAQ-like structure at all (sprej.nu case — must stay bad)', () => {
    const html = `
      <div class="hero"><h1>Sprej Hårstudio</h1></div>
      <div class="services"><p>Vi klipper, färgar och stylar.</p></div>
    `
    const $ = cheerio.load(html)
    expect(extractFAQContent($)).toBe(false)
  })

  it('does not treat a non-FAQ accordion (menu, price list) as FAQ content', () => {
    const html = `
      <div class="menu accordion">
        <h4>Förrätter</h4><p>Toast Skagen 145 kr</p>
        <h4>Varmrätter</h4><p>Köttbullar 195 kr</p>
      </div>
    `
    const $ = cheerio.load(html)
    expect(extractFAQContent($)).toBe(false)
  })

  it('detects dl/dt FAQ markup', () => {
    const $ = cheerio.load('<dl><dt>Fråga 1?</dt><dd>Svar</dd><dt>Fråga 2?</dt><dd>Svar</dd><dt>Fråga 3?</dt><dd>Svar</dd></dl>')
    expect(extractFAQContent($)).toBe(true)
  })

  it('detects details/summary FAQ markup', () => {
    const $ = cheerio.load('<details><summary>Q1</summary>A1</details><details><summary>Q2</summary>A2</details><details><summary>Q3</summary>A3</details>')
    expect(extractFAQContent($)).toBe(true)
  })

  it('detects class/id containing "faq"', () => {
    const $ = cheerio.load('<div class="faq-section"><p>Vanliga frågor</p></div>')
    expect(extractFAQContent($)).toBe(true)
  })
})

// tvakanten.se-buggen (verifierad live sep 2026): hreflang (#9) blev "notApplicable" trots
// att sajten har en "🇬🇧 ENGLISH"-länk till en engelsk sidversion (https://www.tvakanten.se/home/)
// och inga hreflang-taggar alls. Flash-checken byggde bara på hreflangTags-listan -- den fick
// aldrig se navigeringens språklänk.
describe('detectLanguageSwitcher', () => {
  const origin = 'https://www.tvakanten.se'

  it('räknar inte en helt svensk sajt vars sökvägar börjar med /sv/ som flerspråkig', () => {
    const $ = cheerio.load(`
      <nav>
        <a href="/sv/">Hem</a>
        <a href="/sv/tjanster/">Tjänster</a>
        <a href="/sv/kontakt/">Kontakt</a>
      </nav>
    `)
    expect(detectLanguageSwitcher($, origin)).toBe(false)
  })

  it('upptäcker en flagg-emoji-länk till en engelsk sidversion (tvakanten.se-fallet)', () => {
    const $ = cheerio.load(`
      <nav>
        <a href="/">Hem</a>
        <a href="/home/">🇬🇧 ENGLISH</a>
      </nav>
    `)
    expect(detectLanguageSwitcher($, origin)).toBe(true)
  })

  it('upptäcker en länktext som är ett rent språknamn (utan flagga)', () => {
    const $ = cheerio.load(`<nav><a href="/en/">English</a></nav>`)
    expect(detectLanguageSwitcher($, origin)).toBe(true)
  })

  it('upptäcker ett /en/-sökvägssegment även utan språknamn i länktexten', () => {
    const $ = cheerio.load(`<nav><a href="/en/home">Switch</a></nav>`)
    expect(detectLanguageSwitcher($, origin)).toBe(true)
  })

  it('upptäcker en lang=-querysträng', () => {
    const $ = cheerio.load(`<nav><a href="/page?lang=en">Switch</a></nav>`)
    expect(detectLanguageSwitcher($, origin)).toBe(true)
  })

  it('ignorerar en länk till en EXTERN engelskspråkig sajt (kräver samma origin)', () => {
    const $ = cheerio.load(`<nav><a href="https://www.bbc.com/">🇬🇧 English news</a></nav>`)
    expect(detectLanguageSwitcher($, origin)).toBe(false)
  })

  it('returnerar false utan någon språklänk (sprej.nu-fallet -- ska förbli notApplicable)', () => {
    const $ = cheerio.load(`
      <nav>
        <a href="/kontakt">Kontakt</a>
        <a href="/om-oss">Om oss</a>
      </nav>
    `)
    expect(detectLanguageSwitcher($, origin)).toBe(false)
  })

  it('kräver att länktexten är ett RENT språknamn -- en artikel om "England" ska inte räknas', () => {
    const $ = cheerio.load(`<a href="/resa-till-england">Resa till England</a>`)
    expect(detectLanguageSwitcher($, origin)).toBe(false)
  })
})
