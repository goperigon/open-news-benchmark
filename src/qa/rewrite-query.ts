import type { Database } from 'bun:sqlite'

import { openAiJson, queryRewriteModel } from '../llm/openai.ts'
import { sha256Hex } from '../lib/hash.ts'
import { getCachedQuery, setCachedQuery } from '../store/event-db.ts'

export async function rewriteQuery(db: Database, question: string): Promise<string> {
  const model = queryRewriteModel()
  const cacheKey = await sha256Hex(`${model}\0${question}`)
  const cached = getCachedQuery(db, cacheKey)
  if (cached) {
    return cached
  }
  const response = await openAiJson<{ query: string }>(
    model,
    [
      {
        role: 'system',
        content:
          'Rewrite the user question into a short keyword search query suitable for news APIs (names, places, events). No full sentences. Return JSON {"query": string}.',
      },
      { role: 'user', content: question },
    ],
    'query-rewrite'
  )
  const query = (response.query ?? question).trim()
  setCachedQuery(db, cacheKey, question, model, query)
  return query
}
