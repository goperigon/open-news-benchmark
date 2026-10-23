import { describe, expect, test } from 'bun:test'

import { buildLatencySuite } from '../src/report/build-latency-suite.ts'
import { loadLatencyConfig } from '../src/lib/load-config.ts'
import {
  getRun,
  insertArticle,
  insertRequest,
  insertRun,
  listObservationsForRun,
  openDatabase,
  upsertObservationFound,
} from '../src/store/db.ts'

describe('latency dual windows', () => {
  test('config defines 60m latency and 2h coverage windows', () => {
    const config = loadLatencyConfig()
    expect(config.latencyWindowMs).toBe(3_600_000)
    expect(config.coverageWindowMs).toBe(7_200_000)
  })

  test('find at 90m counts for coverage but not latency, and stores provider timestamp', () => {
    const prevKey = process.env.PERIGON_API_KEY
    process.env.PERIGON_API_KEY = 'test-key'
    try {
      const db = openDatabase(':memory:')
      const started = new Date().toISOString()
      insertRun(db, {
        id: 'lat-1',
        suite_id: 'latency',
        started_at: started,
        panel_hash: 'panel',
        config_hash: 'cfg',
        harness_git_sha: 'sha',
        region: 'test',
      })
      const articleId = insertArticle(db, {
        run_id: 'lat-1',
        url: 'https://reuters.com/world/story',
        normalized_url: 'https://reuters.com/world/story',
        domain: 'reuters.com',
        title: 'Story',
        normalized_title: 'story',
        source_type: 'wire',
        language: 'en',
        country: 'US',
        publisher_published_at: null,
        first_seen_at: started,
        tracking_ends_at: new Date(Date.parse(started) + 86_400_000).toISOString(),
      })
      expect(articleId).not.toBeNull()
      insertRequest(db, {
        runId: 'lat-1',
        providerId: 'perigon',
        requestedAt: started,
        responseMs: 100,
        status: 'ok',
      })
      upsertObservationFound(db, {
        runId: 'lat-1',
        articleId: articleId as number,
        providerId: 'perigon',
        foundAt: new Date(Date.parse(started) + 5_400_000).toISOString(),
        matchMethod: 'url',
        timeToIndexMs: 5_400_000,
        providerTimestamp: new Date(Date.parse(started) + 600_000).toISOString(),
      })

      const observations = listObservationsForRun(db, 'lat-1')
      expect(observations[0]?.provider_timestamp).toBe(
        new Date(Date.parse(started) + 600_000).toISOString()
      )

      const run = getRun(db, 'lat-1')
      expect(run).not.toBeNull()
      const suite = buildLatencySuite(db, run as NonNullable<typeof run>, new Set())
      if (suite.id !== 'latency') {
        throw new Error('expected latency suite')
      }
      expect(suite.equalIndexWindowMs).toBe(3_600_000)
      expect(suite.coverageWindowMs).toBe(7_200_000)
      const perigon = suite.providers.find((p) => p.id === 'perigon')
      expect(perigon?.metrics?.foundWithinMinutes.m60).toBe(0)
      expect(perigon?.metrics?.neverFoundShare).toBe(1)
      expect(perigon?.coverageMetrics?.neverFoundShare).toBe(0)
      expect(perigon?.coverageMetrics?.medianTimeToIndexMs).toBe(5_400_000)
    } finally {
      if (prevKey === undefined) {
        delete process.env.PERIGON_API_KEY
      } else {
        process.env.PERIGON_API_KEY = prevKey
      }
    }
  })
})
