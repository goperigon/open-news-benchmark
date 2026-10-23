import type { Database } from 'bun:sqlite'

import { configuredDiscoveryAdapters } from '../discovery/registry.ts'
import { insertCyberExtraction } from '../store/cyber-db.ts'
import { openAiJson, openAiConfigured } from '../llm/openai.ts'
import { loadCyberTaskMarkdown } from '../discovery/load-task-prompt.ts'

export interface ExtractTestArticle {
  url: string
  title: string
  body: string
}

/** Common-article extraction: same text given to each participant; records JSON extractions. */
export async function runCyberExtractTest(
  db: Database,
  runId: string,
  articles: ExtractTestArticle[]
): Promise<void> {
  const task = loadCyberTaskMarkdown()
  for (const article of articles) {
    const user = `${task}\n\nExtract one incident from this article only:\nTitle: ${article.title}\nURL: ${article.url}\nBody: ${article.body.slice(0, 4000)}`
    for (const adapter of configuredDiscoveryAdapters()) {
      if (adapter.id === 'google_news_rss') {
        continue
      }
      const started = performance.now()
      if (adapter.id === 'openai_websearch' && openAiConfigured()) {
        const model = process.env.OPENAI_CYBER_MODEL?.trim() || 'gpt-4.1'
        try {
          const extracted = await openAiJson<{ incidents: unknown[] }>(model, [
            { role: 'system', content: 'Return JSON { incidents: [...] } for the article.' },
            { role: 'user', content: user },
          ], 'extract')
          insertCyberExtraction(db, {
            run_id: runId,
            participant_id: adapter.id,
            article_url: article.url,
            article_title: article.title,
            extracted_json: JSON.stringify(extracted),
            response_ms: Math.round(performance.now() - started),
          })
        } catch (error) {
          insertCyberExtraction(db, {
            run_id: runId,
            participant_id: adapter.id,
            article_url: article.url,
            article_title: article.title,
            extracted_json: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
            response_ms: Math.round(performance.now() - started),
          })
        }
      } else {
        insertCyberExtraction(db, {
          run_id: runId,
          participant_id: adapter.id,
          article_url: article.url,
          article_title: article.title,
          extracted_json: JSON.stringify({ skipped: true, reason: 'extract-test stub' }),
          response_ms: 0,
        })
      }
    }
  }
}
