import { describe, expect, test } from 'bun:test'

import { ArticleQaSampler } from '../src/qa/article-sampler.ts'
import type { ArticleRow } from '../src/store/db.ts'
import { loadFreshQaConfig } from '../src/lib/load-config.ts'

function article(id: number, sourceType: string): ArticleRow {
  return {
    id,
    run_id: 'r1',
    url: `https://example.com/${id}`,
    normalized_url: `https://example.com/${id}`,
    domain: 'example.com',
    title: `Title ${id}`,
    normalized_title: `title ${id}`,
    source_type: sourceType,
    language: 'en',
    country: 'US',
    publisher_published_at: null,
    first_seen_at: new Date().toISOString(),
    tracking_ends_at: new Date(Date.now() + 3600_000).toISOString(),
  }
}

describe('ArticleQaSampler', () => {
  test('respects samplesPerHour cap', () => {
    const config = loadFreshQaConfig()
    const sampler = new ArticleQaSampler()
    const candidates = [article(1, 'wire'), article(2, 'business'), article(3, 'wire')]
    const picks: number[] = []
    for (let i = 0; i < 5; i += 1) {
      const picked = sampler.pick(candidates, {
        ...config,
        article: { ...config.article, enabled: true, samplesPerHour: 2 },
      })
      if (picked) {
        picks.push(picked.id)
      }
    }
    expect(picks.length).toBe(2)
  })
})
