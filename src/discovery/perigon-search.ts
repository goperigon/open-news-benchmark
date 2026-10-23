import { readFileSync } from 'node:fs'

import { createPerigonAdapter } from '../providers/perigon.ts'
import { cyberBreachPerigonMonitorPath } from '../lib/paths.ts'
import { normalizeFromLlmPayload } from '../cyber/claim-normalize.ts'
import type { DiscoveryAdapter, DiscoveryPollResult } from './types.ts'

function monitorQuery(): string {
  const raw = JSON.parse(readFileSync(cyberBreachPerigonMonitorPath(), 'utf8')) as {
    query?: { q?: string }
  }
  return raw.query?.q ?? 'breach OR ransomware OR cyberattack'
}

export function createPerigonSearchDiscoveryAdapter(): DiscoveryAdapter {
  const perigon = createPerigonAdapter()
  return {
    id: 'perigon_search',
    displayName: 'Perigon search API (ablation)',
    requiredEnv: ['PERIGON_API_KEY'],
    isConfigured: () => perigon.isConfigured(),
    async poll(sinceIso: string): Promise<DiscoveryPollResult> {
      try {
        const { articles, responseMs } = await perigon.searchText({ query: monitorQuery(), sinceIso })
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

/** Placeholder for article→structured extraction via LLM in extract-test; search arm returns titles only. */
export { normalizeFromLlmPayload }
