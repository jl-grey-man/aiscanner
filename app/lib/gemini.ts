// Gemini/OpenRouter API client for Next.js App Router

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

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

async function callOpenRouter(model: string, prompt: string): Promise<any> {
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
    throw new Error(`OpenRouter error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  if (!content.trim()) {
    throw new Error('AI-svaret var tomt')
  }

  try {
    return extractJson(content)
  } catch (err: any) {
    // Log raw response for debugging (truncated)
    console.error('JSON parse failed. Raw content (first 500 chars):', content.slice(0, 500))
    throw new Error(`Kunde inte tolka AI-svaret som JSON: ${err.message}`)
  }
}

export async function analyzeWithFlash(prompt: string): Promise<any> {
  return callOpenRouter('google/gemini-2.0-flash-001', prompt)
}

export async function analyzeWithPro(prompt: string): Promise<any> {
  return callOpenRouter('google/gemini-2.5-pro-preview-03-25', prompt)
}
