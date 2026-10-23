import { describe, expect, test } from 'bun:test'

import { buildFirstFoundMap, computeEventCoverageMetrics } from '../src/metrics/event-coverage.ts'

describe('computeEventCoverageMetrics', () => {
  const events = [
    { id: 'e1', tier: 'sp500', itemTypes: ['2.02'], anchorMs: 0 },
    { id: 'e2', tier: 'smallmid', itemTypes: ['5.02'], anchorMs: 0 },
  ]

  test('never-covered events count in coveredWithin denominator', () => {
    const metrics = computeEventCoverageMetrics(
      events,
      [
        {
          eventId: 'e1',
          tier: 'sp500',
          itemTypes: ['2.02'],
          providerId: 'perigon',
          mode: 'keyword',
          timeToCoverageMs: 4 * 60_000,
          preAnchor: false,
          entityTagged: null,
          hasSentiment: null,
          providerTimestampMs: null,
          anchorMs: 0,
        },
      ],
      'perigon',
      'keyword',
      buildFirstFoundMap(events, [])
    )
    expect(metrics.eventCount).toBe(2)
    expect(metrics.coveredWithin.m5).toBe(0.5)
  })

  test('structured readiness null when mode is keyword', () => {
    const metrics = computeEventCoverageMetrics(events, [], 'perigon', 'keyword', new Map())
    expect(metrics.entityTaggedShare).toBeNull()
  })
})

describe('buildFirstFoundMap', () => {
  test('ranks providers by time to coverage', () => {
    const map = buildFirstFoundMap([{ id: 'e1' }], [
      {
        eventId: 'e1',
        tier: null,
        itemTypes: [],
        providerId: 'a',
        mode: 'keyword',
        timeToCoverageMs: 100,
        preAnchor: false,
        entityTagged: null,
        hasSentiment: null,
        providerTimestampMs: null,
        anchorMs: 0,
      },
      {
        eventId: 'e1',
        tier: null,
        itemTypes: [],
        providerId: 'b',
        mode: 'keyword',
        timeToCoverageMs: 200,
        preAnchor: false,
        entityTagged: null,
        hasSentiment: null,
        providerTimestampMs: null,
        anchorMs: 0,
      },
    ])
    expect(map.get('e1')?.get('a')).toBe(100)
  })
})
