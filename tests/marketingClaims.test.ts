import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Marknadsföringslagen (vilseledande reklam) — regressionsskydd.
 *
 * Scannern frågar EN OpenAI-modell (GPT-4o-mini) via OpenRouter om vad den vet
 * om företaget (se app/lib/aiMentionChecker.ts) — den kör aldrig ett riktigt
 * test mot Perplexity eller Googles AI-översikter (ingen kod anropar deras
 * API:er eller produkter). Marknadsföringstexterna får därför aldrig påstå att
 * vi MÄTER/TESTAR synlighet specifikt "i" Perplexity eller Google AI Overview
 * — bara att sajten kan vara förberedd/redo för AI-sök i allmänhet, och att vi
 * frågar en AI-modell vad den vet om företaget.
 */
const appDir = join(__dirname, '..', 'app')

const SCOPED_FILES = [
  join(appDir, 'layout.tsx'),
  join(appDir, 'om-oss', 'page.tsx'),
  join(appDir, 'components', 'landing', 'Hero.tsx'),
  join(appDir, 'components', 'landing', 'ConcreteExample.tsx'),
  join(appDir, 'components', 'landing', 'FaqSection.tsx'),
  join(appDir, 'components', 'landing', 'WhatAILooksAt.tsx'),
  join(appDir, 'components', 'landing', 'SearchChanged.tsx'),
  join(appDir, 'components', 'landing', 'Premium.tsx'),
  join(appDir, 'components', 'landing', 'PremiumCTA.tsx'),
  join(appDir, 'components', 'landing', 'ReportExample.tsx'),
  join(appDir, 'components', 'landing', 'ToolSection.tsx'),
  join(appDir, 'components', 'landing', 'Footer.tsx'),
]

// Fångar formuleringar som påstår att VI mäter/testar/kontrollerar synlighet
// direkt "i" ett namngivet AI-sökverktyg (t.ex. "vi mäter synlighet i
// Perplexity", "kontrollerar om ni syns i Google AI-översikter").
const OVERCLAIM_PATTERNS: RegExp[] = [
  /(mäter|testar|kontrollerar)[^.!?]{0,40}(synlig|syns)[^.!?]{0,20}\bi\s+(perplexity|chatgpt|google\s*ai)/i,
  /vi\s+(mäter|testar)\s+(er|din|ditt)\s+(synlighet|placering)\s+i\s+(perplexity|google\s*ai)/i,
]

describe('marknadsföringstexter påstår aldrig att vi mäter synlighet direkt i Perplexity/Google AI', () => {
  for (const file of SCOPED_FILES) {
    const rel = file.slice(appDir.length + 1)
    it(`${rel} innehåller inget överdrivet mätningspåstående`, () => {
      const content = readFileSync(file, 'utf8')
      for (const pattern of OVERCLAIM_PATTERNS) {
        expect(content, `${rel} matchade det förbjudna mönstret ${pattern}`).not.toMatch(pattern)
      }
    })
  }
})

describe('app/layout.tsx metadata — korrekt formulering (sep 2026-fixet)', () => {
  const content = readFileSync(join(appDir, 'layout.tsx'), 'utf8')

  it('beskriver förberedelse för AI-sök, inte en garanti om citering av tre namngivna motorer', () => {
    expect(content).toContain('förberedd för AI-sök som ChatGPT, Perplexity och Googles AI-översikter')
    // Den gamla, för specifika formuleringen ska vara borta.
    expect(content).not.toContain('vad som behöver fixas för att ChatGPT, Perplexity och Google AI ska hitta och citera dig')
  })

  it('beskriver AI-omnämnandetestet ärligt (en AI-modell tillfrågas — inte "ChatGPT" som produkt)', () => {
    expect(content).toContain('vi frågar en AI-modell vad den vet om er')
  })
})
