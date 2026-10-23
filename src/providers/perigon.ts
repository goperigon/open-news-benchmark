import type {
  ProviderAdapter,
  FetchRecentInput,
  FetchRecentResult,
  ProviderArticle,
  EntityQuery,
  SearchTextInput,
} from './types.ts'
import { envPresent } from './types.ts'
import { companyKeywordPhrase } from './entity-keyword.ts'

function readArticles(payload: unknown, queryTicker?: string): ProviderArticle[] {
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
      'addDate' in item && typeof item.addDate === 'string'
        ? item.addDate
        : 'pubDate' in item && typeof item.pubDate === 'string'
          ? item.pubDate
          : undefined
    const description =
      'description' in item && typeof item.description === 'string' ? item.description : undefined
    const content = 'content' in item && typeof item.content === 'string' ? item.content : undefined
    let entityTagged = false
    if (queryTicker && 'companies' in item && Array.isArray(item.companies)) {
      for (const c of item.companies) {
        if (typeof c === 'object' && c !== null && 'symbol' in c && typeof c.symbol === 'string') {
          if (c.symbol.toUpperCase() === queryTicker.toUpperCase()) {
            entityTagged = true
            break
          }
        }
      }
    }
    const hasSentiment =
      'sentiment' in item &&
      typeof item.sentiment === 'object' &&
      item.sentiment !== null &&
      ('positive' in item.sentiment || 'negative' in item.sentiment)
    out.push({
      url,
      title,
      providerTimestamp,
      snippet: description,
      content,
      entityTagged,
      hasSentiment,
    })
  }
  return out
}

async function perigonFetch(params: URLSearchParams, queryTicker?: string): Promise<FetchRecentResult> {
  const base = process.env.API_BASE_URL ?? 'https://api.perigon.io'
  const started = performance.now()
  const response = await fetch(`${base}/v1/all?${params.toString()}`)
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[perigon] HTTP ${response.status}`)
  }
  const payload: unknown = await response.json()
  return { articles: readArticles(payload, queryTicker), responseMs }
}

export function createPerigonAdapter(): ProviderAdapter {
  const requiredEnv = ['PERIGON_API_KEY'] as const
  return {
    id: 'perigon',
    displayName: 'Perigon',
    requiredEnv,
    tierEnv: 'PERIGON_PLAN_TIER',
    dailyBudgetEnv: 'PERIGON_DAILY_BUDGET',
    capabilities: {
      maxDomainsPerQuery: 10,
      maxResults: 100,
      minPollIntervalMs: 60_000,
      structuredCompanyFilter: 'symbol',
    },
    selfReportedTimestampField: 'addDate',
    isConfigured: () => envPresent(requiredEnv),
    declaredTier: () => process.env.PERIGON_PLAN_TIER,
    async fetchRecent(input: FetchRecentInput): Promise<FetchRecentResult> {
      const apiKey = process.env.PERIGON_API_KEY
      if (!apiKey) {
        throw new Error('[perigon] missing PERIGON_API_KEY')
      }
      const params = new URLSearchParams({
        apiKey,
        sortBy: 'addDate',
        sortOrder: 'desc',
        size: '100',
        from: input.sinceIso,
        showReprints: 'false',
      })
      for (const domain of input.domains) {
        params.append('source', domain)
      }
      return perigonFetch(params)
    },
    async searchEntity(input: EntityQuery): Promise<FetchRecentResult> {
      const apiKey = process.env.PERIGON_API_KEY
      if (!apiKey) {
        throw new Error('[perigon] missing PERIGON_API_KEY')
      }
      const params = new URLSearchParams({
        apiKey,
        sortBy: 'addDate',
        sortOrder: 'desc',
        size: '100',
        from: input.sinceIso,
        showReprints: 'false',
      })
      if (input.mode === 'structured') {
        params.append('companySymbol', input.company.ticker)
      } else {
        params.set('q', companyKeywordPhrase(input.company))
      }
      return perigonFetch(params, input.company.ticker)
    },
    async searchText(input: SearchTextInput): Promise<FetchRecentResult> {
      const apiKey = process.env.PERIGON_API_KEY
      if (!apiKey) {
        throw new Error('[perigon] missing PERIGON_API_KEY')
      }
      const params = new URLSearchParams({
        apiKey,
        sortBy: 'relevance',
        size: '100',
        showReprints: 'false',
        q: input.query,
      })
      if (input.sinceIso) {
        params.set('from', input.sinceIso)
      }
      return perigonFetch(params)
    },
  }
}
