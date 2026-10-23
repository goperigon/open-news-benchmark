import { describe, expect, test } from 'bun:test'

import { parseCsv, csvRowToRecord } from '../src/lib/csv.ts'

describe('parseCsv', () => {
  test('parses quoted commas', () => {
    const rows = parseCsv('a,"b,c",d\n1,2,3')
    expect(rows[0]).toEqual(['a', 'b,c', 'd'])
    expect(rows[1]).toEqual(['1', '2', '3'])
  })
})

import { loadFreshQaDataset } from '../src/qa/freshqa-dataset.ts'

describe('freshqa header detection', () => {
  test('loads rows after preamble', () => {
    const items = loadFreshQaDataset(`${import.meta.dir}/fixtures/freshqa-mini.csv`, 'TEST')
    expect(items.length).toBe(2)
    expect(items[0]?.goldAnswers[0]).toBe('Donald Trump')
  })
})
