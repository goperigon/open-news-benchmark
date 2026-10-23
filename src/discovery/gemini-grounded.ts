import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { normalizeFromLlmPayload } from '../cyber/claim-normalize.ts'
import { cyberBreachPromptsDir } from '../lib/paths.ts'
import { loadCyberTaskMarkdown, renderPromptTemplate } from './load-task-prompt.ts'
import type { DiscoveryAdapter, DiscoveryPollResult } from './types.ts'

export function createGeminiGroundedDiscoveryAdapter(): DiscoveryAdapter {
  return {
    id: 'gemini_grounded',
    displayName: 'Google Gemini (general-purpose LLM + search grounding)',
    requiredEnv: ['GEMINI_API_KEY'],
    isConfigured: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
    async poll(sinceIso: string): Promise<DiscoveryPollResult> {
      const apiKey = process.env.GEMINI_API_KEY?.trim()
      if (!apiKey) {
        return { status: 'skipped_missing_key', incidents: [], responseMs: 0, raw: null }
      }
      const prompt = JSON.parse(
        readFileSync(join(cyberBreachPromptsDir(), 'gemini.json'), 'utf8')
      ) as {
        modelEnv: string
        defaultModel: string
        system: string
        userTemplate: string
      }
      const model = process.env[prompt.modelEnv]?.trim() || prompt.defaultModel
      const user = renderPromptTemplate(prompt.userTemplate, sinceIso, loadCyberTaskMarkdown())
      const started = performance.now()
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: prompt.system }] },
            tools: [{ google_search: {} }],
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }),
        })
        const responseMs = performance.now() - started
        const raw: unknown = await response.json()
        if (!response.ok) {
          throw new Error(`Gemini HTTP ${response.status}`)
        }
        const text = extractGeminiText(raw)
        const incidents = normalizeFromLlmPayload(JSON.parse(text))
        return { status: 'ok', incidents, responseMs, raw }
      } catch (error) {
        return {
          status: 'skipped_error',
          incidents: [],
          responseMs: performance.now() - started,
          raw: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

function extractGeminiText(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('invalid Gemini response')
  }
  const candidates = 'candidates' in raw && Array.isArray(raw.candidates) ? raw.candidates : []
  const first = candidates[0]
  if (typeof first !== 'object' || first === null || !('content' in first)) {
    throw new Error('no Gemini candidate')
  }
  const content = first.content
  if (typeof content !== 'object' || content === null || !('parts' in content)) {
    throw new Error('no Gemini content')
  }
  const parts = content.parts
  if (!Array.isArray(parts)) {
    throw new Error('no Gemini parts')
  }
  for (const part of parts) {
    if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
      return part.text
    }
  }
  throw new Error('no Gemini text')
}
