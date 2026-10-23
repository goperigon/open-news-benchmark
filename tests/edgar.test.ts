import { describe, expect, test } from 'bun:test'

import {
  filterTrackedItems,
  parse8KItemCodes,
  parseEdgarCurrentAtom,
} from '../src/anchors/edgar-parse.ts'
import { TRACKED_8K_ITEMS } from '../src/schema/event-coverage.ts'

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - ACME CORP (0000123456) (Filer)</title>
    <updated>2026-10-12T18:30:00-04:00</updated>
    <link href="https://www.sec.gov/cgi-bin/viewer?action=view&amp;cik=123456&amp;accession-number=0000123456-26-000001"/>
    <summary>Item 2.02 Results of Operations and Financial Condition Item 9.01</summary>
  </entry>
</feed>`

describe('EDGAR Atom parsing', () => {
  test('extracts item codes and anchor time', () => {
    const [entry] = parseEdgarCurrentAtom(SAMPLE_ATOM)
    expect(entry?.cik).toBe('0000123456')
    expect(entry?.itemCodes).toContain('2.02')
    expect(entry?.anchorAt).toContain('2026-10-12')
  })

  test('filters to tracked item types only', () => {
    const codes = parse8KItemCodes('Item 2.02 earnings Item 9.01 exhibit')
    expect(filterTrackedItems(codes, TRACKED_8K_ITEMS)).toEqual(['2.02'])
  })
})
