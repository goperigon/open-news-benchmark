import { pollLlmJsonDiscovery } from './llm-json-discovery.ts'
import type { DiscoveryAdapter } from './types.ts'

async function anthropicMessages(input: {
  model: string
  system: string
  user: string
}): Promise<{ text: string; responseMs: number; raw: unknown }> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const started = performance.now()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      system: input.system,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: input.user }],
    }),
  })
  const responseMs = performance.now() - started
  const raw: unknown = await response.json()
  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}`)
  }
  if (typeof raw !== 'object' || raw === null || !('content' in raw) || !Array.isArray(raw.content)) {
    throw new Error('invalid Anthropic response')
  }
  const texts: string[] = []
  for (const block of raw.content) {
    if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'text') {
      if ('text' in block && typeof block.text === 'string') {
        texts.push(block.text)
      }
    }
  }
  const joined = texts.join('\n').trim()
  const jsonStart = joined.indexOf('{')
  const jsonEnd = joined.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return { text: joined.slice(jsonStart, jsonEnd + 1), responseMs, raw }
  }
  throw new Error('no JSON in Anthropic response')
}

export function createAnthropicWebsearchDiscoveryAdapter(): DiscoveryAdapter {
  return {
    id: 'anthropic_websearch',
    displayName: 'Anthropic Claude (general-purpose LLM + web search)',
    requiredEnv: ['ANTHROPIC_API_KEY'],
    isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    poll: (sinceIso) =>
      pollLlmJsonDiscovery({
        sinceIso,
        promptFile: 'anthropic.json',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        fetchCompletion: anthropicMessages,
      }),
  }
}
