import { describe, it, expect, vi } from 'vitest'
import {
  extractReviewTexts,
  buildReviewInsightsPrompt,
  validateReviewInsights,
  analyzeReviewInsights,
} from '@/app/lib/reviewInsights'

const meta = { companyName: 'Tvåkanten', bransch: 'restaurang' }

describe('extractReviewTexts', () => {
  it('plockar ut betyg + ordagrann text, max 5, hoppar över tomma', () => {
    const raw = [
      { rating: 5, text: { text: 'Fantastisk mat!' } },
      { rating: 2, text: { text: '' } }, // tom text — bort
      { rating: 4, text: {} }, // saknar text — bort
      { rating: 3, text: { text: 'Trevlig personal' } },
      { rating: 1, text: { text: 'Långsam service' } },
      { rating: 5, text: { text: 'Bra läge' } },
      { rating: 4, text: { text: 'Femte recensionen' } },
      { rating: 5, text: { text: 'Sjätte — ska klippas bort' } },
    ]
    const out = extractReviewTexts(raw)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual({ rating: 5, text: 'Fantastisk mat!' })
    expect(out.map(r => r.text)).not.toContain('Sjätte — ska klippas bort')
  })

  it('hanterar icke-array indata', () => {
    expect(extractReviewTexts(null)).toEqual([])
    expect(extractReviewTexts(undefined)).toEqual([])
    expect(extractReviewTexts('not an array')).toEqual([])
  })
})

describe('buildReviewInsightsPrompt', () => {
  it('inkluderar recensionstexterna ordagrant och företagsnamn/bransch', () => {
    const prompt = buildReviewInsightsPrompt(
      [{ rating: 5, text: 'Fantastisk mat och trevlig personal!' }],
      meta,
    )
    expect(prompt).toContain('Fantastisk mat och trevlig personal!')
    expect(prompt).toContain('Tvåkanten')
    expect(prompt).toContain('restaurang')
    expect(prompt).toContain('ORDAGRANT')
  })
})

describe('validateReviewInsights — citatvalidering', () => {
  const reviewTexts = [
    'Fantastisk mat och mycket trevlig personal!',
    'Långsam service men god mat.',
  ]

  it('behåller teman vars citat är ett exakt utdrag ur en recension', () => {
    const raw = {
      themes: [
        { theme: 'Trevlig personal', sentiment: 'positive', quote: 'mycket trevlig personal' },
        { theme: 'Långsam service', sentiment: 'negative', quote: 'Långsam service' },
      ],
      praise: ['God mat'],
      complaints: ['Service kan vara långsam'],
      sampleNote: 'Baserat på 2 recensioner.',
    }
    const out = validateReviewInsights(raw, reviewTexts)
    expect(out).not.toBeNull()
    expect(out!.themes).toHaveLength(2)
    expect(out!.themes[0].quote).toBe('mycket trevlig personal')
    expect(out!.praise).toEqual(['God mat'])
    expect(out!.complaints).toEqual(['Service kan vara långsam'])
  })

  it('kastar teman vars citat INTE finns ordagrant i någon recension (påhittat)', () => {
    const raw = {
      themes: [
        { theme: 'Trevlig personal', sentiment: 'positive', quote: 'mycket trevlig personal' },
        { theme: 'Påhittat tema', sentiment: 'positive', quote: 'bästa restaurangen i stan' }, // finns inte i texten
      ],
      praise: [],
      complaints: [],
      sampleNote: '',
    }
    const out = validateReviewInsights(raw, reviewTexts)
    expect(out!.themes).toHaveLength(1)
    expect(out!.themes.map(t => t.theme)).toEqual(['Trevlig personal'])
  })

  it('kastar teman med omskrivet/nästan-matchande citat (inte exakt substräng)', () => {
    const raw = {
      themes: [
        // Omskrivet — inte ordagrant ur "mycket trevlig personal"
        { theme: 'Personal', sentiment: 'positive', quote: 'personalen var mycket trevlig' },
      ],
      praise: [],
      complaints: [],
      sampleNote: '',
    }
    const out = validateReviewInsights(raw, reviewTexts)
    expect(out).toBeNull()
  })

  it('kastar teman med ogiltig sentiment', () => {
    const raw = {
      themes: [
        { theme: 'X', sentiment: 'awesome', quote: 'Långsam service' },
      ],
      praise: [],
      complaints: [],
      sampleNote: '',
    }
    expect(validateReviewInsights(raw, reviewTexts)).toBeNull()
  })

  it('returnerar null om inget tema, beröm eller klagomål finns kvar', () => {
    expect(validateReviewInsights({ themes: [], praise: [], complaints: [], sampleNote: '' }, reviewTexts)).toBeNull()
    expect(validateReviewInsights(null, reviewTexts)).toBeNull()
    expect(validateReviewInsights('not an object', reviewTexts)).toBeNull()
  })

  it('behåller praise/complaints även utan giltiga teman', () => {
    const out = validateReviewInsights(
      { themes: [{ theme: 'X', sentiment: 'positive', quote: 'finns inte i texten' }], praise: ['Bra läge'], complaints: [], sampleNote: '' },
      reviewTexts,
    )
    expect(out).not.toBeNull()
    expect(out!.themes).toEqual([])
    expect(out!.praise).toEqual(['Bra läge'])
  })

  it('begränsar till max 5 teman', () => {
    const themes = Array.from({ length: 8 }, (_, i) => ({
      theme: `Tema ${i}`,
      sentiment: 'positive' as const,
      quote: 'Långsam service',
    }))
    const out = validateReviewInsights({ themes, praise: [], complaints: [], sampleNote: '' }, reviewTexts)
    expect(out!.themes).toHaveLength(5)
  })
})

describe('analyzeReviewInsights', () => {
  it('returnerar null utan att anropa AI:t om det inte finns några recensionstexter', async () => {
    const call = vi.fn()
    const out = await analyzeReviewInsights([], meta, call)
    expect(out).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })

  it('anropar Flash i JSON-läge och validerar svaret mot de riktiga texterna', async () => {
    const reviews = [
      { rating: 5, text: { text: 'Fantastisk mat och trevlig personal!' } },
      { rating: 2, text: { text: 'Maten var kall.' } },
    ]
    const call = vi.fn().mockResolvedValue({
      themes: [
        { theme: 'Trevlig personal', sentiment: 'positive', quote: 'trevlig personal' },
        { theme: 'Kall mat', sentiment: 'negative', quote: 'Maten var kall' },
        { theme: 'Påhittat', sentiment: 'positive', quote: 'bästa i stan' },
      ],
      praise: ['God mat'],
      complaints: ['Temperatur på maten'],
      sampleNote: 'Baserat på 2 recensioner.',
    })
    const out = await analyzeReviewInsights(reviews, meta, call)
    expect(call).toHaveBeenCalledTimes(1)
    const [model, , userPrompt, , expectMarkdown] = call.mock.calls[0]
    expect(model).toBe('google/gemini-2.5-flash')
    expect(expectMarkdown).toBe(false)
    expect(userPrompt).toContain('Fantastisk mat och trevlig personal!')
    expect(out).not.toBeNull()
    expect(out!.themes).toHaveLength(2)
    expect(out!.themes.map(t => t.theme)).toEqual(['Trevlig personal', 'Kall mat'])
  })

  it('returnerar null om anropet misslyckas permanent (efter retry)', async () => {
    const reviews = [{ rating: 5, text: { text: 'Bra ställe' } }]
    const call = vi.fn().mockRejectedValue(Object.assign(new Error('OpenRouter 400'), { permanent: true }))
    const out = await analyzeReviewInsights(reviews, meta, call)
    expect(out).toBeNull()
    expect(call).toHaveBeenCalledTimes(1) // permanent fel retryas inte
  })
})
