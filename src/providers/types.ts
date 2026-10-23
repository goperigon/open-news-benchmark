export interface ProviderArticle {
  url: string
  title: string
  providerTimestamp?: string
  /** Publisher host when `url` is an aggregator redirect (e.g. Google News). */
  sourceDomain?: string
  snippet?: string
  content?: string
  entityTagged?: boolean
  hasSentiment?: boolean
}

export interface FetchRecentInput {
  domains: string[]
  sinceIso: string
}

export interface FetchRecentResult {
  articles: ProviderArticle[]
  responseMs: number
}

export type StructuredCompanyFilter = 'symbol' | 'concept' | null

export type SelfReportedTimestampField = 'addDate' | 'pubDate' | null

export interface EntityQueryCompany {
  name: string
  aliases: string[]
  ticker: string
  domain?: string
}

export interface EntityQuery {
  company: EntityQueryCompany
  sinceIso: string
  mode: 'keyword' | 'structured'
  /** For relevance and fresh-qa (e.g. 2.02 earnings). */
  itemTypes?: string[]
}

export interface SearchTextInput {
  query: string
  sinceIso?: string
}

export interface ProviderAdapter {
  id: string
  displayName: string
  requiredEnv: readonly string[]
  tierEnv?: string
  capabilities: {
    maxDomainsPerQuery: number
    maxResults: number
    minPollIntervalMs: number
    structuredCompanyFilter: StructuredCompanyFilter
    /** When false, provider is latency-only (no searchText / searchEntity benchmarks). */
    supportsSearch?: boolean
  }
  selfReportedTimestampField: SelfReportedTimestampField
  isConfigured(): boolean
  declaredTier(): string | undefined
  fetchRecent(input: FetchRecentInput): Promise<FetchRecentResult>
  searchEntity(input: EntityQuery): Promise<FetchRecentResult>
  searchText(input: SearchTextInput): Promise<FetchRecentResult>
  /** Optional daily probe budget (env `PROVIDER_ID_DAILY_BUDGET`). */
  dailyBudgetEnv?: string
}

export function adapterSupportsSearch(adapter: ProviderAdapter): boolean {
  return adapter.capabilities.supportsSearch !== false
}

export function envPresent(keys: readonly string[]): boolean {
  return keys.every((key) => {
    const value = process.env[key]
    return typeof value === 'string' && value.length > 0
  })
}

export function readDailyBudget(providerId: string): number | null {
  const key = `${providerId.toUpperCase().replace(/-/g, '_')}_DAILY_BUDGET`
  const raw = process.env[key]
  if (!raw) {
    return null
  }
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}
