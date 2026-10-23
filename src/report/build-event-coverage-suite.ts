import type { Database } from 'bun:sqlite'

import { allProviderAdapters } from '../providers/registry.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import type { SuiteResult } from '../schema/results.ts'
import { loadEventCoverageConfig, loadFreshQaConfig } from '../lib/load-config.ts'
import { listRunProviders, listBenchEvents, listEventObservations } from '../store/event-db.ts'
import type { RunRow } from '../store/db.ts'
import {
  buildFirstFoundMap,
  computeEventCoverageMetrics,
  type EventCoverageInput,
} from '../metrics/event-coverage.ts'
import { graderModel, qaWriterModel, synthModel } from '../llm/openai.ts'

export function buildEventCoverageSuite(
  db: Database,
  run: RunRow,
  publishable: Set<string>
): SuiteResult {
  const config = loadEventCoverageConfig()
  const events = listBenchEvents(db, run.id).map((e) => ({
    id: e.id,
    tier: e.tier,
    itemTypes: JSON.parse(e.item_types) as string[],
    anchorMs: Date.parse(e.anchor_at),
  }))
  const rawObs = listEventObservations(db, run.id)
  const observations: EventCoverageInput[] = rawObs.map((o) => ({
    eventId: o.event_id,
    tier: events.find((e) => e.id === o.event_id)?.tier ?? null,
    itemTypes: events.find((e) => e.id === o.event_id)?.itemTypes ?? [],
    providerId: o.provider_id,
    mode: o.mode,
    timeToCoverageMs: o.time_to_coverage_ms,
    preAnchor: o.pre_anchor === 1,
    entityTagged: o.entity_tagged === null ? null : o.entity_tagged === 1,
    hasSentiment: o.has_sentiment === null ? null : o.has_sentiment === 1,
    providerTimestampMs: o.provider_timestamp ? Date.parse(o.provider_timestamp) : null,
    anchorMs: events.find((e) => e.id === o.event_id)?.anchorMs ?? 0,
  }))

  const firstFound = buildFirstFoundMap(events, observations)
  const runProviders = listRunProviders(db, run.id)
  const statusById = new Map(runProviders.map((p) => [p.provider_id, p]))

  const adapters = allProviderAdapters().filter(adapterSupportsSearch)
  const providers = adapters.map((adapter) => {
    const recorded = statusById.get(adapter.id)
    const status = (recorded?.status ?? 'skipped_missing_key') as
      | 'ran'
      | 'skipped_missing_key'
      | 'skipped_error'
      | 'budget_exhausted'
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      declaredTier: recorded?.declared_tier ?? adapter.declaredTier(),
      timingResolutionMs: recorded?.timing_resolution_ms ?? adapter.capabilities.minPollIntervalMs,
      keywordMetrics: computeEventCoverageMetrics(
        events,
        observations,
        adapter.id,
        'keyword',
        firstFound
      ),
      structuredMetrics:
        adapter.capabilities.structuredCompanyFilter === null
          ? undefined
          : computeEventCoverageMetrics(events, observations, adapter.id, 'structured', firstFound),
    }
  })

  const breakdowns = []
  for (const dimension of ['tier', 'itemType'] as const) {
    const values = new Set<string>()
    for (const event of events) {
      if (dimension === 'tier' && event.tier) {
        values.add(event.tier)
      }
      for (const item of event.itemTypes) {
        if (dimension === 'itemType') {
          values.add(item)
        }
      }
    }
    for (const value of values) {
      const subsetEvents = events.filter((e) =>
        dimension === 'tier' ? e.tier === value : e.itemTypes.includes(value)
      )
      for (const adapter of adapters) {
        const subsetObs = observations.filter((o) => {
          const ev = subsetEvents.find((e) => e.id === o.eventId)
          return ev !== undefined && o.providerId === adapter.id
        })
        breakdowns.push({
          dimension,
          value: `${adapter.id}:${value}`,
          metrics: computeEventCoverageMetrics(
            subsetEvents,
            subsetObs,
            adapter.id,
            'keyword',
            buildFirstFoundMap(subsetEvents, subsetObs)
          ),
        })
      }
    }
  }

  return {
    id: 'event-coverage',
    runId: run.id,
    windowStart: run.started_at,
    windowEnd: run.ended_at ?? new Date().toISOString(),
    universeHash: run.panel_hash,
    configHash: run.config_hash,
    anchorPollIntervalMs: config.anchorPollIntervalMs,
    probeOffsetsMinutes: [...config.probeOffsetsMinutes],
    preAnchorWindowMs: config.preAnchorWindowMs,
    llmModels: {
      ...(config.relevanceJudgeEnabled ? { grader: graderModel() } : {}),
      ...(loadFreshQaConfig().enabled
        ? { qaWriter: qaWriterModel(), synthesizer: synthModel(), grader: graderModel() }
        : {}),
    },
    providers: providers.filter((p) => publishable.size === 0 || publishable.has(p.id)),
    breakdowns,
  }
}
