import type { Database } from 'bun:sqlite'

import type { EventCoverageConfig } from '../schema/event-coverage.ts'
import type { ProviderAdapter, ProviderArticle, EntityQuery } from '../providers/types.ts'
import type { UniverseCompany } from '../schema/universe.ts'
import {
  getRelevanceCache,
  insertEventObservation,
  insertEventProbe,
  setRelevanceCache,
  type BenchEventRow,
} from '../store/event-db.ts'
import {
  judgeRelevance,
  keywordPrefilterRelevant,
  relevanceCacheKey,
  shouldUseRelevanceJudge,
} from './relevance.ts'
import { sinceIsoForEvent, timeToCoverageMs } from './schedule.ts'
export interface ProbeContext {
  runId: string
  db: Database
  config: EventCoverageConfig
  companyByTicker: Map<string, UniverseCompany>
}

function companyForEvent(event: BenchEventRow, ctx: ProbeContext): UniverseCompany | null {
  if (!event.ticker) {
    return null
  }
  return ctx.companyByTicker.get(event.ticker) ?? null
}

function entityQuery(
  event: BenchEventRow,
  company: UniverseCompany | null,
  sinceIso: string,
  mode: 'keyword' | 'structured'
): EntityQuery | null {
  const itemTypes = JSON.parse(event.item_types) as string[]
  if (company) {
    return {
      company: {
        name: company.name,
        aliases: company.aliases,
        ticker: company.ticker,
      },
      sinceIso,
      mode,
      itemTypes,
    }
  }
  if (mode === 'structured') {
    return null
  }
  const probeTerms = event.probe_terms ? (JSON.parse(event.probe_terms) as string[]) : []
  const scheduledName = event.scheduled_name ?? 'macro event'
  return {
    company: { name: scheduledName, aliases: probeTerms, ticker: 'MACRO' },
    sinceIso,
    mode: 'keyword',
    itemTypes: itemTypes.includes('macro') ? ['macro', ...itemTypes] : itemTypes,
  }
}

async function confirmRelevant(
  db: Database,
  event: BenchEventRow,
  article: ProviderArticle,
  company: UniverseCompany | null,
  relevanceJudgeEnabled: boolean
): Promise<boolean> {
  const cacheKey = relevanceCacheKey(event.id, article.url)
  const cached = getRelevanceCache(db, cacheKey)
  if (cached) {
    return cached.relevant === 1
  }
  if (!shouldUseRelevanceJudge(relevanceJudgeEnabled)) {
    return true
  }
  const itemTypes = JSON.parse(event.item_types) as string[]
  const verdict = await judgeRelevance({
    companyName: company?.name ?? event.scheduled_name ?? 'Event',
    ticker: company?.ticker ?? 'N/A',
    itemTypes,
    article,
  })
  setRelevanceCache(db, cacheKey, verdict.relevant, verdict.reason)
  return verdict.relevant
}

export async function probeEventOffset(
  ctx: ProbeContext,
  event: BenchEventRow,
  provider: ProviderAdapter,
  offsetMinutes: number,
  mode: 'keyword' | 'structured'
): Promise<void> {
  if (mode === 'structured' && provider.capabilities.structuredCompanyFilter === null) {
    return
  }

  const anchorMs = Date.parse(event.anchor_at)
  const company = companyForEvent(event, ctx)
  const sinceIso = sinceIsoForEvent(anchorMs, ctx.config.preAnchorWindowMs)
  const query = entityQuery(event, company, sinceIso, mode)
  if (!query) {
    return
  }

  if (mode === 'keyword' && !company && event.scheduled_name) {
    const terms = event.probe_terms ? (JSON.parse(event.probe_terms) as string[]) : []
    query.company = {
      name: event.scheduled_name,
      aliases: terms,
      ticker: 'MACRO',
    }
  }

  const requestedAt = new Date().toISOString()
  try {
    const result = await provider.searchEntity(query)
    insertEventProbe(ctx.db, {
      runId: ctx.runId,
      eventId: event.id,
      providerId: provider.id,
      offsetMinutes,
      mode,
      requestedAt,
      responseMs: Math.round(result.responseMs),
      status: 'ok',
    })

    const itemTypes = JSON.parse(event.item_types) as string[]
    const candidates = result.articles.filter((a) =>
      keywordPrefilterRelevant(
        a,
        query.company,
        itemTypes.includes('macro') ? ['macro', ...itemTypes] : itemTypes
      )
    )

    const maxJudge = ctx.config.relevanceJudgeMaxCandidates
    for (const article of candidates.slice(0, maxJudge)) {
      const relevant = await confirmRelevant(
        ctx.db,
        event,
        article,
        company,
        ctx.config.relevanceJudgeEnabled
      )
      if (!relevant) {
        continue
      }
      const foundMs = Date.now()
      const timing = timeToCoverageMs(anchorMs, foundMs, ctx.config.preAnchorWindowMs)
      insertEventObservation(ctx.db, {
        runId: ctx.runId,
        eventId: event.id,
        providerId: provider.id,
        mode,
        url: article.url,
        title: article.title,
        foundAt: new Date(foundMs).toISOString(),
        offsetMinutes,
        timeToCoverageMs: timing.ms,
        preAnchor: timing.preAnchor,
        entityTagged: mode === 'structured' ? (article.entityTagged ?? null) : null,
        hasSentiment: article.hasSentiment ?? null,
        providerTimestamp: article.providerTimestamp ?? null,
        matchMethod: mode === 'structured' ? 'structured' : 'keyword',
      })
      break
    }
  } catch (error) {
    insertEventProbe(ctx.db, {
      runId: ctx.runId,
      eventId: event.id,
      providerId: provider.id,
      offsetMinutes,
      mode,
      requestedAt,
      responseMs: 0,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
