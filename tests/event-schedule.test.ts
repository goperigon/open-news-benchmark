import { describe, expect, test } from 'bun:test'

import { probeOffsetsForEvent, timeToCoverageMs } from '../src/events/schedule.ts'
import { ProviderBudgetTracker } from '../src/events/budget.ts'
import type { ProviderAdapter } from '../src/providers/types.ts'

describe('probeOffsetsForEvent', () => {
  test('returns offsets whose probe time has passed', () => {
    const anchor = Date.parse('2026-10-12T12:00:00Z')
    const now = anchor + 20 * 60_000
    const due = probeOffsetsForEvent(anchor, [1, 5, 15, 60], now, now + 3_600_000)
    expect(due).toEqual([1, 5, 15])
  })
})

describe('timeToCoverageMs', () => {
  test('clips pre-anchor matches to zero with flag', () => {
    const anchor = Date.parse('2026-10-12T12:00:00Z')
    const found = anchor - 5 * 60_000
    const result = timeToCoverageMs(anchor, found, 30 * 60_000)
    expect(result.preAnchor).toBe(true)
    expect(result.ms).toBe(0)
  })

  test('measures from anchor when found after', () => {
    const anchor = Date.parse('2026-10-12T12:00:00Z')
    const found = anchor + 10 * 60_000
    const result = timeToCoverageMs(anchor, found, 30 * 60_000)
    expect(result.preAnchor).toBe(false)
    expect(result.ms).toBe(10 * 60_000)
  })
})

describe('ProviderBudgetTracker', () => {
  const stubAdapter = { id: 'stub' } as ProviderAdapter

  test('marks provider exhausted at daily budget', () => {
    const prev = process.env.STUB_DAILY_BUDGET
    process.env.STUB_DAILY_BUDGET = '2'
    try {
      const tracker = new ProviderBudgetTracker()
      expect(tracker.canSpend(stubAdapter)).toBe(true)
      tracker.spend(stubAdapter)
      tracker.spend(stubAdapter)
      expect(tracker.canSpend(stubAdapter)).toBe(false)
      expect(tracker.isExhausted('stub')).toBe(true)
    } finally {
      if (prev === undefined) {
        delete process.env.STUB_DAILY_BUDGET
      } else {
        process.env.STUB_DAILY_BUDGET = prev
      }
    }
  })
})
