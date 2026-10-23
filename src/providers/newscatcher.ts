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
    const link = 'link' in item && typeof item.link === 'string' ? item.link : null
    const title = 'title' in item && typeof item.title === 'string' ? item.title : null
    if (!link || !title) {
      continue
    }
    const providerTimestamp =
      'published_date' in item && typeof item.published_date === 'string'
        ? item.published_date
        : undefined
    const summary =
      'summary' in item && typeof item.summary === 'string' ? item.summary : undefined
    out.push({ url: link, title, providerTimestamp, snippet: summary })
  }
  return out
}

async function newsCatcherFetch(params: URLSearchParams): Promise<FetchRecentResult> {
  const apiKey = process.env.NEWSCATCHER_API_KEY
  if (!apiKey) {
    throw new Error('[newscatcher] missing NEWSCATCHER_API_KEY')
  }
  const started = performance.now()
  const response = await fetch(
    `https://v3-api.newscatcherapi.com/api/latest?${params.toString()}`,
    { headers: { 'x-api-token': apiKey } }
  )
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[newscatcher] HTTP ${response.status}`)
  }
  return { articles: mapArticles(await response.json()), responseMs }
}

export function createNewsCatcherAdapter(): ProviderAdapter {
  const requiredEnv = ['NEWSCATCHER_API_KEY'] as const
  return {
    id: 'newscatcher',
    displayName: 'NewsCatcher',
    requiredEnv,
    tierEnv: 'NEWSCATCHER_PLAN',
    dailyBudgetEnv: 'NEWSCATCHER_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 5,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: 'pubDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.NEWSCATCHER_PLAN,
    async fetchRecent(input): Promise<FetchRecentResult> {
      const params = new URLSearchParams({
        from: input.sinceIso,
        page_size: '100',
        sort_by: 'date',
      })
      for (const domain of input.domains) {
        params.append('sources', domain)
      }
      return newsCatcherFetch(params)
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      const params = new URLSearchParams({
        from: input.sinceIso,
        page_size: '100',
        sort_by: 'date',
        q: companyKeywordPhrase(input.company),
      })
      return newsCatcherFetch(params)
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const params = new URLSearchParams({
        page_size: '100',
        sort_by: 'date',
        q: input.query,
      })
      if (input.sinceIso) {
        params.set('from', input.sinceIso)
      }
      return newsCatcherFetch(params)
    },
  }
}
