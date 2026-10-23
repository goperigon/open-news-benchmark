import type { Database } from 'bun:sqlite'

import { findMatchResult, type GroundArticle } from '../matching/match.ts'
import type { ProviderAdapter, ProviderArticle } from '../providers/types.ts'
import {
  getObservation,
  insertRequest,
  listAliasesByArticleIds,
  listTrackableArticles,
  upsertObservationFound,
  type ArticleRow,
} from '../store/db.ts'
import { batchDomains } from './batch-domains.ts'

function toGroundArticle(row: ArticleRow, aliases: string[]): GroundArticle {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    domain: row.domain,
    title: row.title,
    normalizedTitle: row.normalized_title,
    canonicalAliases: aliases,
    firstSeenAt: row.first_seen_at,
  }
}

function toMatchCandidate(article: ProviderArticle) {
  return {
    url: article.url,
    title: article.title,
    sourceDomain: article.sourceDomain,
    providerTimestamp: article.providerTimestamp,
  }
}

function pendingCountByDomain(
  articles: ArticleRow[],
  db: Database,
  runId: string,
  providerId: string
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of articles) {
    const existing = getObservation(db, runId, row.id, providerId)
    if (existing?.found_at) {
      continue
    }
    counts.set(row.domain, (counts.get(row.domain) ?? 0) + 1)
  }
  return counts
}

export async function runProbeCycle(
  db: Database,
  runId: string,
  provider: ProviderAdapter,
  panelDomains: string[],
  domainBatchSize: number,
  sinceIso: string
): Promise<{ newFinds: number }> {
  let newFinds = 0
  const nowIso = new Date().toISOString()
  const articles = listTrackableArticles(db, runId, nowIso)
  if (articles.length === 0) {
    return { newFinds }
  }

  const effectiveSince = sinceIso
  const aliasMap = listAliasesByArticleIds(
    db,
    articles.map((a) => a.id)
  )
  const pendingByDomain = pendingCountByDomain(articles, db, runId, provider.id)

  const domainsNeeded = new Set(articles.map((a) => a.domain))
  const domains = panelDomains.filter((d) => domainsNeeded.has(d))
  const batches = batchDomains(
    domains,
    Math.min(domainBatchSize, provider.capabilities.maxDomainsPerQuery),
    pendingByDomain
  )

  for (const batch of batches) {
    if (batch.length === 0) {
      continue
    }
    const requestedAt = new Date().toISOString()
    try {
      const result = await provider.fetchRecent({ domains: batch, sinceIso: effectiveSince })
      insertRequest(db, {
        runId,
        providerId: provider.id,
        requestedAt,
        responseMs: Math.round(result.responseMs),
        status: 'ok',
      })

      const relevantArticles = articles.filter((a) => batch.includes(a.domain))
      for (const row of relevantArticles) {
        const existing = getObservation(db, runId, row.id, provider.id)
        if (existing?.found_at) {
          continue
        }
        const { method, candidate } = findMatchResult(
          toGroundArticle(row, aliasMap.get(row.id) ?? []),
          result.articles.map(toMatchCandidate)
        )
        if (method === 'none') {
          continue
        }
        const firstSeenMs = new Date(row.first_seen_at).getTime()
        const foundMs = Date.now()
        upsertObservationFound(db, {
          runId,
          articleId: row.id,
          providerId: provider.id,
          foundAt: new Date(foundMs).toISOString(),
          matchMethod: method,
          timeToIndexMs: foundMs - firstSeenMs,
          providerTimestamp: candidate?.providerTimestamp ?? null,
        })
        newFinds += 1
      }
    } catch (error) {
      insertRequest(db, {
        runId,
        providerId: provider.id,
        requestedAt,
        responseMs: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { newFinds }
}
