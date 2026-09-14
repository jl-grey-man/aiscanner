import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkSwedishDirectories } from '@/app/lib/directoryChecker'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

interface TavilyResult { url: string; title: string; content: string }

/** Mockar Tavily-anropet: rätt svar per site:-domän ur query-strängen. */
function mockTavily(byDomain: Record<string, TavilyResult[]>) {
  const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    const domain = Object.keys(byDomain).find(d => body.query.includes(`site:${d}`))
    return new Response(JSON.stringify({ results: domain ? byDomain[domain] : [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('checkSwedishDirectories — NAP-konsistens mot Google Business Profile', () => {
  // Riktiga värden från en scan av tvakanten.se (2026-09-14): Eniro och Hitta hittade
  // båda "Tvåkanten AB" — men det är en HELT ANNAN, olikartad "Tvåkanten AB" (ett
  // finansbolag, org.nr 5566672027) än restaurangen (verkligt namn "Mialda Restaurang -
  // Rest. Tvåkanten AB", org.nr 556469-2415). Kataloguppslagen är alltså ense om samma
  // FELAKTIGA adress ("Maj på Malös gata 40"), medan restaurangens verifierade Google
  // Business Profile-adress är "Kungsportsavenyen 27".
  const eniroWrongCompany: TavilyResult[] = [{
    url: 'https://www.eniro.se/tv%C3%A5kanten+ab+g%C3%B6teborg/14298731/firma',
    title: 'Tvåkanten AB, GÖTEBORG | företaget | eniro.se',
    content: 'Tvåkanten AB är verksam inom branschen Finansbolag. Adress: Maj på Malös gata 40, 41767 Göteborg.',
  }]
  const hittaWrongCompany: TavilyResult[] = [{
    url: 'https://www.hitta.se/tv%C3%A5kanten+ab/g%C3%B6teborg/apsbhhmo',
    title: 'Tvåkanten AB - Maj På Malös Gata 40, Göteborg | hitta.se',
    content: 'Tvåkanten AB. Besöksadress: Maj på Malös gata 40, 41767 Göteborg.',
  }]

  it('BUGGEN: utan GBP i jämförelsen blir två kataloger som råkar dela samma FEL adress "konsekvent"', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key')
    mockTavily({ 'eniro.se': eniroWrongCompany, 'hitta.se': hittaWrongCompany })

    const result = await checkSwedishDirectories('Tvåkanten', 'Göteborg', [])

    expect(result.napConsistency.checked).toBe(true)
    expect(result.napConsistency.consistent).toBe(true) // dokumenterar rotorsaken
  })

  it('FIXEN: samma katalogdata jämförd mot en verifierad GBP-adress blir inkonsekvent', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key')
    mockTavily({ 'eniro.se': eniroWrongCompany, 'hitta.se': hittaWrongCompany })

    const result = await checkSwedishDirectories('Tvåkanten', 'Göteborg', [], {
      address: 'Kungsportsavenyen 27, 411 36 Göteborg',
    })

    expect(result.napConsistency.checked).toBe(true)
    expect(result.napConsistency.consistent).toBe(false)
    expect(result.napConsistency.address.consistent).toBe(false)
    // GBP-värdet är referensen och ligger först
    expect(result.napConsistency.address.values[0]).toEqual({
      directory: 'Google Business Profile',
      value: 'Kungsportsavenyen 27, 411 36 Göteborg',
    })
    expect(result.status).toBe('warning')
    expect(result.napConsistency.finding).toContain('adress skiljer sig åt')
  })

  it('en katalogträff som inte nämner det sökta företaget räknas inte som en listning', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key')
    mockTavily({
      // Eniros enda träff handlar om ett helt annat bolag ("Kometen") — nämner
      // aldrig "Tvåkanten" och ska därför inte räknas som en listning alls.
      'eniro.se': [{
        url: 'https://www.eniro.se/kometen+ab/12345/firma',
        title: 'Kometen AB, GÖTEBORG | företaget | eniro.se',
        content: 'Kometen AB är verksam inom restaurangverksamhet. Kristinelundsgatan 9, 41137 Göteborg.',
      }],
      'hitta.se': [],
    })

    const result = await checkSwedishDirectories('Tvåkanten', 'Göteborg', [])

    const eniro = result.directories.find(d => d.name === 'Eniro')
    expect(eniro?.found).toBe(false)
    expect(eniro?.nap).toBeUndefined()
  })

  it('GBP + kataloger som verkligen är överens förblir "konsekvent"', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key')
    mockTavily({
      'eniro.se': [{
        url: 'https://www.eniro.se/tv%C3%A5kanten+ab/1/firma',
        title: 'Tvåkanten AB, GÖTEBORG | företaget | eniro.se',
        content: 'Tvåkanten AB. Kungsportsavenyen 27, 41136 Göteborg.',
      }],
      'hitta.se': [{
        url: 'https://www.hitta.se/tvakanten/abc123x',
        title: 'Tvåkanten AB - Kungsportsavenyen 27, Göteborg | hitta.se',
        content: 'Tvåkanten AB. Kungsportsavenyen 27, 41136 Göteborg.',
      }],
    })

    const result = await checkSwedishDirectories('Tvåkanten', 'Göteborg', [], {
      address: 'Kungsportsavenyen 27, 411 36 Göteborg',
    })

    expect(result.napConsistency.checked).toBe(true)
    expect(result.napConsistency.consistent).toBe(true)
  })

  it('bara GBP + en katalog räcker för att jämförelsen ska köras (tidigare krävdes 2 kataloger)', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key')
    mockTavily({
      'eniro.se': [{
        url: 'https://www.eniro.se/tv%C3%A5kanten+ab/1/firma',
        title: 'Tvåkanten AB, GÖTEBORG | företaget | eniro.se',
        content: 'Tvåkanten AB. Maj på Malös gata 40, 41767 Göteborg.',
      }],
      'hitta.se': [],
    })

    const result = await checkSwedishDirectories('Tvåkanten', 'Göteborg', [], {
      address: 'Kungsportsavenyen 27, 411 36 Göteborg',
    })

    expect(result.napConsistency.checked).toBe(true)
    expect(result.napConsistency.consistent).toBe(false)
  })
})
