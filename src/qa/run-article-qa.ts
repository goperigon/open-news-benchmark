import type { Database } from 'bun:sqlite'

import type { ProviderAdapter } from '../providers/types.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import { loadFreshQaConfig } from '../lib/load-config.ts'
import { hasQaResult, insertQaResult, listQaItems } from '../store/event-db.ts'
import type { ArticleRow } from '../store/db.ts'
import { listArticlesWithoutQaItems } from '../store/db.ts'
import { writeQaItemsForArticle } from './write-questions.ts'
import { ArticleQaSampler } from './article-sampler.ts'
import { probeQuestion } from './probe-question.ts'
import { openAiConfigured } from '../llm/openai.ts'
import { sleepUntil } from '../lib/concurrency.ts'

const LOOP_INTERVAL_MS = 60_000

function searchSinceIso(anchorAt: string | null, lookbackMinutes: number): string | undefined {
  if (!anchorAt) {
    return undefined
  }
  const anchorMs = Date.parse(anchorAt)
  if (Number.isNaN(anchorMs)) {
    return undefined
  }
  return new Date(anchorMs - lookbackMinutes * 60_000).toISOString()
}

export async function runArticleQaLoop(
  db: Database,
  runId: string,
  providers: ProviderAdapter[],
  endsAt: number
): Promise<void> {
  const config = loadFreshQaConfig()
  if (!config.enabled || !config.article.enabled || !openAiConfigured()) {
    return
  }
  const sampler = new ArticleQaSampler()
  const activeProviders = providers.filter((p) => p.isConfigured() && adapterSupportsSearch(p))
  const lookbackMinutes = config.article.searchLookbackMinutes

  while (Date.now() < endsAt) {
    const cycleStart = Date.now()
    const candidates = listArticlesWithoutQaItems(db, runId)
    let article: ArticleRow | null = sampler.pick(candidates, config)
    while (article) {
      const n = await writeQaItemsForArticle(db, runId, article, config)
      if (n > 0) {
        console.log(`[fresh-qa] +${n} article questions for article:${article.id} (${article.domain})`)
        await runStalenessCheck(
          db,
          runId,
          `article:${article.id}`,
          activeProviders,
          config.topKArticles,
          lookbackMinutes
        )
      }
      article = sampler.pick(candidates, config)
    }

    await runArticleQaDueProbes(
      db,
      runId,
      activeProviders,
      config.probeDelaysMinutes,
      config.topKArticles,
      lookbackMinutes
    )
    await sleepUntil(cycleStart + LOOP_INTERVAL_MS, endsAt)
  }
}

async function runStalenessCheck(
  db: Database,
  runId: string,
  eventId: string,
  providers: ProviderAdapter[],
  topK: number,
  lookbackMinutes: number
): Promise<void> {
  const items = listQaItems(db, runId).filter((i) => i.event_id === eventId && i.stale === 0)
  for (const item of items) {
    for (const provider of providers) {
      if (hasQaResult(db, runId, item.id, provider.id, 0)) {
        continue
      }
      const searchQuery = item.query ?? item.question
      const result = await probeQuestion(provider, {
        question: item.question,
        goldAnswers: [item.gold_answer],
        searchQuery,
        sinceIso: searchSinceIso(item.anchor_at, lookbackMinutes),
        topK,
        grader: 'simpleqa',
      })
      insertQaResult(db, {
        runId,
        qaItemId: item.id,
        providerId: provider.id,
        delayMinutes: 0,
        synthesizedAnswer: result.answer,
        grade: result.grade,
      })
    }
  }
}

async function runArticleQaDueProbes(
  db: Database,
  runId: string,
  providers: ProviderAdapter[],
  delays: number[],
  topK: number,
  lookbackMinutes: number
): Promise<void> {
  const now = Date.now()
  const items = listQaItems(db, runId).filter((i) => i.source_kind === 'article' && i.stale === 0)
  for (const item of items) {
    if (!item.anchor_at) {
      continue
    }
    const anchorMs = Date.parse(item.anchor_at)
    const sinceIso = searchSinceIso(item.anchor_at, lookbackMinutes)
    for (const delay of delays) {
      if (now < anchorMs + delay * 60_000) {
        continue
      }
      const searchQuery = item.query ?? item.question
      for (const provider of providers) {
        if (hasQaResult(db, runId, item.id, provider.id, delay)) {
          continue
        }
        const result = await probeQuestion(provider, {
          question: item.question,
          goldAnswers: [item.gold_answer],
          searchQuery,
          sinceIso,
          topK,
          grader: 'simpleqa',
        })
        insertQaResult(db, {
          runId,
          qaItemId: item.id,
          providerId: provider.id,
          delayMinutes: delay,
          synthesizedAnswer: result.answer,
          grade: result.grade,
        })
      }
    }
  }
}
