import { describe, expect, test } from 'bun:test'

import { buildCompositeSummary } from '../src/report/build-composite.ts'
import { openDatabase, insertRun } from '../src/store/db.ts'
import { deriveBenchmarkProductVersion } from '../src/report/benchmark-metadata.ts'

describe('buildCompositeSummary', () => {
  test('merges latency and event suites with sourceRuns', () => {
    const db = openDatabase(':memory:')
    const started = new Date().toISOString()
    insertRun(db, {
      id: 'lat-1',
      suite_id: 'latency',
      started_at: started,
      panel_hash: 'panel',
      config_hash: 'cfg-l',
      harness_git_sha: 'sha1',
      region: 'test',
    })
    insertRun(db, {
      id: 'evt-1',
      suite_id: 'event-coverage',
      started_at: started,
      panel_hash: 'uni',
      config_hash: 'cfg-e',
      harness_git_sha: 'sha1',
      region: 'test',
    })

    const summary = buildCompositeSummary(db, {
      latencyRunId: 'lat-1',
      eventRunId: 'evt-1',
      region: 'test',
    })

    expect(summary.sourceRuns?.latency).toBe('lat-1')
    expect(summary.sourceRuns?.eventCoverage).toBe('evt-1')
    expect(summary.suites.map((s) => s.id)).toEqual(['latency'])
    expect(summary.benchmarkProductVersion).toBe('v1')
    expect(summary).not.toHaveProperty('featureFlags')
  })
})

describe('deriveBenchmarkProductVersion', () => {
  test('v2 when any LLM feature enabled', () => {
    expect(
      deriveBenchmarkProductVersion({ freshQa: false, freshQaStatic: false, relevanceJudge: true })
    ).toBe('v2')
    expect(
      deriveBenchmarkProductVersion({ freshQa: true, freshQaStatic: false, relevanceJudge: false })
    ).toBe('v2')
    expect(
      deriveBenchmarkProductVersion({ freshQa: false, freshQaStatic: true, relevanceJudge: false })
    ).toBe('v2')
    expect(
      deriveBenchmarkProductVersion({ freshQa: false, freshQaStatic: false, relevanceJudge: false })
    ).toBe('v1')
  })
})
