import { describe, expect, test } from 'bun:test'

import { extractArticleTextFromHtml } from '../src/qa/article-text.ts'

describe('extractArticleTextFromHtml', () => {
  test('prefers articleBody from JSON-LD', () => {
    const body =
      'Revenue rose 10 percent in the third quarter according to the company filing. ' +
      'Executives cited strong demand across regions and improved margins year over year. ' +
      'The outlook for the next quarter remains positive as new product lines continue to gain traction in key markets.'
    const html = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"${body}"}</script></head><body><p>ignored</p></body></html>`
    const text = extractArticleTextFromHtml(html)
    expect(text).toContain('Revenue rose 10 percent')
  })

  test('falls back to paragraph text', () => {
    const html = `<html><body><p>First paragraph with enough words to pass minimum extraction thresholds for testing.</p></body></html>`
    const text = extractArticleTextFromHtml(html)
    expect(text.length).toBeGreaterThan(50)
  })
})
