import type { Database } from 'bun:sqlite'

import { allProviderAdapters } from '../providers/registry.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import type { SuiteResult } from '../schema/results.ts'
import { loadFreshQaStaticConfig } from '../lib/load-config.ts'
import { listRunProviders, listStaticQaResults } from '../store/event-db.ts'
import type { RunRow } from '../store/db.ts'
import { aggregateStaticQa, aggregateStaticQaByFactType } from '../metrics/freshqa-static.ts'
import { graderModel, queryRewriteModel, synthModel } from '../llm/openai.ts'
import { freshQaStaticDatasetPath } from '../lib/paths.ts'
import { filterFreshQaStaticQuestions, loadFreshQaDataset } from '../qa/freshqa-dataset.ts'

export function buildFreshQaStaticSuite(db: Database, run: RunRow, publishable: Set<string>): SuiteResult {
  const config = loadFreshQaStaticConfig()
  const results = listStaticQaResults(db, run.id)
  const runProviders = listRunProviders(db, run.id)
  const statusById = new Map(runProviders.map((p) => [p.provider_id, p]))

  let factTypeByQuestion = new Map<string, string>()
  try {
    const questions = filterFreshQaStaticQuestions(
      loadFreshQaDataset(freshQaStaticDatasetPath(config.datasetFile), config.split),
      config
    )
    factTypeByQuestion = new Map(questions.map((q) => [q.id, q.factType]))
  } catch {
    // dataset file may be absent in CI; metrics skip fact-type breakdown
  }

  const providers = allProviderAdapters().filter(adapterSupportsSearch).map((adapter) => {
    const recorded = statusById.get(adapter.id)
    const status = (recorded?.status ?? 'skipped_missing_key') as
      | 'ran'
      | 'skipped_missing_key'
      | 'skipped_error'
      | 'budget_exhausted'
    const rows = results
      .filter((r) => r.provider_id === adapter.id)
      .map((r) => ({
        questionId: r.question_id,
        providerId: r.provider_id,
        grade: r.grade,
        responseMs: r.response_ms,
        error: r.error,
        factType: factTypeByQuestion.get(r.question_id),
      }))
    const overall = aggregateStaticQa(rows)
    const byFactType = aggregateStaticQaByFactType(rows, factTypeByQuestion).map(({ factType, metrics }) => ({
      factType,
      ...metrics,
    }))
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      overall,
      byFactType,
    }
  })

  return {
    id: 'freshqa-static',
    runId: run.id,
    windowStart: run.started_at,
    windowEnd: run.ended_at ?? new Date().toISOString(),
    configHash: run.config_hash,
    datasetVersion: config.datasetVersion,
    datasetSha256: config.datasetSha256 || run.panel_hash,
    split: config.split,
    lookbackDays: config.lookbackDays,
    topKArticles: config.topKArticles,
    llmModels: {
      synthesizer: synthModel(),
      grader: graderModel(),
      queryRewrite: queryRewriteModel(),
    },
    providers: providers.filter((p) => publishable.size === 0 || publishable.has(p.id)),
  }
}
