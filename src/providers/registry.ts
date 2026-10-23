import type { ProviderAdapter } from './types.ts'
import { createPerigonAdapter } from './perigon.ts'
import { createGoogleNewsRssAdapter } from './google-news-rss.ts'
import { createNewsCatcherAdapter } from './newscatcher.ts'
import { createEventRegistryAdapter } from './eventregistry.ts'
import { createWebzAdapter } from './webz.ts'
import { createNewsDataAdapter } from './newsdata.ts'
import { createNewsApiOrgAdapter } from './newsapi-org.ts'
import { createGNewsAdapter } from './gnews.ts'

export function allProviderAdapters(): ProviderAdapter[] {
  return [
    createPerigonAdapter(),
    createGoogleNewsRssAdapter(),
    createNewsCatcherAdapter(),
    createEventRegistryAdapter(),
    createWebzAdapter(),
    createNewsDataAdapter(),
    createNewsApiOrgAdapter(),
    createGNewsAdapter(),
  ]
}

export function configuredProviders(adapters = allProviderAdapters()): ProviderAdapter[] {
  return adapters.filter((a) => a.isConfigured())
}
