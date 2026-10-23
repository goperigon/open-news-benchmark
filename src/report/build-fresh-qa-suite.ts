import type { Database } from 'bun:sqlite'

import { allProviderAdapters } from '../providers/registry.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import type { SuiteResult } from '../schema/results.ts'
import { loadFreshQaConfig } from '../lib/load-config.ts'
import {
  listRunProviders,
  listQaItemsForRuns,
  listQaResultsForRuns,
} from '../store/event-db.ts'
import type { RunRow } from '../store/db.ts'
import { computeFreshQaMetrics } from '../metrics/fresh-qa.ts'
import { graderModel, qaWriterModel, queryRewriteModel, synthModel } from '../llm/openai.ts'

function windowBounds(runs: RunRow[]): { start: string; end: string } {
  const starts = runs.map((r) => r.started_at).sort()
  const ends = runs.map((r) => r.ended_at ?? r.started_at).sort()
  return {
    start: starts[0] ?? new Date().toISOString(),
    end: ends[ends.length - 1] ?? new Date().toISOString(),
  }
}

function breakdownByDimension(
  rows: Array<{ delayMinutes: number; grade: string; dimValue: string }>,
  dimension: 'sourceKind' | 'sourceType'
) {
  const values = [...new Set(rows.map((r) => r.dimValue))]
  return values.map((value) => {
    const subset = rows.filter((r) => r.dimValue === value)
    return {
      dimension,
      value,
      byDelay: computeFreshQaMetrics(
        subset.map((r) => ({ delayMinutes: r.delayMinutes, grade: r.grade }))
      ),
    }
  })
}

export function buildFreshQaSuite(
  db: Database,
  runs: RunRow[],
  publishable: Set<string>
): SuiteResult | null {
  if (runs.length === 0) {
    return null
  }
  const config = loadFreshQaConfig()
  const runIds = runs.map((r) => r.id)
  const items = listQaItemsForRuns(db, runIds).filter((i) => i.stale === 0)
  const itemById = new Map(items.map((i) => [i.id, i]))
  const results = listQaResultsForRuns(db, runIds).filter((r) => itemById.has(r.qa_item_id))

  if (results.length === 0) {
    return null
  }

  const statusById = new Map<string, string>()
  for (const run of runs) {
    for (const p of listRunProviders(db, run.id)) {
      statusById.set(p.provider_id, p.status)
    }
  }

  const enriched = results.map((r) => {
    const item = itemById.get(r.qa_item_id)
    return {
      providerId: r.provider_id,
      delayMinutes: r.delay_minutes,
      grade: r.grade,
      sourceKind: item?.source_kind ?? 'filing',
      sourceType: item?.source_type ?? 'unknown',
    }
  })

  const providers = allProviderAdapters().filter(adapterSupportsSearch).map((adapter) => {
    const providerRows = enriched.filter((r) => r.providerId === adapter.id)
    const status = (statusById.get(adapter.id) ??
      (providerRows.length > 0 ? 'ran' : 'skipped_missing_key')) as
      | 'ran'
      | 'skipped_missing_key'
      | 'skipped_error'
      | 'budget_exhausted'
    const rows = providerRows.map((r) => ({ delayMinutes: r.delayMinutes, grade: r.grade }))
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      byDelay: computeFreshQaMetrics(rows),
    }
  })

  const { start, end } = windowBounds(runs)
  const primary = runs[0]!

  const breakdownRows = enriched.map((r) => ({
    delayMinutes: r.delayMinutes,
    grade: r.grade,
    sourceKind: r.sourceKind,
    sourceType: r.sourceType,
  }))

  return {
    id: 'fresh-qa',
    runId: primary.id,
    sourceRunIds: runIds,
    windowStart: start,
    windowEnd: end,
    configHash: primary.config_hash,
    probeDelaysMinutes: [...config.probeDelaysMinutes],
    llmModels: {
      qaWriter: qaWriterModel(),
      synthesizer: synthModel(),
      grader: graderModel(),
      queryRewrite: queryRewriteModel(),
    },
    providers: providers.filter((p) => publishable.size === 0 || publishable.has(p.id)),
    breakdowns: [
      ...breakdownByDimension(
        breakdownRows.map((r) => ({ ...r, dimValue: r.sourceKind })),
        'sourceKind'
      ),
      ...breakdownByDimension(
        breakdownRows.map((r) => ({ ...r, dimValue: r.sourceType })),
        'sourceType'
      ),
    ],
  }
}
