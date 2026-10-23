import { pollLlmJsonDiscovery } from './llm-json-discovery.ts'
import type { DiscoveryAdapter } from './types.ts'

async function openAiResponses(input: {
  model: string
  system: string
  user: string
}): Promise<{ text: string; responseMs: number; raw: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const started = performance.now()
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  })
  const responseMs = performance.now() - started
  const raw: unknown = await response.json()
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`)
  }
  const text = extractOpenAiText(raw)
  return { text, responseMs, raw }
}

function extractOpenAiText(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('invalid OpenAI response')
  }
  if ('output_text' in raw && typeof raw.output_text === 'string') {
    return raw.output_text
  }
  if ('output' in raw && Array.isArray(raw.output)) {
    for (const item of raw.output) {
      if (typeof item === 'object' && item !== null && 'content' in item && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'output_text' &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            return part.text
          }
        }
      }
    }
  }
  throw new Error('no text in OpenAI response')
}

export function createOpenAiWebsearchDiscoveryAdapter(): DiscoveryAdapter {
  return {
    id: 'openai_websearch',
    displayName: 'OpenAI (general-purpose LLM + web search)',
    requiredEnv: ['OPENAI_API_KEY'],
    isConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
    poll: (sinceIso) =>
      pollLlmJsonDiscovery({
        sinceIso,
        promptFile: 'openai.json',
        apiKeyEnv: 'OPENAI_API_KEY',
        fetchCompletion: openAiResponses,
      }),
  }
}
