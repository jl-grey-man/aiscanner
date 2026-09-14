import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  OPENROUTER_API_URL,
  OPENROUTER_PRIVACY_PROVIDER,
  buildOpenRouterRequestBody,
} from '@/app/lib/openrouter'

describe('buildOpenRouterRequestBody', () => {
  it('sätter provider.data_collection = "deny" (dataskydd — Places/kunddata får aldrig lagras/tränas på)', () => {
    const body = buildOpenRouterRequestBody({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hej' }],
    })
    expect(body.provider).toEqual({ data_collection: 'deny' })
  })

  it('behåller alla andra fält oförändrade', () => {
    const body = buildOpenRouterRequestBody({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: 'system-text' },
        { role: 'user', content: 'user-text' },
      ],
      temperature: 0.2,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    })
    expect(body).toEqual({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: 'system-text' },
        { role: 'user', content: 'user-text' },
      ],
      temperature: 0.2,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
      provider: { data_collection: 'deny' },
    })
  })

  it('OpenRouterRequestParams saknar ett "provider"-fält — anropsstället kan alltså inte skriva över dataskyddet', () => {
    const body = buildOpenRouterRequestBody({
      model: 'openai/gpt-4o-mini',
      // @ts-expect-error — provider ska inte gå att sätta här, det bevisar typkontraktet
      provider: { data_collection: 'allow' },
      messages: [{ role: 'user', content: 'hej' }],
    })
    // Spread-ordningen i buildOpenRouterRequestBody sätter alltid provider EFTER
    // ...params, så även om någon smugglar in fältet vinner ändå "deny".
    expect(body.provider).toEqual({ data_collection: 'deny' })
  })

  it('OPENROUTER_API_URL pekar på OpenRouters chat/completions-endpoint', () => {
    expect(OPENROUTER_API_URL).toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('OPENROUTER_PRIVACY_PROVIDER är konstanten som används', () => {
    expect(OPENROUTER_PRIVACY_PROVIDER).toEqual({ data_collection: 'deny' })
  })
})

/**
 * Regressionsskydd: VARJE OpenRouter-anropsställe i app/ måste gå via den
 * centraliserade helpern i app/lib/openrouter.ts — annars kan någon lägga till
 * ett nytt fetch-anrop mot openrouter.ai utan dataskyddsparametern utan att
 * något test upptäcker det. Se kommentaren i app/lib/openrouter.ts.
 */
describe('centralisering — inget anropsställe hårdkodar URL:en eller provider-fältet vid sidan av helpern', () => {
  const appDir = join(__dirname, '..', 'app')
  const helperFile = join(appDir, 'lib', 'openrouter.ts')

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) out.push(...walk(full))
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
  }

  const files = walk(appDir)

  it('bara app/lib/openrouter.ts innehåller strängen "openrouter.ai"', () => {
    const hits = files.filter((f) => f !== helperFile && readFileSync(f, 'utf8').includes('openrouter.ai'))
    expect(hits.map((f) => relative(appDir, f))).toEqual([])
  })

  it('bara app/lib/openrouter.ts innehåller strängen "data_collection"', () => {
    const hits = files.filter((f) => f !== helperFile && readFileSync(f, 'utf8').includes('data_collection'))
    expect(hits.map((f) => relative(appDir, f))).toEqual([])
  })

  it('de kända anropsställena (route.ts, aiMentionChecker.ts) importerar helpern', () => {
    const routeFile = join(appDir, 'api', 'enhanced-scan', 'route.ts')
    const aiMentionFile = join(appDir, 'lib', 'aiMentionChecker.ts')
    expect(readFileSync(routeFile, 'utf8')).toContain("from '@/app/lib/openrouter'")
    expect(readFileSync(aiMentionFile, 'utf8')).toContain("from './openrouter'")
  })
})
