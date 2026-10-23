import { describe, expect, test } from 'bun:test'

import { isVerifiableCitationUrl } from '../src/cyber/url-verifier.ts'

describe('isVerifiableCitationUrl', () => {
  test('accepts https URLs', () => {
    expect(isVerifiableCitationUrl('https://www.bleepingcomputer.com/news/security/sample/')).toBe(true)
  })

  test('rejects placeholder hosts', () => {
    expect(isVerifiableCitationUrl('https://unknown.local/')).toBe(false)
    expect(isVerifiableCitationUrl('https://example.com/breach')).toBe(false)
  })

  test('rejects invalid URLs', () => {
    expect(isVerifiableCitationUrl('not-a-url')).toBe(false)
  })
})
