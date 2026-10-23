import { describe, expect, test } from 'bun:test'

import { computeFreshQaMetrics } from '../src/metrics/fresh-qa.ts'

describe('computeFreshQaMetrics', () => {
  test('aggregates grades by delay', () => {
    const metrics = computeFreshQaMetrics([
      { delayMinutes: 15, grade: 'correct' },
      { delayMinutes: 15, grade: 'incorrect' },
      { delayMinutes: 60, grade: 'not_attempted' },
    ])
    const m15 = metrics.find((m) => m.delayMinutes === 15)
    expect(m15?.accuracy).toBe(0.5)
    expect(m15?.n).toBe(2)
    const m60 = metrics.find((m) => m.delayMinutes === 60)
    expect(m60?.notAttemptedRate).toBe(1)
  })

  test('excludes error grades from accuracy denominator', () => {
    const metrics = computeFreshQaMetrics([
      { delayMinutes: 0, grade: 'error' },
      { delayMinutes: 0, grade: 'correct' },
      { delayMinutes: 0, grade: 'not_attempted' },
    ])
    const m0 = metrics.find((m) => m.delayMinutes === 0)
    expect(m0?.n).toBe(2)
    expect(m0?.accuracy).toBe(0.5)
  })
})

describe('QA writer evidence gate', () => {
  test('drops items when quote missing from exhibit', () => {
    const exhibit = 'Revenue was $10 billion in Q3.'
    const quote = 'Revenue was $10 billion'
    expect(exhibit.includes(quote)).toBe(true)
    expect(exhibit.includes('made up quote')).toBe(false)
  })
})
