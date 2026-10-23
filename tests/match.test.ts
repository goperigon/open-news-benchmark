import { describe, expect, test } from 'bun:test'

import { findMatch, matchArticle, type GroundArticle } from '../src/matching/match.ts'

const ground: GroundArticle = {
  id: 1,
  url: 'https://reuters.com/world/us/example-story-slug-twenty-chars',
  normalizedUrl: 'https://reuters.com/world/us/example-story-slug-twenty-chars',
  domain: 'reuters.com',
  title: 'Example Story',
  normalizedTitle: 'example story',
  firstSeenAt: '2026-01-01T12:00:00.000Z',
}

describe('findMatch', () => {
  test('matches by normalized url', () => {
    expect(
      findMatch(ground, [
        {
          url: 'https://reuters.com/world/us/example-story-slug-twenty-chars?utm_campaign=abc',
          title: 'Different title',
        },
      ])
    ).toBe('url')
  })

  test('matches by canonical alias', () => {
    const withAlias: GroundArticle = {
      ...ground,
      canonicalAliases: ['https://reuters.com/world/us/canonical-path-only'],
    }
    expect(
      findMatch(withAlias, [
        {
          url: 'https://reuters.com/world/us/canonical-path-only',
          title: 'Other',
        },
      ])
    ).toBe('canonical')
  })

  test('matches by slug within domain', () => {
    expect(
      findMatch(ground, [
        {
          url: 'https://reuters.com/other/prefix/example-story-slug-twenty-chars',
          title: 'Unrelated',
        },
      ])
    ).toBe('slug')
  })

  test('matches by title within domain', () => {
    expect(
      findMatch(ground, [
        {
          url: 'https://reuters.com/world/us/other-path',
          title: 'Example Story',
        },
      ])
    ).toBe('title')
  })

  test('matches by fuzzy title when timestamps align', () => {
    const longTitle =
      'alpha beta gamma delta epsilon zeta eta theta iota kappa'
    const fuzzyGround: GroundArticle = {
      ...ground,
      url: 'https://reuters.com/world/aaa',
      normalizedUrl: 'https://reuters.com/world/aaa',
      title: longTitle,
      normalizedTitle: longTitle,
    }
    const candidateTitle = 'alpha beta gamma delta epsilon zeta eta theta iota'
    expect(
      findMatch(fuzzyGround, [
        {
          url: 'https://reuters.com/world/bbb',
          title: candidateTitle,
          providerTimestamp: '2026-01-01T14:00:00.000Z',
        },
      ])
    ).toBe('fuzzy_title')
  })

  test('rejects fuzzy title when token overlap is low', () => {
    const longTitle =
      'Example Story With Many Distinct Words For Overlap Testing Here Today'
    const fuzzyGround: GroundArticle = {
      ...ground,
      title: longTitle,
      normalizedTitle: longTitle.toLowerCase(),
    }
    expect(
      matchArticle(fuzzyGround, {
        url: 'https://reuters.com/other',
        title: 'Completely Different Headline With Unrelated Words Entirely Elsewhere',
        providerTimestamp: '2026-01-01T14:00:00.000Z',
      })
    ).toBe('none')
  })
})
