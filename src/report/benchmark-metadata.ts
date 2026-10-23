import { loadEventCoverageConfig, loadFreshQaConfig, loadFreshQaStaticConfig } from '../lib/load-config.ts'
import type { BenchmarkResults } from '../schema/results.ts'

export function readFeatureFlags(): {
  freshQa: boolean
  freshQaStatic: boolean
  relevanceJudge: boolean
} {
  const liveQa = loadFreshQaConfig()
  return {
    freshQa: liveQa.enabled || liveQa.article.enabled,
    freshQaStatic: loadFreshQaStaticConfig().enabled,
    relevanceJudge: loadEventCoverageConfig().relevanceJudgeEnabled,
  }
}

export function deriveBenchmarkProductVersion(flags: {
  freshQa: boolean
  freshQaStatic: boolean
  relevanceJudge: boolean
}): 'v1' | 'v2' {
  return flags.freshQa || flags.freshQaStatic || flags.relevanceJudge ? 'v2' : 'v1'
}

export function attachBenchmarkMetadata(
  partial: Omit<BenchmarkResults, 'benchmarkProductVersion' | 'sourceRuns'>,
  options?: {
    sourceRuns?: BenchmarkResults['sourceRuns']
  }
): BenchmarkResults {
  return {
    ...partial,
    benchmarkProductVersion: deriveBenchmarkProductVersion(readFeatureFlags()),
    sourceRuns: options?.sourceRuns,
  }
}
