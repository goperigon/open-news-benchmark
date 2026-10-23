import type { Database } from 'bun:sqlite'

import type { LatencyConfig, PanelSource } from '../schema/panel.ts'
import { BaselineTracker, isPlausiblyNew } from '../ground-truth/baseline-tracker.ts'
import {
  pollSource,
  persistDiscoveredArticles,
  scheduleCanonicalFetch,
} from '../ground-truth/poller.ts'
import { configuredProviders } from '../providers/registry.ts'
import type { ProviderAdapter } from '../providers/types.ts'
import { runProbeCycle } from './probe-cycle.ts'
import {
  insertRun,
  finishRun,
  countArticlesForRun,
  countArticlesFoundByProvider,
} from '../store/db.ts'
import { loadFreshQaConfig } from '../lib/load-config.ts'
import { runArticleQaLoop } from '../qa/run-article-qa.ts'
import { fileHash } from '../lib/hash.ts'
import { mapWithConcurrency, sleepUntil } from '../lib/concurrency.ts'
import { panelPath, latencyConfigPath } from '../lib/paths.ts'

const GROUND_TRUTH_CONCURRENCY = 16

export interface RunLoopOptions {
  runId: string
  db: Database
  panelSources: PanelSource[]
  config: LatencyConfig
  durationMs: number
  harnessGitSha: string
  region: string
  providers?: ProviderAdapter[]
}

async function getGitSha(): Promise<string> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--short', 'HEAD'], {
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const out = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code === 0 && out.trim()) {
      return out.trim()
    }
  } catch {
    // git unavailable; fall through
  }
  return 'unknown'
}

/** A provider is never polled faster than its own minimum interval. */
export function providerIntervalMs(config: LatencyConfig, provider: ProviderAdapter): number {
  return Math.max(config.providerProbeIntervalMs, provider.capabilities.minPollIntervalMs)
}

interface CollectionClock {
  stopMs: number | null
}

async function runGroundTruthLoop(
  options: RunLoopOptions,
  collectionEndsAt: number,
  clock: CollectionClock
): Promise<number> {
  const tracker = new BaselineTracker()
  const intervalMs = options.config.groundTruthPollIntervalMs
  let isFirstCycle = true
  const canonicalInFlight = new Set<number>()
  let lastDomainCapHit: string | null = null

  while (Date.now() < collectionEndsAt) {
    const total = countArticlesForRun(options.db, options.runId)
    if (total >= options.config.targetArticleCount) {
      clock.stopMs = Date.now()
      console.log(
        `[ground-truth] ${total}/${options.config.targetArticleCount} articles — collection target reached, draining until ${new Date(clock.stopMs + options.config.coverageWindowMs).toISOString()}`
      )
      break
    }

    const cycleStart = Date.now()
    let newArticles = 0
    let backlogArticles = 0

    await mapWithConcurrency(options.panelSources, GROUND_TRUTH_CONCURRENCY, async (source) => {
      const result = await pollSource(source)
      const observedAtMs = Date.now()
      const observedAt = new Date(observedAtMs).toISOString()
      for (const channel of ['feed', 'sitemap'] as const) {
        const unseen = tracker.ingest(source.domain, channel, result[channel])
        const fresh = unseen.filter((item) =>
          isPlausiblyNew(item, observedAtMs, options.config.maxPublisherAgeMs)
        )
        backlogArticles += unseen.length - fresh.length
        const { inserted, domainCapHit } = persistDiscoveredArticles(
          options.db,
          options.runId,
          fresh,
          observedAt,
          options.config,
          (articleId, url) => {
            scheduleCanonicalFetch(options.db, articleId, url, canonicalInFlight)
          }
        )
        newArticles += inserted
        if (domainCapHit) {
          lastDomainCapHit = domainCapHit
        }
      }
    })

    const afterTotal = countArticlesForRun(options.db, options.runId)
    const capNote =
      lastDomainCapHit !== null ? ` (per-site cap hit: ${lastDomainCapHit})` : ''
    console.log(`[ground-truth] ${afterTotal}/${options.config.targetArticleCount} articles${capNote}`)

    const cycleMs = Date.now() - cycleStart
    if (isFirstCycle) {
      console.log(
        `[ground-truth] baseline: ${tracker.baselineSize} existing URLs excluded (cycle ${cycleMs}ms)`
      )
      isFirstCycle = false
    } else if (newArticles > 0 || backlogArticles > 0) {
      console.log(
        `[ground-truth] +${newArticles} new articles, ${backlogArticles} resurfaced backlog skipped (cycle ${cycleMs}ms)`
      )
    }
    if (cycleMs > intervalMs) {
      console.warn(
        `[ground-truth] cycle took ${cycleMs}ms, longer than the ${intervalMs}ms poll interval; timing resolution is degraded`
      )
    }

    await sleepUntil(cycleStart + intervalMs, collectionEndsAt)
  }

  if (clock.stopMs === null) {
    clock.stopMs = Date.now()
    const total = countArticlesForRun(options.db, options.runId)
    console.log(
      `[ground-truth] ${total}/${options.config.targetArticleCount} articles — collection time limit reached, draining until ${new Date(clock.stopMs + options.config.coverageWindowMs).toISOString()}`
    )
  }
  return countArticlesForRun(options.db, options.runId)
}

function isDraining(clock: CollectionClock): boolean {
  return clock.stopMs !== null && Date.now() >= clock.stopMs
}

function logDrainProgress(
  options: RunLoopOptions,
  providerId: string,
  clock: CollectionClock,
  newFinds: number
): void {
  const stopMs = clock.stopMs
  if (stopMs === null) {
    return
  }
  const total = countArticlesForRun(options.db, options.runId)
  const found = countArticlesFoundByProvider(options.db, options.runId, providerId)
  const drainEndMs = stopMs + options.config.coverageWindowMs
  const remainingMin = Math.max(0, Math.ceil((drainEndMs - Date.now()) / 60_000))
  const findsNote = newFinds > 0 ? ` +${newFinds} this cycle` : ''
  console.log(
    `[drain] ${providerId} ${found}/${total} indexed, ${total - found} pending, ~${remainingMin}m left${findsNote}`
  )
}

async function runProviderLoop(
  options: RunLoopOptions,
  provider: ProviderAdapter,
  maxEndsAt: number,
  clock: CollectionClock
): Promise<void> {
  const intervalMs = providerIntervalMs(options.config, provider)
  const panelDomains = options.panelSources.map((s) => s.domain)

  const effectiveEndsAt = (): number =>
    clock.stopMs === null ? maxEndsAt : clock.stopMs + options.config.coverageWindowMs

  while (Date.now() < effectiveEndsAt()) {
    const cycleStart = Date.now()
    const sinceIso = new Date(cycleStart - options.config.trackingWindowMs).toISOString()
    const { newFinds } = await runProbeCycle(
      options.db,
      options.runId,
      provider,
      panelDomains,
      options.config.domainBatchSize,
      sinceIso
    )
    if (isDraining(clock)) {
      logDrainProgress(options, provider.id, clock, newFinds)
    }
    const cycleMs = Date.now() - cycleStart
    if (cycleMs > intervalMs) {
      console.warn(
        `[probe] ${provider.id} cycle took ${cycleMs}ms, longer than its ${intervalMs}ms interval`
      )
    }
    await sleepUntil(cycleStart + intervalMs, effectiveEndsAt())
  }
}

export async function startLatencyRun(options: RunLoopOptions): Promise<void> {
  const panelHash = await fileHash(panelPath())
  const configHash = await fileHash(latencyConfigPath())
  const startedAt = new Date().toISOString()
  const gitSha = options.harnessGitSha === 'auto' ? await getGitSha() : options.harnessGitSha

  insertRun(options.db, {
    id: options.runId,
    suite_id: 'latency',
    started_at: startedAt,
    panel_hash: panelHash,
    config_hash: configHash,
    harness_git_sha: gitSha,
    region: options.region,
  })

  const providers = options.providers ?? configuredProviders()
  const collectionEndsAt = Date.now() + options.durationMs
  const maxEndsAt = collectionEndsAt + options.config.coverageWindowMs
  const clock: CollectionClock = { stopMs: null }

  const schedule = providers
    .map((p) => `${p.id}@${providerIntervalMs(options.config, p)}ms`)
    .join(', ')
  console.log(
    `[run] id=${options.runId} collectionMs=${options.durationMs} coverageWindowMs=${options.config.coverageWindowMs} providers=${schedule}`
  )

  const qaConfig = loadFreshQaConfig()

  const groundTruthDone = runGroundTruthLoop(options, collectionEndsAt, clock)
  const providerLoops = providers.map((provider) =>
    runProviderLoop(options, provider, maxEndsAt, clock)
  )
  const loops: Promise<unknown>[] = [groundTruthDone, ...providerLoops]
  if (qaConfig.enabled && qaConfig.article.enabled) {
    loops.push(runArticleQaLoop(options.db, options.runId, providers, maxEndsAt))
  }
  await Promise.all(loops)

  finishRun(options.db, options.runId, new Date().toISOString())
  console.log(`[run] finished ${options.runId}`)
}
