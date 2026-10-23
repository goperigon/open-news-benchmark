import type { Database } from 'bun:sqlite'

import type { PanelSource } from '../schema/panel.ts'
import type { LatencyConfig } from '../schema/panel.ts'
import { domainFromUrl, isSameSite, normalizeUrl } from '../matching/normalize-url.ts'
import { normalizeTitle } from '../matching/normalize-title.ts'
import { countArticlesByDomain, countArticlesForRun, insertArticle } from '../store/db.ts'
import { fetchFeed } from './rss.ts'
import { fetchNewsSitemap } from './news-sitemap.ts'
import { fetchAndStoreArticleAliases } from './canonical.ts'

const MAX_SITEMAP_URLS = 1000

export interface DiscoveredArticle {
  url: string
  title: string
  domain: string
  publisherPublishedAt?: string
  source: PanelSource
}

export interface SourcePollResult {
  /** null when the channel is not configured or the fetch failed */
  feed: DiscoveredArticle[] | null
  sitemap: DiscoveredArticle[] | null
}

export interface PersistResult {
  inserted: number
  domainCapHit: string | null
}

function belongsToSource(url: string, source: PanelSource): boolean {
  const host = domainFromUrl(url)
  return host !== null && isSameSite(host, source.domain)
}

export async function pollSource(source: PanelSource): Promise<SourcePollResult> {
  const [feedResult, sitemapResult] = await Promise.all([
    source.feedUrl ? fetchFeed(source.feedUrl) : Promise.resolve(null),
    source.sitemapUrl ? fetchNewsSitemap(source.sitemapUrl) : Promise.resolve(null),
  ])

  const feed = feedResult
    ? feedResult.items
        .filter((item) => belongsToSource(item.url, source))
        .map((item) => ({
          url: item.url,
          title: item.title,
          domain: source.domain,
          publisherPublishedAt: item.publishedAt,
          source,
        }))
    : null

  const sitemap =
    sitemapResult && sitemapResult.kind !== 'unknown'
      ? sitemapResult.urls
          .slice(0, MAX_SITEMAP_URLS)
          .filter((item) => belongsToSource(item.loc, source))
          .map((item) => ({
            url: item.loc,
            title: item.title ?? item.loc,
            domain: source.domain,
            publisherPublishedAt: item.publicationDate,
            source,
          }))
      : null

  return { feed, sitemap }
}

export function persistDiscoveredArticles(
  db: Database,
  runId: string,
  discovered: DiscoveredArticle[],
  firstSeenAt: string,
  config: Pick<LatencyConfig, 'trackingWindowMs' | 'targetArticleCount' | 'maxArticlesPerDomain'>,
  onInserted?: (articleId: number, url: string) => void
): PersistResult {
  const trackingEndsAt = new Date(
    new Date(firstSeenAt).getTime() + config.trackingWindowMs
  ).toISOString()
  let inserted = 0
  let domainCapHit: string | null = null

  for (const item of discovered) {
    if (countArticlesForRun(db, runId) >= config.targetArticleCount) {
      break
    }
    if (countArticlesByDomain(db, runId, item.domain) >= config.maxArticlesPerDomain) {
      domainCapHit = item.domain
      continue
    }
    const normalizedUrl = normalizeUrl(item.url)
    if (!normalizedUrl) {
      continue
    }
    const id = insertArticle(db, {
      run_id: runId,
      url: item.url,
      normalized_url: normalizedUrl,
      domain: item.domain,
      title: item.title,
      normalized_title: normalizeTitle(item.title),
      source_type: item.source.sourceType,
      language: item.source.language,
      country: item.source.country,
      publisher_published_at: item.publisherPublishedAt ?? null,
      first_seen_at: firstSeenAt,
      tracking_ends_at: trackingEndsAt,
    })
    if (id !== null) {
      inserted += 1
      onInserted?.(id, item.url)
    }
  }
  return { inserted, domainCapHit }
}

export function scheduleCanonicalFetch(
  db: Database,
  articleId: number,
  url: string,
  inFlight: Set<number>
): void {
  if (inFlight.has(articleId)) {
    return
  }
  inFlight.add(articleId)
  void fetchAndStoreArticleAliases(db, articleId, url).finally(() => {
    inFlight.delete(articleId)
  })
}
