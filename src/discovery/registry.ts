import { createAnthropicWebsearchDiscoveryAdapter } from './anthropic-websearch.ts'
import { createGeminiGroundedDiscoveryAdapter } from './gemini-grounded.ts'
import { createGoogleNewsCyberDiscoveryAdapter } from './google-news-cyber.ts'
import { createOpenAiWebsearchDiscoveryAdapter } from './openai-websearch.ts'
import { createPerigonMonitorDiscoveryAdapter } from './perigon-monitor.ts'
import { createPerigonSearchDiscoveryAdapter } from './perigon-search.ts'
import type { DiscoveryAdapter } from './types.ts'

export function allDiscoveryAdapters(): DiscoveryAdapter[] {
  return [
    createPerigonMonitorDiscoveryAdapter(),
    createPerigonSearchDiscoveryAdapter(),
    createGoogleNewsCyberDiscoveryAdapter(),
    createOpenAiWebsearchDiscoveryAdapter(),
    createAnthropicWebsearchDiscoveryAdapter(),
    createGeminiGroundedDiscoveryAdapter(),
  ]
}

export function configuredDiscoveryAdapters(): DiscoveryAdapter[] {
  return allDiscoveryAdapters().filter((adapter) => adapter.isConfigured())
}
