import { describe, expect, test } from 'bun:test'

import { keywordPrefilterRelevant, relevanceCacheKey } from '../src/events/relevance.ts'

describe('keywordPrefilterRelevant', () => {
  test('requires company mention and earnings keyword for 2.02', () => {
    const company = { name: 'Acme Corp', aliases: ['Acme'], ticker: 'ACME' }
    expect(
      keywordPrefilterRelevant(
        { url: 'https://x.com/a', title: 'Acme Corp reports Q3 earnings beat' },
        company,
        ['2.02']
      )
    ).toBe(true)
    expect(
      keywordPrefilterRelevant(
        { url: 'https://x.com/b', title: 'Unrelated market wrap' },
        company,
        ['2.02']
      )
    ).toBe(false)
  })
})

describe('relevanceCacheKey', () => {
  test('combines event id and url', () => {
    expect(relevanceCacheKey('edgar:1', 'https://a.com')).toBe('edgar:1|https://a.com')
  })
})
