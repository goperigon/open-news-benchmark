import { describe, expect, test } from 'bun:test'

import { parseNewsSitemap, parseSitemapIndex } from '../src/ground-truth/news-sitemap.ts'
import { normalizeTitle } from '../src/matching/normalize-title.ts'
import { isSameSite } from '../src/matching/normalize-url.ts'
import {
  applyPanelCheck,
  parseFeedLinks,
  parseNewsSitemapsFromRobots,
  type ChannelCheck,
  type SourceCheck,
} from '../src/panel/check.ts'
import type { PanelSource } from '../src/schema/panel.ts'

describe('isSameSite', () => {
  test('allows www and subdomains in either direction', () => {
    expect(isSameSite('www.reuters.com', 'reuters.com')).toBe(true)
    expect(isSameSite('uk.reuters.com', 'reuters.com')).toBe(true)
    expect(isSameSite('reuters.com', 'english.kyodonews.net')).toBe(false)
    expect(isSameSite('bbc.co.uk', 'bbc.com')).toBe(false)
    expect(isSameSite('notreuters.com', 'reuters.com')).toBe(false)
  })
})

describe('normalizeTitle', () => {
  test('decodes entities and unifies typographic punctuation', () => {
    expect(normalizeTitle('AT&amp;T&#39;s  \u201Cbig\u201D deal &#x2014; done')).toBe(
      'at&t\'s "big" deal - done'
    )
  })
})

describe('sitemaps', () => {
  test('reads CDATA-wrapped <loc> values', () => {
    const xml = `<urlset><url><loc><![CDATA[https://example.com/a]]></loc>
      <news:news><news:title><![CDATA[Title A]]></news:title></news:news></url></urlset>`
    expect(parseNewsSitemap(xml)).toEqual([
      { loc: 'https://example.com/a', title: 'Title A', publicationDate: undefined },
    ])
  })

  test('lists sitemap index children in order', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://example.com/news.xml?outputType=xml</loc></sitemap>
      <sitemap><loc>https://example.com/news.xml?outputType=xml&amp;from=100</loc></sitemap>
    </sitemapindex>`
    expect(parseSitemapIndex(xml)).toEqual([
      'https://example.com/news.xml?outputType=xml',
      'https://example.com/news.xml?outputType=xml&from=100',
    ])
  })
})

describe('panel discovery', () => {
  test('finds alternate feed links on a homepage', () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" href="/feed/" />
      <link rel="stylesheet" href="/x.css" />
      <link rel="alternate" type="application/atom+xml" href="https://cdn.example.com/atom.xml">
    </head>`
    expect(parseFeedLinks(html, 'https://www.example.com/')).toEqual([
      'https://www.example.com/feed/',
      'https://cdn.example.com/atom.xml',
    ])
  })

  test('picks news sitemaps from robots.txt', () => {
    const robots = 'User-agent: *\nSitemap: https://e.com/sitemap.xml\nsitemap: https://e.com/news-sitemap.xml\n'
    expect(parseNewsSitemapsFromRobots(robots)).toEqual(['https://e.com/news-sitemap.xml'])
  })
})

describe('applyPanelCheck', () => {
  const source = (domain: string): PanelSource => ({
    domain,
    sourceType: 'business',
    language: 'en',
    country: 'US',
    feedUrl: `https://${domain}/guessed-feed`,
  })
  const channel = (url: string): ChannelCheck => ({
    url,
    status: 200,
    itemCount: 10,
    onDomainCount: 10,
    newestAgeHours: 1,
    usable: true,
  })

  test('replaces guessed URLs with verified ones and excludes dead sources', () => {
    const results: SourceCheck[] = [
      {
        domain: 'good.com',
        verdict: 'ok',
        feed: null,
        sitemap: channel('https://www.good.com/news-sitemap.xml'),
        attempts: [],
      },
      { domain: 'dead.com', verdict: 'dead', feed: null, sitemap: null, attempts: [] },
    ]
    const { sources, exclusions } = applyPanelCheck([source('good.com'), source('dead.com')], results)
    expect(sources).toEqual([
      {
        domain: 'good.com',
        sourceType: 'business',
        language: 'en',
        country: 'US',
        sitemapUrl: 'https://www.good.com/news-sitemap.xml',
      },
    ])
    expect(exclusions.map((e) => e.domain)).toEqual(['dead.com'])
  })
})
