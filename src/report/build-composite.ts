import type { Database } from 'bun:sqlite'

import {
  BenchmarkResultsSchema,
  type BenchmarkResults,
  type SuiteResult,
} from '../schema/results.ts'
import { getRun } from '../store/db.ts'
import { listQaResultsForRuns, listStaticQaResults } from '../store/event-db.ts'
import { buildSummary } from './build-summary.ts'
import { attachBenchmarkMetadata } from './benchmark-metadata.ts'
import { buildFreshQaSuite } from './build-fresh-qa-suite.ts'
import { buildFreshQaStaticSuite } from './build-freshqa-static-suite.ts'
import { readFileSync } from 'node:fs'
import { publishableConfigPath } from '../lib/paths.ts'

function loadPublishable(): { providers: Set<string>; suites: Set<string> } {
  try {
    const raw = JSON.parse(readFileSync(publishableConfigPath(), 'utf8')) as {
      allowedProviderIds?: string[]
      allowedSuiteIds?: string[]
    }
    return {
      providers: new Set(raw.allowedProviderIds ?? []),
      suites: new Set(raw.allowedSuiteIds ?? []),
    }
  } catch {
    return { providers: new Set(), suites: new Set() }
  }
}

function suiteFromSummary(summary: BenchmarkResults, id: SuiteResult['id']): SuiteResult | null {
  return summary.suites.find((s) => s.id === id) ?? null
}

export function buildCompositeSummary(
  db: Database,
  input: {
    latencyRunId: string
    eventRunId: string
    region: string
    freshQaStaticRunId?: string
  }
): BenchmarkResults {
  const latencyRun = getRun(db, input.latencyRunId)
  const eventRun = getRun(db, input.eventRunId)
  if (!latencyRun) {
    throw new Error(`[publish-composite] unknown latency run ${input.latencyRunId}`)
  }
  if (!eventRun) {
    throw new Error(`[publish-composite] unknown event run ${input.eventRunId}`)
  }
  if (latencyRun.suite_id !== 'latency') {
    throw new Error(`[publish-composite] ${input.latencyRunId} is not a latency run`)
  }
  if (eventRun.suite_id !== 'event-coverage') {
    throw new Error(`[publish-composite] ${input.eventRunId} is not an event-coverage run`)
  }

  const publishable = loadPublishable()
  const latencySummary = buildSummary(db, input.latencyRunId, input.region)
  const eventSummary = buildSummary(db, input.eventRunId, input.region)

  const latencySuite = suiteFromSummary(latencySummary, 'latency')
  const eventSuite = suiteFromSummary(eventSummary, 'event-coverage')

  if (!latencySuite) {
    throw new Error(`[publish-composite] no latency suite in run ${input.latencyRunId}`)
  }
  const eventCoveragePublishable =
    publishable.suites.size === 0 || publishable.suites.has('event-coverage')
  if (!eventSuite && eventCoveragePublishable) {
    throw new Error(`[publish-composite] no event-coverage suite in run ${input.eventRunId}`)
  }

  const suites: SuiteResult[] = [latencySuite]
  if (eventSuite) {
    suites.push(eventSuite)
  }

  const qaRunIds = [input.latencyRunId, input.eventRunId]
  if (
    (publishable.suites.size === 0 || publishable.suites.has('fresh-qa')) &&
    listQaResultsForRuns(db, qaRunIds).length > 0
  ) {
    const merged = buildFreshQaSuite(db, [latencyRun, eventRun], publishable.providers)
    if (merged) {
      suites.push(merged)
    }
  }

  if (input.freshQaStaticRunId) {
    const staticRun = getRun(db, input.freshQaStaticRunId)
    if (!staticRun) {
      throw new Error(`[publish-composite] unknown freshqa-static run ${input.freshQaStaticRunId}`)
    }
    if (staticRun.suite_id !== 'freshqa-static') {
      throw new Error(`[publish-composite] ${input.freshQaStaticRunId} is not a freshqa-static run`)
    }
    if (
      (publishable.suites.size === 0 || publishable.suites.has('freshqa-static')) &&
      listStaticQaResults(db, input.freshQaStaticRunId).length > 0
    ) {
      suites.push(buildFreshQaStaticSuite(db, staticRun, publishable.providers))
    }
  }

  const harnessGitSha =
    latencyRun.harness_git_sha === eventRun.harness_git_sha
      ? latencyRun.harness_git_sha
      : `${latencyRun.harness_git_sha}+${eventRun.harness_git_sha}`

  const results = attachBenchmarkMetadata(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      harnessGitSha,
      region: input.region,
      suites,
    },
    {
      sourceRuns: {
        latency: input.latencyRunId,
        eventCoverage: input.eventRunId,
        freshQaStatic: input.freshQaStaticRunId,
      },
    }
  )

  return BenchmarkResultsSchema.parse(results)
}
