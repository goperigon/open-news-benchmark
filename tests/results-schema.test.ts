import { describe, expect, test } from 'bun:test'

import { BenchmarkResultsSchema } from '../src/schema/results.ts'

describe('BenchmarkResultsSchema', () => {
  test('parses minimal latency suite payload', () => {
    const parsed = BenchmarkResultsSchema.parse({
      schemaVersion: 1,
      benchmarkProductVersion: 'v1',
      sourceRuns: { latency: 'run-1' },
      generatedAt: new Date().toISOString(),
      harnessGitSha: 'abc123',
      region: 'us-east',
      suites: [
        {
          id: 'latency',
          runId: 'run-1',
          windowStart: new Date().toISOString(),
          windowEnd: new Date().toISOString(),
          panelHash: 'panel',
          configHash: 'config',
          groundTruthPollIntervalMs: 30_000,
          providerProbeIntervalMs: 60_000,
          providers: [],
          firstFoundPairs: [],
          breakdowns: [],
        },
      ],
    })
    expect(parsed.suites[0]?.id).toBe('latency')
  })

  test('parses event-coverage suite payload', () => {
    const parsed = BenchmarkResultsSchema.parse({
      schemaVersion: 1,
      benchmarkProductVersion: 'v1',
      generatedAt: new Date().toISOString(),
      harnessGitSha: 'abc123',
      region: 'us-east',
      suites: [
        {
          id: 'event-coverage',
          runId: 'run-1',
          windowStart: new Date().toISOString(),
          windowEnd: new Date().toISOString(),
          universeHash: 'uni',
          configHash: 'config',
          anchorPollIntervalMs: 30_000,
          probeOffsetsMinutes: [5, 15],
          preAnchorWindowMs: 1_800_000,
          llmModels: {},
          providers: [],
          breakdowns: [],
        },
      ],
    })
    expect(parsed.suites[0]?.id).toBe('event-coverage')
  })
})
