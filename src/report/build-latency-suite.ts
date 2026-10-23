import type { Database } from 'bun:sqlite'

import { allProviderAdapters } from '../providers/registry.ts'
import type { SuiteResult } from '../schema/results.ts'
import { loadLatencyConfig } from '../lib/load-config.ts'
import {
  listArticlesForRun,
  listObservationsForRun,
  listRequestsForRun,
  type RunRow,
} from '../store/db.ts'
import {
  computeLatencyMetrics,
  timeToIndexForEqualWindow,
  type ArticleObservation,
} from '../metrics/compute-latency.ts'
import { computeFirstFoundPairs } from '../metrics/first-found.ts'
import { providerIntervalMs } from '../prober/run-loop.ts'

function computeMatchMethodShares(methods: string[]): {
  url: number
  canonical: number
  slug: number
  title: number
  fuzzy_title: number
} {
  const counts = { url: 0, canonical: 0, slug: 0, title: 0, fuzzy_title: 0 }
  for (const method of methods) {
    if (method in counts) {
      counts[method as keyof typeof counts] += 1
    }
  }
  const total = methods.length
  return {
    url: counts.url / total,
    canonical: counts.canonical / total,
    slug: counts.slug / total,
    title: counts.title / total,
    fuzzy_title: counts.fuzzy_title / total,
  }
}

export function buildLatencySuite(db: Database, run: RunRow, publishable: Set<string>): SuiteResult {
  const latencyConfig = loadLatencyConfig()
  const articles = listArticlesForRun(db, run.id)
  const observations = listObservationsForRun(db, run.id)
  const requests = listRequestsForRun(db, run.id)

  const equalWindowMs = latencyConfig.latencyWindowMs
  const coverageWindowMs = latencyConfig.coverageWindowMs
  const obsByArticleProvider = new Map<string, number | null>()
  const obsCoverageByArticleProvider = new Map<string, number | null>()
  for (const obs of observations) {
    obsByArticleProvider.set(
      `${obs.article_id}:${obs.provider_id}`,
      timeToIndexForEqualWindow(obs.time_to_index_ms, equalWindowMs)
    )
    obsCoverageByArticleProvider.set(
      `${obs.article_id}:${obs.provider_id}`,
      timeToIndexForEqualWindow(obs.time_to_index_ms, coverageWindowMs)
    )
  }

  const adapters = allProviderAdapters()
  const providers = adapters.map((adapter) => {
    const configured = adapter.isConfigured()
    const providerRequests = requests.filter((r) => r.provider_id === adapter.id)
    const okRequestCount = providerRequests.filter((r) => r.status === 'ok').length
    let status: 'ran' | 'skipped_missing_key' | 'skipped_error' = configured
      ? 'ran'
      : 'skipped_missing_key'
    if (configured && okRequestCount === 0 && providerRequests.length > 0) {
      status = 'skipped_error'
    }
    if (!configured || status === 'skipped_error') {
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        status,
        declaredTier: adapter.declaredTier(),
        timingResolutionMs: providerIntervalMs(latencyConfig, adapter),
      }
    }
    const perProviderArticles: ArticleObservation[] = articles.map((a) => ({
      articleId: a.id,
      sourceType: a.source_type,
      language: a.language,
      timeToIndexMs: obsByArticleProvider.get(`${a.id}:${adapter.id}`) ?? null,
    }))
    const perProviderCoverageArticles: ArticleObservation[] = articles.map((a) => ({
      articleId: a.id,
      sourceType: a.source_type,
      language: a.language,
      timeToIndexMs: obsCoverageByArticleProvider.get(`${a.id}:${adapter.id}`) ?? null,
    }))
    const responseMs = providerRequests.filter((r) => r.status === 'ok').map((r) => r.response_ms)
    const providerObs = observations.filter(
      (o) =>
        o.provider_id === adapter.id &&
        o.found_at &&
        o.match_method &&
        timeToIndexForEqualWindow(o.time_to_index_ms, equalWindowMs) !== null
    )
    const matchMethodShares =
      providerObs.length > 0
        ? computeMatchMethodShares(providerObs.map((o) => o.match_method as string))
        : undefined
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status: 'ran' as const,
      declaredTier: adapter.declaredTier(),
      timingResolutionMs: providerIntervalMs(latencyConfig, adapter),
      metrics: {
        ...computeLatencyMetrics(perProviderArticles, responseMs),
        ...(matchMethodShares ? { matchMethodShares } : {}),
      },
      coverageMetrics: computeLatencyMetrics(perProviderCoverageArticles, responseMs),
    }
  })

  const ranProviders = providers.filter((p) => p.status === 'ran' && p.metrics)
  const firstFoundPairs = []
  for (let i = 0; i < ranProviders.length; i++) {
    for (let j = i + 1; j < ranProviders.length; j++) {
      const a = ranProviders[i]
      const b = ranProviders[j]
      if (!a || !b) {
        continue
      }
      const rows = articles.map((article) => ({
        articleId: article.id,
        findings: ranProviders
          .map((p) => {
            const t = obsByArticleProvider.get(`${article.id}:${p.id}`)
            return t === null || t === undefined ? null : { providerId: p.id, timeToIndexMs: t }
          })
          .filter((f): f is { providerId: string; timeToIndexMs: number } => f !== null),
      }))
      firstFoundPairs.push(computeFirstFoundPairs(a.id, b.id, rows))
    }
  }

  const breakdowns = []
  for (const dimension of ['sourceType', 'language'] as const) {
    const values = new Set(
      articles.map((a) => (dimension === 'sourceType' ? a.source_type : a.language))
    )
    for (const value of values) {
      for (const provider of ranProviders) {
        if (!provider.metrics) {
          continue
        }
        const subset = articles.filter((a) =>
          dimension === 'sourceType' ? a.source_type === value : a.language === value
        )
        const subsetObs: ArticleObservation[] = subset.map((a) => ({
          articleId: a.id,
          sourceType: a.source_type,
          language: a.language,
          timeToIndexMs: obsByArticleProvider.get(`${a.id}:${provider.id}`) ?? null,
        }))
        const responseMs = requests
          .filter((r) => r.provider_id === provider.id)
          .map((r) => r.response_ms)
        breakdowns.push({
          dimension,
          value: `${provider.id}:${value}`,
          metrics: computeLatencyMetrics(subsetObs, responseMs),
        })
      }
    }
  }

  return {
    id: 'latency',
    runId: run.id,
    windowStart: run.started_at,
    windowEnd: run.ended_at ?? new Date().toISOString(),
    panelHash: run.panel_hash,
    configHash: run.config_hash,
    groundTruthPollIntervalMs: latencyConfig.groundTruthPollIntervalMs,
    providerProbeIntervalMs: latencyConfig.providerProbeIntervalMs,
    equalIndexWindowMs: equalWindowMs,
    coverageWindowMs,
    providers: providers.filter((p) => publishable.size === 0 || publishable.has(p.id)),
    firstFoundPairs,
    breakdowns,
  }
}
