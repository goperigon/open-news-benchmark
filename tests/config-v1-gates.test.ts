import { describe, expect, test } from 'bun:test'

import {
  loadEventCoverageConfig,
  loadFreshQaConfig,
  loadFreshQaStaticConfig,
} from '../src/lib/load-config.ts'
import { shouldUseRelevanceJudge } from '../src/events/relevance.ts'

describe('latency-only benchmark config (committed)', () => {
  test('live fresh-qa and article sampling disabled', () => {
    expect(loadFreshQaConfig().enabled).toBe(false)
    expect(loadFreshQaConfig().article.enabled).toBe(false)
  })

  test('freshqa-static disabled', () => {
    expect(loadFreshQaStaticConfig().enabled).toBe(false)
  })

  test('relevance judge disabled', () => {
    expect(loadEventCoverageConfig().relevanceJudgeEnabled).toBe(false)
  })

  test('shouldUseRelevanceJudge follows config flag when OpenAI present', () => {
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-test'
    try {
      expect(shouldUseRelevanceJudge(false)).toBe(false)
      expect(shouldUseRelevanceJudge(true)).toBe(true)
    } finally {
      if (prev === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = prev
      }
    }
  })
})
