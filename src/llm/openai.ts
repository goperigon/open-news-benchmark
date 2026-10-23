import { envPresent } from '../providers/types.ts'

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function openAiConfigured(): boolean {
  return envPresent(['OPENAI_API_KEY'])
}

export function qaWriterModel(): string {
  return process.env.OPENAI_QA_WRITER_MODEL ?? 'gpt-4.1-nano'
}

export function synthModel(): string {
  return process.env.OPENAI_SYNTH_MODEL ?? 'gpt-4.1-nano'
}

export function graderModel(): string {
  return process.env.OPENAI_GRADER_MODEL ?? 'gpt-4.1-mini'
}

export function queryRewriteModel(): string {
  return process.env.OPENAI_QUERY_MODEL ?? synthModel()
}

export async function openAiJson<T>(
  model: string,
  messages: OpenAiChatMessage[],
  schemaHint: string
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('[openai] missing OPENAI_API_KEY')
  }
  const started = performance.now()
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  })
  const elapsed = performance.now() - started
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`[openai] HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number }
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error(`[openai] empty response (${schemaHint})`)
  }
  if (payload.usage?.total_tokens) {
    console.log(`[openai] model=${model} tokens=${payload.usage.total_tokens} ms=${Math.round(elapsed)}`)
  }
  return JSON.parse(content) as T
}
