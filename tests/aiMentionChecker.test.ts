import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkAIMentions,
  buildClassificationPrompt,
  validateClassification,
} from '@/app/lib/aiMentionChecker'

const FLASH = 'google/gemini-2.5-flash'

/** Ett giltigt fetch-svar från OpenRouter (callGPT — GPT-4o-mini, plain text). */
function gptResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], model: 'openai/gpt-4o-mini' }),
    text: async () => '',
  }
}

const meta = { companyName: 'Sprej Hårstudio', city: 'Sundsvall', bransch: 'frisör', address: 'Storgatan 1, 852 30 Sundsvall' }

describe('validateClassification', () => {
  it('parsar en giltig klassificering med faktagranskning', () => {
    const out = validateClassification({
      classification: 'wrongFacts',
      factChecks: [
        { claim: 'Ligger i Haga', verdict: 'wrong', correctFact: 'Kungsportsavenyen 27' },
        { claim: 'Är en restaurang', verdict: 'correct', correctFact: null },
      ],
    })
    expect(out.classification).toBe('wrongFacts')
    expect(out.factChecks).toHaveLength(2)
    expect(out.factChecks[0]).toEqual({ claim: 'Ligger i Haga', verdict: 'wrong', correctFact: 'Kungsportsavenyen 27' })
  })

  it('kastar på ogiltig klassificering', () => {
    expect(() => validateClassification({ classification: 'maybe', factChecks: [] })).toThrow()
  })

  it('kastar på icke-objekt', () => {
    expect(() => validateClassification(null)).toThrow()
    expect(() => validateClassification('text')).toThrow()
  })

  it('släpper påståenden med ogiltig verdict eller tomt claim', () => {
    const out = validateClassification({
      classification: 'knows',
      factChecks: [
        { claim: '', verdict: 'wrong', correctFact: 'X' },
        { claim: 'Bra påstående', verdict: 'kanske', correctFact: null },
        { claim: 'Giltigt', verdict: 'correct', correctFact: null },
      ],
    })
    expect(out.factChecks).toHaveLength(1)
    expect(out.factChecks[0].claim).toBe('Giltigt')
  })

  it('nollställer correctFact om verdict inte är "wrong" (modellen ska inte kunna smyga in ett falskt "rätt svar")', () => {
    const out = validateClassification({
      classification: 'knows',
      factChecks: [{ claim: 'X', verdict: 'correct', correctFact: 'Ska försvinna' }],
    })
    expect(out.factChecks[0].correctFact).toBeNull()
  })

  it('begränsar till max 10 påståenden', () => {
    const factChecks = Array.from({ length: 15 }, (_, i) => ({ claim: `Påstående ${i}`, verdict: 'correct' as const, correctFact: null }))
    const out = validateClassification({ classification: 'knows', factChecks })
    expect(out.factChecks).toHaveLength(10)
  })
})

describe('buildClassificationPrompt', () => {
  it('inkluderar kända fakta (adress, stad, bransch) och AI-svaret', () => {
    const prompt = buildClassificationPrompt('Sprej Hårstudio', 'Sundsvall', 'frisör', 'Storgatan 1, 852 30 Sundsvall', 'Jag har ingen information om dem.')
    expect(prompt).toContain('Sprej Hårstudio')
    expect(prompt).toContain('Sundsvall')
    expect(prompt).toContain('frisör')
    expect(prompt).toContain('Storgatan 1, 852 30 Sundsvall')
    expect(prompt).toContain('Jag har ingen information om dem.')
    expect(prompt).toContain('wrongFacts')
  })

  it('utelämnar adressraden när adress saknas', () => {
    const prompt = buildClassificationPrompt('Bolaget', 'Umeå', 'bageri', null, 'Svar.')
    expect(prompt).not.toContain('Adress (Google Business Profile)')
  })
})

describe('checkAIMentions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('wrongFacts: status bad även om AI nämner företaget i nischsökning, finding citerar felet + rätt uppgift', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(gptResponse('Tvåkanten är en mysig bar belägen i området Haga.')) // entity query
      .mockResolvedValueOnce(gptResponse('Testa Tvåkanten, en av de bästa barerna i stan.')) // category query (entityKnows=false -> ingen nisch-extraktion)

    const call = vi.fn().mockResolvedValue({
      classification: 'wrongFacts',
      factChecks: [{ claim: 'Ligger i Haga', verdict: 'wrong', correctFact: 'Kungsportsavenyen 27' }],
    })

    const result = await checkAIMentions('Tvåkanten', 'Göteborg', 'restaurang', 'fake-key', call, ['restaurant'], 'Kungsportsavenyen 27, 411 05 Göteborg')

    expect(result.errored).toBe(false)
    expect(result.entityClassification).toBe('wrongFacts')
    expect(result.entityKnows).toBe(false)
    expect(result.status).toBe('bad')
    expect(result.factChecks).toEqual([{ claim: 'Ligger i Haga', verdict: 'wrong', correctFact: 'Kungsportsavenyen 27' }])
    expect(result.finding).toContain('Haga')
    expect(result.finding).toContain('Kungsportsavenyen 27')

    // Klassificeringsanropet ska gå mot Flash, i JSON-läge, med kända fakta i prompten
    expect(call).toHaveBeenCalledTimes(1)
    const [model, , userPrompt, , expectMarkdown] = call.mock.calls[0]
    expect(model).toBe(FLASH)
    expect(expectMarkdown).toBe(false)
    expect(userPrompt).toContain('Kungsportsavenyen 27, 411 05 Göteborg')
  })

  it('doesNotKnow: AI säger uttryckligen att den saknar info -> entityKnows false, status bad (regression för Audit #4 — längdheuristiken satte tidigare entityKnows=true här)', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const longButIgnorantResponse = 'Jag har tyvärr ingen specifik information om Sprej Hårstudio, men om ni avser en frisörsalong kan jag inte bekräfta detaljer om just detta företag utan mer kontext.'
    fetchMock
      .mockResolvedValueOnce(gptResponse(longButIgnorantResponse)) // entity query — längre än 80 tecken!
      .mockResolvedValueOnce(gptResponse('Här är några frisörer i Sundsvall: Jess Frisörer, Klippotek.')) // category query

    const call = vi.fn().mockResolvedValue({ classification: 'doesNotKnow', factChecks: [] })

    const result = await checkAIMentions(meta.companyName, meta.city, meta.bransch, 'fake-key', call, undefined, meta.address)

    expect(longButIgnorantResponse.length).toBeGreaterThan(80) // beviset: gamla heuristiken hade gett entityKnows=true
    expect(result.entityClassification).toBe('doesNotKnow')
    expect(result.entityKnows).toBe(false)
    expect(result.status).toBe('bad')
    expect(result.errored).toBe(false)
  })

  it('knows + nämns i nischsökning -> status ok, nisch extraheras', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(gptResponse('Sprej Hårstudio på Storgatan 1 i Sundsvall är känt för sina färgbehandlingar.')) // entity query
      .mockResolvedValueOnce(gptResponse('frisör')) // extractNiche
      .mockResolvedValueOnce(gptResponse('Sprej Hårstudio rekommenderas ofta för färgbehandlingar i Sundsvall.')) // category query

    const call = vi.fn().mockResolvedValue({
      classification: 'knows',
      factChecks: [{ claim: 'Ligger på Storgatan 1', verdict: 'correct', correctFact: null }],
    })

    const result = await checkAIMentions(meta.companyName, meta.city, meta.bransch, 'fake-key', call, undefined, meta.address)

    expect(result.entityClassification).toBe('knows')
    expect(result.entityKnows).toBe(true)
    expect(result.categoryMentioned).toBe(true)
    expect(result.status).toBe('ok')
  })

  it('klassificeringsanropet misslyckas permanent -> hela checken blir errored:true (aldrig bad), Task 9-mönstret', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(gptResponse('Något svar om företaget.'))

    const call = vi.fn().mockRejectedValue(Object.assign(new Error('OpenRouter 400'), { permanent: true }))

    const result = await checkAIMentions(meta.companyName, meta.city, meta.bransch, 'fake-key', call, undefined, meta.address)

    expect(result.errored).toBe(true)
    expect(call).toHaveBeenCalledTimes(1) // permanent fel retryas inte
  })

  it('klassificeringssvaret är trasig/oanvändbar JSON -> retryas, misslyckas ändå -> errored:true, inte bad', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(gptResponse('Något svar om företaget.'))

    // Alltid ogiltig klassificering — validateClassification kastar varje gång
    const call = vi.fn().mockResolvedValue({ classification: 'hallucinerar', factChecks: [] })

    const result = await checkAIMentions(meta.companyName, meta.city, meta.bransch, 'fake-key', call, undefined, meta.address)

    expect(result.errored).toBe(true)
    expect(call).toHaveBeenCalledTimes(2) // ej permanent -> withRetry försöker 2 gånger
  })

  it('entity-frågan (GPT) misslyckas -> errored:true utan att klassificeringen ens anropas', async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockRejectedValueOnce(new Error('network error'))

    const call = vi.fn()

    const result = await checkAIMentions(meta.companyName, meta.city, meta.bransch, 'fake-key', call, undefined, meta.address)

    expect(result.errored).toBe(true)
    expect(call).not.toHaveBeenCalled()
  })
})
