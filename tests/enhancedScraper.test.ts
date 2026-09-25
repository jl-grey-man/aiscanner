import { describe, it, expect } from 'vitest'
import * as cheerio from 'cheerio'
import { extractFAQContent } from '@/app/lib/enhancedScraper'

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
