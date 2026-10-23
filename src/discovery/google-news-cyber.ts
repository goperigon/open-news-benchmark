import { createGoogleNewsRssAdapter } from '../providers/google-news-rss.ts'
import type { DiscoveryAdapter, DiscoveryPollResult } from './types.ts'

const CYBER_QUERY =
  'breach OR ransomware OR cyberattack OR "data leak" OR "data breach" OR hacked OR "unauthorized access"'

export function createGoogleNewsCyberDiscoveryAdapter(): DiscoveryAdapter {
  const google = createGoogleNewsRssAdapter()
  return {
    id: 'google_news_rss',
    displayName: 'Google News RSS (cyber query)',
    requiredEnv: [],
    isConfigured: () => true,
    async poll(sinceIso: string): Promise<DiscoveryPollResult> {
      try {
        const { articles, responseMs } = await google.searchText({ query: CYBER_QUERY, sinceIso })
        const incidents = articles.slice(0, 25).map((article) => ({
          shortDescription: article.title,
          attackType: 'OTHER',
          impactedOrganizationNames: [article.title.slice(0, 80)],
          impactedOrganizationDomains: article.sourceDomain ? [article.sourceDomain] : [],
          citationUrls: [article.url],
        }))
        return { status: 'ok', incidents, responseMs, raw: { count: incidents.length } }
      } catch (error) {
        return {
          status: 'skipped_error',
          incidents: [],
          responseMs: 0,
          raw: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
