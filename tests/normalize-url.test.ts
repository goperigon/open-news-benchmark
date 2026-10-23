import { describe, expect, test } from 'bun:test'

import { normalizeUrl } from '../src/matching/normalize-url.ts'

describe('normalizeUrl', () => {
  test('forces https, strips www and tracking params', () => {
    expect(normalizeUrl('http://WWW.Example.com/path/?utm_source=x&a=1')).toBe(
      'https://example.com/path?a=1'
    )
  })

  test('strips amp host prefix and /amp path suffix', () => {
    expect(normalizeUrl('https://amp.reuters.com/world/story/amp?outputType=amp')).toBe(
      'https://reuters.com/world/story'
    )
  })

  test('strips index.html and ref param', () => {
    expect(normalizeUrl('https://www.news.com/foo/index.html?ref=abc')).toBe(
      'https://news.com/foo'
    )
  })

  test('returns null for invalid', () => {
    expect(normalizeUrl('not-a-url')).toBeNull()
  })
})
