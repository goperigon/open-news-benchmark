import { parseRssOrAtom, type FeedItem } from '../ground-truth/rss.ts'
import { domainFromUrl } from '../matching/normalize-url.ts'
import { fetchText } from '../lib/http.ts'
import type {
  ProviderAdapter,
  FetchRecentResult,
  ProviderArticle,
  EntityQuery,
  SearchTextInput,
} from './types.ts'
import { companyKeywordPhrase } from './entity-keyword.ts'

/** Google News appends " - Publisher Name" to every title; remove it when it matches the source. */
export function stripPublisherSuffix(title: string, sourceName: string | undefined): string {
  if (!sourceName) {
    return title
  }
  const suffix = ` - ${sourceName}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

/**
 * Google News item links are news.google.com redirects, so URL matching never succeeds.
 * The publisher comes from the item's `<source url>` element, and matching falls back to
 * the title within that publisher's site.
 */
export function toProviderArticle(item: FeedItem): ProviderArticle {
  return {
    url: item.url,
    title: stripPublisherSuffix(item.title, item.sourceName),
    providerTimestamp: item.publishedAt,
    sourceDomain: item.sourceUrl ? (domainFromUrl(item.sourceUrl) ?? undefined) : undefined,
  }
}

export function createGoogleNewsRssAdapter(): ProviderAdapter {
  return {
    id: 'google_news_rss',
    displayName: 'Google News RSS (reference baseline)',
    requiredEnv: [],
    capabilities: {
      maxDomainsPerQuery: 5,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: null,
    isConfigured: () => true,
    declaredTier: () => 'public-rss',
    async fetchRecent(input): Promise<FetchRecentResult> {
      const siteQuery = input.domains.map((d) => `site:${d}`).join(' OR ')
      return googleNewsSearch(`${siteQuery} when:1h`)
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      const phrase = companyKeywordPhrase(input.company)
      return googleNewsSearch(`${phrase} when:1d`)
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const when = googleNewsWhenClause(input.sinceIso)
      return googleNewsSearch(`${input.query} ${when}`.trim())
    },
  }
}

function googleNewsWhenClause(sinceIso: string | undefined): string {
  if (!sinceIso) {
    return 'when:30d'
  }
  const days = Math.max(1, Math.ceil((Date.now() - Date.parse(sinceIso)) / 86_400_000))
  if (days <= 1) {
    return 'when:1d'
  }
  if (days <= 7) {
    return 'when:7d'
  }
  return 'when:30d'
}

async function googleNewsSearch(query: string): Promise<FetchRecentResult> {
  const q = encodeURIComponent(query)
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
  const started = performance.now()
  const response = await fetchText(url)
  const responseMs = performance.now() - started
  if (!response) {
    throw new Error('[google_news_rss] request failed')
  }
  if (!response.ok) {
    throw new Error(`[google_news_rss] HTTP ${response.status}`)
  }
  return { articles: parseRssOrAtom(response.text).map(toProviderArticle), responseMs }
}
