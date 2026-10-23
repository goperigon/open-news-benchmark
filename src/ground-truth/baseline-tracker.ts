import { normalizeUrl } from '../matching/normalize-url.ts'

export type GroundTruthChannel = 'feed' | 'sitemap'

export interface TrackedItem {
  url: string
  publisherPublishedAt?: string
}

/**
 * Feeds and sitemaps that return a varying subset per request resurface old URLs after the
 * baseline. An item whose publisher date is older than `maxAgeMs` at first sight is backlog,
 * not a new article. Items without a parseable date are kept.
 */
export function isPlausiblyNew(item: TrackedItem, observedAtMs: number, maxAgeMs: number): boolean {
  if (!item.publisherPublishedAt) {
    return true
  }
  const publishedMs = Date.parse(item.publisherPublishedAt)
  return Number.isNaN(publishedMs) || observedAtMs - publishedMs <= maxAgeMs
}

/**
 * Decides which ground-truth URLs count as newly published.
 *
 * Each source channel's first successful poll is a baseline: everything already in the
 * feed was published before the run started, so providers have had time to index it and
 * its time to index would read as ~0. Only URLs that appear after that baseline count.
 * A failed poll (null) does not establish a baseline, so a feed that is down at startup
 * cannot later flood the run with its backlog.
 */
export class BaselineTracker {
  private readonly seenUrls = new Set<string>()
  private readonly baselinedChannels = new Set<string>()
  private baselineUrlCount = 0

  ingest<T extends TrackedItem>(
    sourceDomain: string,
    channel: GroundTruthChannel,
    items: T[] | null
  ): T[] {
    if (items === null) {
      return []
    }
    const channelKey = `${sourceDomain}|${channel}`
    const isBaseline = !this.baselinedChannels.has(channelKey)
    const fresh: T[] = []
    for (const item of items) {
      const normalized = normalizeUrl(item.url)
      if (!normalized || this.seenUrls.has(normalized)) {
        continue
      }
      this.seenUrls.add(normalized)
      if (isBaseline) {
        this.baselineUrlCount += 1
      } else {
        fresh.push(item)
      }
    }
    this.baselinedChannels.add(channelKey)
    return fresh
  }

  isBaselined(sourceDomain: string, channel: GroundTruthChannel): boolean {
    return this.baselinedChannels.has(`${sourceDomain}|${channel}`)
  }

  get baselineSize(): number {
    return this.baselineUrlCount
  }
}
