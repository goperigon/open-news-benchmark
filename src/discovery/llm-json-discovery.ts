import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { normalizeFromLlmPayload } from '../cyber/claim-normalize.ts'
import { cyberBreachPromptsDir } from '../lib/paths.ts'
import { loadCyberTaskMarkdown, renderPromptTemplate } from './load-task-prompt.ts'
import type { DiscoveryPollResult } from './types.ts'

interface PromptFile {
  modelEnv: string
  defaultModel: string
  system: string
  userTemplate: string
}

function loadPromptFile(name: string): PromptFile {
  return JSON.parse(readFileSync(join(cyberBreachPromptsDir(), name), 'utf8')) as PromptFile
}

export async function pollLlmJsonDiscovery(options: {
  sinceIso: string
  promptFile: string
  apiKeyEnv: string
  fetchCompletion: (input: {
    model: string
    system: string
    user: string
  }) => Promise<{ text: string; responseMs: number; raw: unknown }>
}): Promise<DiscoveryPollResult> {
  const apiKey = process.env[options.apiKeyEnv]?.trim()
  if (!apiKey) {
    return { status: 'skipped_missing_key', incidents: [], responseMs: 0, raw: null }
  }
  const prompt = loadPromptFile(options.promptFile)
  const model = process.env[prompt.modelEnv]?.trim() || prompt.defaultModel
  const sinceIso = options.sinceIso
  const user = renderPromptTemplate(prompt.userTemplate, sinceIso, loadCyberTaskMarkdown())
  try {
    const { text, responseMs, raw } = await options.fetchCompletion({
      model,
      system: prompt.system,
      user,
    })
    const parsed: unknown = JSON.parse(text)
    const incidents = normalizeFromLlmPayload(parsed)
    return { status: 'ok', incidents, responseMs, raw }
  } catch (error) {
    return {
      status: 'skipped_error',
      incidents: [],
      responseMs: 0,
      raw: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
