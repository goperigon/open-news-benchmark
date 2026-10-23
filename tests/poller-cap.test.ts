import { describe, expect, test } from 'bun:test'

import { persistDiscoveredArticles, type DiscoveredArticle } from '../src/ground-truth/poller.ts'
import { openDatabase, countArticlesForRun, insertRun } from '../src/store/db.ts'
import { loadLatencyConfig } from '../src/lib/load-config.ts'

function sampleArticle(domain: string, n: number): DiscoveredArticle {
  return {
    url: `https://${domain}/story-${n}`,
    title: `Story ${n}`,
    domain,
    source: {
      domain,
      sourceType: 'wire',
      language: 'en',
      country: 'US',
      feedUrl: 'https://example.com/rss',
    },
  }
}

describe('persistDiscoveredArticles caps', () => {
  test('respects targetArticleCount and maxArticlesPerDomain', () => {
    const db = openDatabase(':memory:')
    const config = loadLatencyConfig()
    insertRun(db, {
      id: 'run-1',
      suite_id: 'latency',
      started_at: new Date().toISOString(),
      panel_hash: 'p',
      config_hash: 'c',
      harness_git_sha: 's',
      region: 'test',
    })

    const items: DiscoveredArticle[] = []
    for (let i = 0; i < 60; i += 1) {
      items.push(sampleArticle('reuters.com', i))
    }
    for (let i = 0; i < 10; i += 1) {
      items.push(sampleArticle('bbc.com', i))
    }

    const { inserted, domainCapHit } = persistDiscoveredArticles(
      db,
      'run-1',
      items,
      new Date().toISOString(),
      config
    )

    expect(inserted).toBe(60)
    expect(domainCapHit).toBe('reuters.com')
    expect(countArticlesForRun(db, 'run-1')).toBe(60)
  })
})
