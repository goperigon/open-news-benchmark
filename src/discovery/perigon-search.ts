import { loadCyberMonitorQuery } from '../lib/load-cyber-monitor.ts'
import { envPresent } from '../providers/types.ts'
import type { DiscoveryAdapter, DiscoveryPollResult } from './types.ts'

async function perigonSearchArticles(sinceIso: string): Promise<{ articles: Array<{ url: string; title: string }>; responseMs: number }> {
  const apiKey = process.env.PERIGON_API_KEY
  if (!apiKey) {
    throw new Error('[perigon] missing PERIGON_API_KEY')
  }
  const query = loadCyberMonitorQuery()
  const base = process.env.API_BASE_URL ?? 'https://api.perigon.io'
  const params = new URLSearchParams({
    apiKey,
    sortBy: 'relevance',
    size: '100',
    showReprints: 'false',
    q: query.q,
    from: sinceIso,
  })
  if (query.searchTranslation === true) {
    params.set('searchTranslation', 'true')
  } else if (query.searchTranslation === false) {
    params.set('searchTranslation', 'false')
  }
  for (const lang of query.language ?? []) {
    params.append('language', lang)
  }
  for (const label of query.excludeLabel ?? []) {
    params.append('excludeLabel', label)
  }
  const started = performance.now()
  const response = await fetch(`${base}/v1/all?${params}`)
  const responseMs = performance.now() - started
  if (!response.ok) {
    throw new Error(`[perigon] HTTP ${response.status}`)
  }
  const payload: unknown = await response.json()
  const articles: Array<{ url: string; title: string }> = []
  if (typeof payload === 'object' && payload !== null && 'articles' in payload && Array.isArray(payload.articles)) {
    for (const item of payload.articles) {
      if (typeof item !== 'object' || item === null) {
        continue
      }
      const url = 'url' in item && typeof item.url === 'string' ? item.url : null
      const title = 'title' in item && typeof item.title === 'string' ? item.title : null
      if (url && title) {
        articles.push({ url, title })
      }
    }
  }
  return { articles, responseMs }
}

export function createPerigonSearchDiscoveryAdapter(): DiscoveryAdapter {
  return {
    id: 'perigon_search',
    displayName: 'Perigon search API (ablation)',
    requiredEnv: ['PERIGON_API_KEY'],
    isConfigured: () => envPresent(['PERIGON_API_KEY']),
    async poll(sinceIso: string): Promise<DiscoveryPollResult> {
      try {
        const { articles, responseMs } = await perigonSearchArticles(sinceIso)
        const incidents = articles.map((article) => ({
          shortDescription: article.title,
          attackType: 'OTHER',
          impactedOrganizationNames: [article.title.split(' ')[0] ?? 'Unknown'],
          impactedOrganizationDomains: [],
          citationUrls: [article.url],
        }))
        return { status: 'ok', incidents, responseMs, raw: { articles: articles.length } }
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
