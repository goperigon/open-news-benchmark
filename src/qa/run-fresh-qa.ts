import type { Database } from 'bun:sqlite'

import type { EventCoverageConfig } from '../schema/event-coverage.ts'
import type { ProviderAdapter } from '../providers/types.ts'
import type { BenchEventRow } from '../store/event-db.ts'
import { hasQaResult, insertQaResult, listQaItems } from '../store/event-db.ts'
import { loadFreshQaConfig } from '../lib/load-config.ts'
import { writeQaItemsForEvent } from './write-questions.ts'
import { sinceIsoForEvent } from '../events/schedule.ts'
import { companyKeywordPhrase } from '../providers/entity-keyword.ts'
import { probeQuestion } from './probe-question.ts'
import type { ProviderBudgetTracker } from '../events/budget.ts'
import { openAiConfigured } from '../llm/openai.ts'

export async function maybeWriteQaForEvent(
  db: Database,
  runId: string,
  event: BenchEventRow
): Promise<void> {
  const config = loadFreshQaConfig()
  const n = await writeQaItemsForEvent(db, runId, event, config)
  if (n > 0) {
    console.log(`[fresh-qa] +${n} questions for ${event.id}`)
  }
}

export async function runFreshQaDue(
  db: Database,
  runId: string,
  event: BenchEventRow,
  providers: ProviderAdapter[],
  eventConfig: EventCoverageConfig,
  budgets: ProviderBudgetTracker
): Promise<void> {
  if (!openAiConfigured()) {
    return
  }
  const qaConfig = loadFreshQaConfig()
  const items = listQaItems(db, runId).filter((i) => i.event_id === event.id && i.stale === 0)
  if (items.length === 0) {
    return
  }

  const anchorMs = Date.parse(event.anchor_at)
  const now = Date.now()
  for (const delay of qaConfig.probeDelaysMinutes) {
    const dueAt = anchorMs + delay * 60_000
    if (now < dueAt) {
      continue
    }
    const sinceIso = sinceIsoForEvent(anchorMs, eventConfig.preAnchorWindowMs)

    for (const provider of providers) {
      if (!budgets.canSpend(provider)) {
        continue
      }
      for (const item of items) {
        if (hasQaResult(db, runId, item.id, provider.id, delay)) {
          continue
        }
        budgets.spend(provider)
        try {
          const searchQuery =
            item.query ??
            (event.ticker
              ? companyKeywordPhrase({
                  name: event.company_name ?? event.ticker,
                  aliases: [],
                  ticker: event.ticker,
                })
              : null)
          if (!searchQuery) {
            continue
          }
          const probeResult = await probeQuestion(provider, {
            question: item.question,
            goldAnswers: [item.gold_answer],
            searchQuery,
            sinceIso,
            topK: qaConfig.topKArticles,
            grader: 'simpleqa',
          })
          insertQaResult(db, {
            runId,
            qaItemId: item.id,
            providerId: provider.id,
            delayMinutes: delay,
            synthesizedAnswer: probeResult.answer,
            grade: probeResult.grade,
          })
        } catch (error) {
          console.warn(
            `[fresh-qa] ${provider.id} event=${event.id} delay=${delay}m:`,
            error instanceof Error ? error.message : error
          )
        }
      }
    }
  }
}
