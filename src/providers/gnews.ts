import type {
  ProviderAdapter,
  FetchRecentResult,
  ProviderArticle,
  EntityQuery,
  SearchTextInput,
} from './types.ts'
import { envPresent } from './types.ts'
import { companyKeywordPhrase } from './entity-keyword.ts'

function mapArticles(payload: unknown): ProviderArticle[] {
  if (typeof payload !== 'object' || payload === null || !('articles' in payload)) {
    return []
  }
  const articles = payload.articles
  if (!Array.isArray(articles)) {
    return []
  }
  const out: ProviderArticle[] = []
  for (const item of articles) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const url = 'url' in item && typeof item.url === 'string' ? item.url : null
    const title = 'title' in item && typeof item.title === 'string' ? item.title : null
    if (!url || !title) {
      continue
    }
    const providerTimestamp =
      'publishedAt' in item && typeof item.publishedAt === 'string' ? item.publishedAt : undefined
    const description =
      'description' in item && typeof item.description === 'string' ? item.description : undefined
    out.push({ url, title, providerTimestamp, snippet: description })
  }
  return out
}

async function gnewsFetch(params: URLSearchParams): Promise<FetchRecentResult> {
  const apiKey = process.env.GNEWS_API_KEY
  if (!apiKey) {
    throw new Error('[gnews] missing GNEWS_API_KEY')
  }
  params.set('token', apiKey)
  const started = performance.now()
  const response = await fetch(`https://gnews.io/api/v4/search?${params.toString()}`)
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[gnews] HTTP ${response.status}`)
  }
  return { articles: mapArticles(await response.json()), responseMs }
}

export function createGNewsAdapter(): ProviderAdapter {
  const requiredEnv = ['GNEWS_API_KEY'] as const
  return {
    id: 'gnews',
    displayName: 'GNews',
    requiredEnv,
    tierEnv: 'GNEWS_PLAN',
    dailyBudgetEnv: 'GNEWS_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 1,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: 'pubDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.GNEWS_PLAN,
    async fetchRecent(input): Promise<FetchRecentResult> {
      return gnewsFetch(
        new URLSearchParams({
          q: input.domains.map((d) => `site:${d}`).join(' OR '),
          from: input.sinceIso,
          max: '100',
        })
      )
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      return gnewsFetch(
        new URLSearchParams({
          q: companyKeywordPhrase(input.company),
          from: input.sinceIso,
          max: '100',
        })
      )
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const params = new URLSearchParams({
        q: input.query,
        max: '100',
      })
      if (input.sinceIso) {
        params.set('from', input.sinceIso)
      }
      return gnewsFetch(params)
    },
  }
}
