import { describe, expect, test } from 'bun:test'

import { BaselineTracker, isPlausiblyNew } from '../src/ground-truth/baseline-tracker.ts'

const item = (path: string) => ({ url: `https://example.com/${path}` })

describe('BaselineTracker', () => {
  test('first successful poll is a baseline and yields nothing', () => {
    const tracker = new BaselineTracker()
    expect(tracker.ingest('example.com', 'feed', [item('a'), item('b')])).toEqual([])
    expect(tracker.baselineSize).toBe(2)
  })

  test('only URLs that appear after the baseline are new', () => {
    const tracker = new BaselineTracker()
    tracker.ingest('example.com', 'feed', [item('a'), item('b')])
    const fresh = tracker.ingest('example.com', 'feed', [item('c'), item('a'), item('b')])
    expect(fresh.map((i) => i.url)).toEqual(['https://example.com/c'])
    expect(tracker.ingest('example.com', 'feed', [item('c')])).toEqual([])
  })

  test('a failed first poll does not establish the baseline', () => {
    const tracker = new BaselineTracker()
    expect(tracker.ingest('example.com', 'feed', null)).toEqual([])
    expect(tracker.isBaselined('example.com', 'feed')).toBe(false)
    expect(tracker.ingest('example.com', 'feed', [item('backlog')])).toEqual([])
    expect(tracker.isBaselined('example.com', 'feed')).toBe(true)
  })

  test('channels baseline independently but share seen URLs', () => {
    const tracker = new BaselineTracker()
    tracker.ingest('example.com', 'feed', [item('a')])
    expect(tracker.ingest('example.com', 'sitemap', [item('a'), item('old')])).toEqual([])
    const fresh = tracker.ingest('example.com', 'sitemap', [item('new'), item('a')])
    expect(fresh.map((i) => i.url)).toEqual(['https://example.com/new'])
  })

  test('resurfaced backlog is rejected by publisher age; undated items are kept', () => {
    const now = Date.parse('2026-10-05T12:00:00Z')
    const twoHours = 7_200_000
    const at = (iso: string) => ({ url: 'https://example.com/x', publisherPublishedAt: iso })
    expect(isPlausiblyNew(at('2026-10-05T11:30:00Z'), now, twoHours)).toBe(true)
    expect(isPlausiblyNew(at('2026-10-05T01:00:00Z'), now, twoHours)).toBe(false)
    expect(isPlausiblyNew(at('not a date'), now, twoHours)).toBe(true)
    expect(isPlausiblyNew({ url: 'https://example.com/x' }, now, twoHours)).toBe(true)
  })

  test('tracking-parameter variants of a seen URL are not new', () => {
    const tracker = new BaselineTracker()
    tracker.ingest('example.com', 'feed', [item('a')])
    expect(tracker.ingest('example.com', 'feed', [item('a?utm_source=rss')])).toEqual([])
  })
})
