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
  const block = payload.articles
  if (typeof block !== 'object' || block === null || !('results' in block)) {
    return []
  }
  const results = block.results
  if (!Array.isArray(results)) {
    return []
  }
  const out: ProviderArticle[] = []
  for (const item of results) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const url = 'url' in item && typeof item.url === 'string' ? item.url : null
    const title = 'title' in item && typeof item.title === 'string' ? item.title : null
    if (!url || !title) {
      continue
    }
    const providerTimestamp =
      'dateTimePub' in item && typeof item.dateTimePub === 'string' ? item.dateTimePub : undefined
    const body = 'body' in item && typeof item.body === 'string' ? item.body : undefined
    out.push({ url, title, providerTimestamp, snippet: body?.slice(0, 500), content: body })
  }
  return out
}

async function eventRegistryPost(body: Record<string, unknown>): Promise<FetchRecentResult> {
  const apiKey = process.env.EVENTREGISTRY_API_KEY
  if (!apiKey) {
    throw new Error('[eventregistry] missing EVENTREGISTRY_API_KEY')
  }
  const started = performance.now()
  const response = await fetch('https://eventregistry.org/api/v1/article/getArticles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, apiKey }),
  })
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[eventregistry] HTTP ${response.status}`)
  }
  return { articles: mapArticles(await response.json()), responseMs }
}

export function createEventRegistryAdapter(): ProviderAdapter {
  const requiredEnv = ['EVENTREGISTRY_API_KEY'] as const
  return {
    id: 'eventregistry',
    displayName: 'NewsAPI.ai / Event Registry',
    requiredEnv,
    tierEnv: 'EVENTREGISTRY_PLAN',
    dailyBudgetEnv: 'EVENTREGISTRY_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 5,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: 'pubDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.EVENTREGISTRY_PLAN,
    async fetchRecent(input): Promise<FetchRecentResult> {
      return eventRegistryPost({
        action: 'getArticles',
        keyword: '',
        sourceUri: input.domains,
        dateStart: input.sinceIso.slice(0, 10),
        articlesSortBy: 'date',
        articlesCount: 100,
      })
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      return eventRegistryPost({
        action: 'getArticles',
        keyword: companyKeywordPhrase(input.company),
        dateStart: input.sinceIso.slice(0, 10),
        articlesSortBy: 'date',
        articlesCount: 100,
      })
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const body: Record<string, unknown> = {
        action: 'getArticles',
        keyword: input.query,
        articlesSortBy: 'date',
        articlesCount: 100,
      }
      if (input.sinceIso) {
        body.dateStart = input.sinceIso.slice(0, 10)
      }
      return eventRegistryPost(body)
    },
  }
}
