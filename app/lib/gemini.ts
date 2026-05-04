// Gemini/OpenRouter API client for Next.js App Router

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// Fallback-modeller om primära är rate-limited
const FLASH_MODELS = [
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-lite-001',
  'mistralai/mistral-small-3.1-24b-instruct',
]

const PRO_MODELS = [
  'google/gemini-2.5-pro-preview-03-25',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-pro-exp-02-05',
]

function extractJson(text: string): any {
  const trimmed = text.trim()

  // 1. Try full string first
  try {
    return JSON.parse(trimmed)
  } catch { /* continue */ }

  // 2. Extract from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch { /* continue */ }
  }

  // 3. Find outermost JSON object/array by bracket matching
  let depth = 0
  let start = -1
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{' || trimmed[i] === '[') {
      if (depth === 0) start = i
      depth++
    } else if (trimmed[i] === '}' || trimmed[i] === ']') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1))
        } catch { /* continue searching */ }
      }
    }
  }

  // 4. Last resort: greedy match from first { to last }
  const greedy = trimmed.match(/\{[\s\S]*\}/)
  if (greedy) {
    try {
      return JSON.parse(greedy[0])
    } catch { /* continue */ }
  }

  throw new Error('Kunde inte tolka AI-svaret som JSON')
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function callWithModel(model: string, prompt: string): Promise<any> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://analyze.pipod.net',
      'X-Title': 'AI Search Scanner',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Du är en svensk AI-sökningsanalytiker. Svara ENDAST i giltig JSON. Ingen markdown, ingen text före eller efter JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${text}`, { cause: { status: res.status } })
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  if (!content.trim()) {
    throw new Error('AI-svaret var tomt')
  }

  try {
    return extractJson(content)
  } catch (err: any) {
    console.error('JSON parse failed. Raw content (first 500 chars):', content.slice(0, 500))
    throw new Error(`Kunde inte tolka AI-svaret som JSON: ${err.message}`)
  }
}

async function callWithFallback(models: string[], prompt: string): Promise<any> {
  const lastIdx = models.length - 1

  for (let i = 0; i <= lastIdx; i++) {
    const model = models[i]
    try {
      console.log(`[AI] Försöker med ${model}...`)
      const result = await callWithModel(model, prompt)
      console.log(`[AI] ${model} lyckades!`)
      return result
    } catch (err: any) {
      const status = err?.cause?.status || 0
      const isRateLimit = status === 429
      const isLast = i === lastIdx

      if (isRateLimit && !isLast) {
        const delay = (i + 1) * 8000 // 8s, 16s
        console.log(`[AI] ${model} rate-limited. Väntar ${delay}ms innan fallback...`)
        await sleep(delay)
        continue
      }

      if (isLast) {
        throw err // Kasta sista felet
      }

      // Andra fel — försök nästa modell direkt
      console.log(`[AI] ${model} misslyckades (${err.message}). Försöker fallback...`)
      continue
    }
  }

  throw new Error('Alla AI-modeller misslyckades')
}

export async function analyzeWithFlash(prompt: string): Promise<any> {
  return callWithFallback(FLASH_MODELS, prompt)
}

export async function analyzeWithPro(prompt: string): Promise<any> {
  return callWithFallback(PRO_MODELS, prompt)
}
