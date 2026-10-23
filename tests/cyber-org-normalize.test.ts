import { describe, expect, test } from 'bun:test'

import { normalizeOrgName, orgKeysFromNames, orgKeysOverlap } from '../src/cyber/org-normalize.ts'

describe('cyber org normalize', () => {
  test('strips legal suffixes', () => {
    expect(normalizeOrgName('Acme Corp Inc.')).toBe('acme')
  })

  test('org key overlap', () => {
    expect(orgKeysOverlap(orgKeysFromNames(['Acme Corp']), orgKeysFromNames(['ACME Inc']))).toBe(
      true
    )
  })
})
