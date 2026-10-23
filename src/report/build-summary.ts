import type { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

import { BenchmarkResultsSchema, type BenchmarkResults, type SuiteResult } from '../schema/results.ts'
import { getRun, listArticlesForRun } from '../store/db.ts'
import { listBenchEvents, listQaResults } from '../store/event-db.ts'
import { publishableConfigPath } from '../lib/paths.ts'
import { buildLatencySuite } from './build-latency-suite.ts'
import { buildEventCoverageSuite } from './build-event-coverage-suite.ts'
import { buildFreshQaSuite } from './build-fresh-qa-suite.ts'
import { buildFreshQaStaticSuite } from './build-freshqa-static-suite.ts'
import { buildCyberBreachSuite } from './build-cyber-suite.ts'
import { loadCyberBreachConfig } from '../lib/load-config.ts'
import { attachBenchmarkMetadata } from './benchmark-metadata.ts'

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

function filterSuites(suites: SuiteResult[], allowed: Set<string>): SuiteResult[] {
  if (allowed.size === 0) {
    return suites
  }
  return suites.filter((s) => allowed.has(s.id))
}

function maybeFreshQaSuite(
  db: Database,
  run: NonNullable<ReturnType<typeof getRun>>,
  publishable: ReturnType<typeof loadPublishable>
): SuiteResult | null {
  if (publishable.suites.size > 0 && !publishable.suites.has('fresh-qa')) {
    return null
  }
  if (listQaResults(db, run.id).length === 0) {
    return null
  }
  return buildFreshQaSuite(db, [run], publishable.providers)
}

export function buildSummary(db: Database, runId: string, region: string): BenchmarkResults {
  const run = getRun(db, runId)
  if (!run) {
    throw new Error(`[report] unknown run ${runId}`)
  }

  const publishable = loadPublishable()
  const suites: SuiteResult[] = []

  if (run.suite_id === 'latency') {
    suites.push(buildLatencySuite(db, run, publishable.providers))
    const freshQa = maybeFreshQaSuite(db, run, publishable)
    if (freshQa) {
      suites.push(freshQa)
    }
  } else if (run.suite_id === 'event-coverage') {
    suites.push(buildEventCoverageSuite(db, run, publishable.providers))
    const freshQa = maybeFreshQaSuite(db, run, publishable)
    if (freshQa) {
      suites.push(freshQa)
    }
  } else if (run.suite_id === 'freshqa-static') {
    suites.push(buildFreshQaStaticSuite(db, run, publishable.providers))
  } else if (run.suite_id === 'cyber-breach') {
    const cyberConfig = loadCyberBreachConfig()
    suites.push(buildCyberBreachSuite(db, run, cyberConfig.trackingWindowMs))
  } else {
    if (listArticlesForRun(db, runId).length > 0) {
      suites.push(buildLatencySuite(db, run, publishable.providers))
    }
    if (listBenchEvents(db, runId).length > 0) {
      suites.push(buildEventCoverageSuite(db, run, publishable.providers))
    }
    const freshQa = maybeFreshQaSuite(db, run, publishable)
    if (freshQa) {
      suites.push(freshQa)
    }
  }

  if (suites.length === 0) {
    throw new Error(`[report] no suite data for run ${runId}`)
  }

  const results = attachBenchmarkMetadata({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    harnessGitSha: run.harness_git_sha,
    region,
    suites: filterSuites(suites, publishable.suites),
  })

  return BenchmarkResultsSchema.parse(results)
}
