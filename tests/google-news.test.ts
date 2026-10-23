import { describe, expect, test } from 'bun:test'

import { parseRssOrAtom } from '../src/ground-truth/rss.ts'
import { findMatch, type GroundArticle } from '../src/matching/match.ts'
import { stripPublisherSuffix, toProviderArticle } from '../src/providers/google-news-rss.ts'

const GOOGLE_NEWS_ITEM = `<rss><channel><item>
  <title>Fed holds rates steady &amp; signals patience - Reuters</title>
  <link>https://news.google.com/rss/articles/CBMiXkFVX3lxTE5abc?oc=5</link>
  <pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate>
  <source url="https://www.reuters.com">Reuters</source>
</item></channel></rss>`

const ground: GroundArticle = {
  id: 1,
  url: 'https://www.reuters.com/markets/us/fed-holds-rates-2026-10-05/',
  normalizedUrl: 'https://reuters.com/markets/us/fed-holds-rates-2026-10-05',
  domain: 'reuters.com',
  title: 'Fed holds rates steady & signals patience',
  normalizedTitle: 'fed holds rates steady & signals patience',
}

describe('Google News RSS', () => {
  test('parses the <source> element', () => {
    const [item] = parseRssOrAtom(GOOGLE_NEWS_ITEM)
    expect(item?.sourceUrl).toBe('https://www.reuters.com')
    expect(item?.sourceName).toBe('Reuters')
    expect(item?.title).toBe('Fed holds rates steady & signals patience - Reuters')
  })

  test('strips only a matching publisher suffix', () => {
    expect(stripPublisherSuffix('Story - Reuters', 'Reuters')).toBe('Story')
    expect(stripPublisherSuffix('Story - Reuters', 'AP')).toBe('Story - Reuters')
    expect(stripPublisherSuffix('Story - Reuters', undefined)).toBe('Story - Reuters')
  })

  test('redirect-URL items match ground truth by publisher and title', () => {
    const articles = parseRssOrAtom(GOOGLE_NEWS_ITEM).map(toProviderArticle)
    expect(articles[0]?.sourceDomain).toBe('reuters.com')
    expect(findMatch(ground, articles)).toBe('title')
  })

  test('same title from a different publisher does not match', () => {
    const articles = parseRssOrAtom(
      GOOGLE_NEWS_ITEM.replace('https://www.reuters.com', 'https://www.cnbc.com')
    ).map(toProviderArticle)
    expect(findMatch(ground, articles)).toBe('none')
  })
})
