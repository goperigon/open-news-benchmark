import { describe, expect, test } from 'bun:test'

import { batchDomains } from '../src/prober/batch-domains.ts'

describe('batchDomains', () => {
  test('isolates busy domains in their own batch', () => {
    const pending = new Map([
      ['quiet.com', 2],
      ['busy.com', 25],
      ['also.com', 1],
    ])
    const batches = batchDomains(['quiet.com', 'busy.com', 'also.com'], 5, pending)
    expect(batches).toEqual([['quiet.com'], ['busy.com'], ['also.com']])
  })

  test('packs small domains up to batch size', () => {
    const batches = batchDomains(['a.com', 'b.com', 'c.com'], 2)
    expect(batches).toEqual([
      ['a.com', 'b.com'],
      ['c.com'],
    ])
  })
})
