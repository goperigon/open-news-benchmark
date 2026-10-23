import type {
  ProviderAdapter,
  FetchRecentResult,
  ProviderArticle,
  EntityQuery,
  SearchTextInput,
} from './types.ts'
import { envPresent } from './types.ts'
import { companyKeywordPhrase } from './entity-keyword.ts'

function mapResults(payload: unknown): ProviderArticle[] {
  if (typeof payload !== 'object' || payload === null || !('results' in payload)) {
    return []
  }
  const results = payload.results
  if (!Array.isArray(results)) {
    return []
  }
  const out: ProviderArticle[] = []
  for (const item of results) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const link = 'link' in item && typeof item.link === 'string' ? item.link : null
    const title = 'title' in item && typeof item.title === 'string' ? item.title : null
    if (!link || !title) {
      continue
    }
    const providerTimestamp =
      'pubDate' in item && typeof item.pubDate === 'string' ? item.pubDate : undefined
    const description =
      'description' in item && typeof item.description === 'string' ? item.description : undefined
    out.push({ url: link, title, providerTimestamp, snippet: description })
  }
  return out
}

async function newsDataFetch(params: URLSearchParams): Promise<FetchRecentResult> {
  const apiKey = process.env.NEWSDATA_API_KEY
  if (!apiKey) {
    throw new Error('[newsdata] missing NEWSDATA_API_KEY')
  }
  params.set('apikey', apiKey)
  const started = performance.now()
  const response = await fetch(`https://newsdata.io/api/1/latest?${params.toString()}`)
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[newsdata] HTTP ${response.status}`)
  }
  return { articles: mapResults(await response.json()), responseMs }
}

export function createNewsDataAdapter(): ProviderAdapter {
  const requiredEnv = ['NEWSDATA_API_KEY'] as const
  return {
    id: 'newsdata',
    displayName: 'NewsData.io',
    requiredEnv,
    tierEnv: 'NEWSDATA_PLAN',
    dailyBudgetEnv: 'NEWSDATA_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 1,
      maxResults: 50,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: null,
    },
    selfReportedTimestampField: 'pubDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.NEWSDATA_PLAN,
    async fetchRecent(input): Promise<FetchRecentResult> {
      const domain = input.domains[0]
      if (!domain) {
        return { articles: [], responseMs: 0 }
      }
      return newsDataFetch(
        new URLSearchParams({
          domain,
          from_date: input.sinceIso.slice(0, 10),
        })
      )
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      if (input.mode === 'structured') {
        return { articles: [], responseMs: 0 }
      }
      return newsDataFetch(
        new URLSearchParams({
          q: companyKeywordPhrase(input.company),
          from_date: input.sinceIso.slice(0, 10),
        })
      )
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const params = new URLSearchParams({ q: input.query })
      if (input.sinceIso) {
        params.set('from_date', input.sinceIso.slice(0, 10))
      }
      return newsDataFetch(params)
    },
  }
}
