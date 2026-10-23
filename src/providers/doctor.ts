import { allProviderAdapters } from './registry.ts'

export interface DoctorLine {
  id: string
  displayName: string
  status: 'ready' | 'missing_key' | 'error'
  missingEnv: string[]
  declaredTier?: string
  message?: string
}

export async function runDoctor(): Promise<DoctorLine[]> {
  const lines: DoctorLine[] = []
  for (const adapter of allProviderAdapters()) {
    if (!adapter.isConfigured()) {
      lines.push({
        id: adapter.id,
        displayName: adapter.displayName,
        status: 'missing_key',
        missingEnv: [...adapter.requiredEnv],
        declaredTier: adapter.declaredTier(),
      })
      continue
    }
    try {
      const since = new Date(Date.now() - 3600_000).toISOString()
      await adapter.fetchRecent({ domains: ['reuters.com'], sinceIso: since })
      lines.push({
        id: adapter.id,
        displayName: adapter.displayName,
        status: 'ready',
        missingEnv: [],
        declaredTier: adapter.declaredTier(),
      })
    } catch (error) {
      lines.push({
        id: adapter.id,
        displayName: adapter.displayName,
        status: 'error',
        missingEnv: [],
        declaredTier: adapter.declaredTier(),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return lines
}
