import { describe, expect, test } from 'bun:test'

import { titleLooksLikeIncident } from '../src/cyber/incident-keywords.ts'

describe('cyber incident keywords', () => {
  test('detects breach headline', () => {
    expect(titleLooksLikeIncident('Major data breach hits Example Corp')).toBe(true)
  })

  test('rejects generic headline', () => {
    expect(titleLooksLikeIncident('City council approves budget')).toBe(false)
  })
})
