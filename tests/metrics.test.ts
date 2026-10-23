import { describe, expect, test } from 'bun:test'

import {
  computeLatencyMetrics,
  timeToIndexForEqualWindow,
} from '../src/metrics/compute-latency.ts'
import { computeFirstFoundPairs } from '../src/metrics/first-found.ts'

describe('timeToIndexForEqualWindow', () => {
  test('treats finds after the window as not found', () => {
    expect(timeToIndexForEqualWindow(3_600_000, 3_600_000)).toBe(3_600_000)
    expect(timeToIndexForEqualWindow(3_600_001, 3_600_000)).toBeNull()
    expect(timeToIndexForEqualWindow(null, 3_600_000)).toBeNull()
  })
})

describe('computeLatencyMetrics', () => {
  test('computes found within shares', () => {
    const metrics = computeLatencyMetrics(
      [
        { articleId: 1, sourceType: 'wire', language: 'en', timeToIndexMs: 120_000 },
        { articleId: 2, sourceType: 'wire', language: 'en', timeToIndexMs: null },
      ],
      [200]
    )
    expect(metrics.articleCount).toBe(2)
    expect(metrics.foundWithinMinutes.m5).toBe(0.5)
    expect(metrics.neverFoundShare).toBe(0.5)
  })
})

describe('computeFirstFoundPairs', () => {
  test('computes first-found share', () => {
    const result = computeFirstFoundPairs('a', 'b', [
      {
        articleId: 1,
        findings: [
          { providerId: 'a', timeToIndexMs: 100 },
          { providerId: 'b', timeToIndexMs: 500 },
        ],
      },
      {
        articleId: 2,
        findings: [
          { providerId: 'a', timeToIndexMs: 800 },
          { providerId: 'b', timeToIndexMs: 200 },
        ],
      },
    ])
    expect(result.aFirstShare).toBe(0.5)
  })
})
