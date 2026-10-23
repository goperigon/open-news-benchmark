import type {
  ProviderAdapter,
  FetchRecentResult,
  ProviderArticle,
  EntityQuery,
  SearchTextInput,
} from './types.ts'
import { envPresent } from './types.ts'
import { companyKeywordPhrase } from './entity-keyword.ts'

function mapPosts(payload: unknown): ProviderArticle[] {
  if (typeof payload !== 'object' || payload === null || !('posts' in payload)) {
    return []
  }
  const posts = payload.posts
  if (!Array.isArray(posts)) {
    return []
  }
  const out: ProviderArticle[] = []
  for (const item of posts) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const url = 'url' in item && typeof item.url === 'string' ? item.url : null
    const title = 'title' in item && typeof item.title === 'string' ? item.title : null
    if (!url || !title) {
      continue
    }
    const providerTimestamp =
      'published' in item && typeof item.published === 'string' ? item.published : undefined
    const text = 'text' in item && typeof item.text === 'string' ? item.text : undefined
    out.push({ url, title, providerTimestamp, snippet: text?.slice(0, 500), content: text })
  }
  return out
}

async function webzFetch(params: URLSearchParams): Promise<FetchRecentResult> {
  const token = process.env.WEBZ_API_KEY
  if (!token) {
    throw new Error('[webz] missing WEBZ_API_KEY')
  }
  params.set('token', token)
  const started = performance.now()
  const response = await fetch(`https://api.webz.io/newsApiLite?${params.toString()}`)
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[webz] HTTP ${response.status}`)
  }
  return { articles: mapPosts(await response.json()), responseMs }
}

export function createWebzAdapter(): ProviderAdapter {
  const requiredEnv = ['WEBZ_API_KEY'] as const
  return {
    id: 'webz',
    displayName: 'Webz.io',
    requiredEnv,
    tierEnv: 'WEBZ_PLAN',
    dailyBudgetEnv: 'WEBZ_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 5,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: 'pubDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.WEBZ_PLAN,
    async fetchRecent(input): Promise<FetchRecentResult> {
      const site = input.domains.map((d) => `site:${d}`).join(' OR ')
      return webzFetch(
        new URLSearchParams({
          q: site,
          ts: String(new Date(input.sinceIso).getTime()),
          size: '100',
        })
      )
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      return webzFetch(
        new URLSearchParams({
          q: companyKeywordPhrase(input.company),
          ts: String(new Date(input.sinceIso).getTime()),
          size: '100',
        })
      )
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const params: Record<string, string> = {
        q: input.query,
        size: '100',
      }
      if (input.sinceIso) {
        params.ts = String(new Date(input.sinceIso).getTime())
      }
      return webzFetch(new URLSearchParams(params))
    },
  }
}
