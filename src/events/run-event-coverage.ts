import type { Database } from 'bun:sqlite'

import { loadEventCoverageConfig, loadFreshQaConfig, loadUniverse } from '../lib/load-config.ts'
import { fileHash } from '../lib/hash.ts'
import { eventCoverageConfigPath, universePath } from '../lib/paths.ts'
import { sleepUntil } from '../lib/concurrency.ts'
import { configuredProviders } from '../providers/registry.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import type { ProviderAdapter } from '../providers/types.ts'
import { insertRun, finishRun } from '../store/db.ts'
import {
  insertBenchEvent,
  insertRunProvider,
  listBenchEvents,
  getEventObservation,
  type BenchEventRow,
} from '../store/event-db.ts'
import {
  buildCikIndex,
  entriesToUniverseEvents,
  fetchCurrent8KEntries,
  type DetectedEvent,
} from '../anchors/edgar.ts'
import { scheduledEventsDue } from '../anchors/scheduled.ts'
import { probeEventOffset, type ProbeContext } from './probe-event.ts'
import { probeOffsetsForEvent } from './schedule.ts'
import { ProviderBudgetTracker } from './budget.ts'
import { maybeWriteQaForEvent, runFreshQaDue } from '../qa/run-fresh-qa.ts'

export interface EventCoverageRunOptions {
  runId: string
  db: Database
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
    if ((await proc.exited) === 0 && out.trim()) {
      return out.trim()
    }
  } catch {
    // ignore
  }
  return 'unknown'
}

function toBenchRow(runId: string, event: DetectedEvent): BenchEventRow {
  return {
    id: event.id,
    run_id: runId,
    anchor_source: event.anchorSource,
    anchor_at: event.anchorAt,
    detected_at: event.detectedAt,
    accession_number: event.accessionNumber,
    cik: event.cik,
    ticker: event.ticker,
    company_name: event.companyName,
    tier: event.tier,
    item_types: JSON.stringify(event.itemTypes),
    edgar_link: event.edgarLink,
    scheduled_name: null,
    probe_terms: null,
  }
}

function scheduledToBench(runId: string, event: ReturnType<typeof scheduledEventsDue>[number]): BenchEventRow {
  return {
    id: event.id,
    run_id: runId,
    anchor_source: event.anchorSource,
    anchor_at: event.anchorAt,
    detected_at: event.detectedAt,
    accession_number: null,
    cik: null,
    ticker: null,
    company_name: null,
    tier: null,
    item_types: JSON.stringify(event.itemTypes),
    edgar_link: null,
    scheduled_name: event.name,
    probe_terms: JSON.stringify(event.probeTerms),
  }
}

function providerTimingMs(config: ReturnType<typeof loadEventCoverageConfig>, provider: ProviderAdapter): number {
  return Math.max(60_000, provider.capabilities.minPollIntervalMs)
}

async function ingestAnchors(
  db: Database,
  runId: string,
  seenEventIds: Set<string>
): Promise<number> {
  const universe = loadUniverse()
  const byCik = buildCikIndex(universe.companies)
  const detectedAt = new Date().toISOString()
  let added = 0

  const entries = await fetchCurrent8KEntries()
  if (entries) {
    for (const event of entriesToUniverseEvents(entries, byCik, detectedAt)) {
      if (seenEventIds.has(event.id)) {
        continue
      }
      if (insertBenchEvent(db, toBenchRow(runId, event))) {
        seenEventIds.add(event.id)
        added += 1
        console.log(`[event-coverage] + ${event.ticker} ${event.itemTypes.join(',')} @ ${event.anchorAt}`)
        if (loadFreshQaConfig().enabled) {
          await maybeWriteQaForEvent(db, runId, toBenchRow(runId, event))
        }
      }
    }
  }

  for (const event of scheduledEventsDue(Date.now())) {
    if (seenEventIds.has(event.id)) {
      continue
    }
    const row = scheduledToBench(runId, event)
    if (insertBenchEvent(db, row)) {
      seenEventIds.add(event.id)
      added += 1
      console.log(`[event-coverage] + scheduled ${event.name}`)
    }
  }

  return added
}

async function runProbeScheduler(
  ctx: ProbeContext,
  providers: ProviderAdapter[],
  endsAt: number,
  budgets: ProviderBudgetTracker
): Promise<void> {
  const config = ctx.config
  while (Date.now() < endsAt) {
    const now = Date.now()
    const events = listBenchEvents(ctx.db, ctx.runId)
    for (const event of events) {
      const anchorMs = Date.parse(event.anchor_at)
      const dueOffsets = probeOffsetsForEvent(anchorMs, config.probeOffsetsMinutes, now, endsAt)
      for (const provider of providers) {
        if (!budgets.canSpend(provider)) {
          continue
        }
        for (const offset of dueOffsets) {
          for (const mode of ['keyword', 'structured'] as const) {
            if (
              getEventObservation(ctx.db, ctx.runId, event.id, provider.id, mode)?.found_at
            ) {
              continue
            }
            const probed = ctx.db
              .prepare(
                `SELECT 1 FROM event_probes WHERE run_id = ? AND event_id = ? AND provider_id = ? AND offset_minutes = ? AND mode = ?`
              )
              .get(ctx.runId, event.id, provider.id, offset, mode)
            if (probed) {
              continue
            }
            budgets.spend(provider)
            await probeEventOffset(ctx, event, provider, offset, mode)
          }
        }
      }
      if (loadFreshQaConfig().enabled) {
        await runFreshQaDue(ctx.db, ctx.runId, event, providers, config, budgets)
      }
    }
    await sleepUntil(now + 10_000, endsAt)
  }
}

export async function startEventCoverageRun(options: EventCoverageRunOptions): Promise<void> {
  const config = loadEventCoverageConfig()
  const universe = loadUniverse()
  const universeHash = await fileHash(universePath())
  const configHash = await fileHash(eventCoverageConfigPath())
  const gitSha = options.harnessGitSha === 'auto' ? await getGitSha() : options.harnessGitSha
  const providers = options.providers ?? configuredProviders()
  const endsAt = Date.now() + options.durationMs

  insertRun(options.db, {
    id: options.runId,
    suite_id: 'event-coverage',
    started_at: new Date().toISOString(),
    panel_hash: universeHash,
    config_hash: configHash,
    harness_git_sha: gitSha,
    region: options.region,
  })

  for (const provider of providers) {
    insertRunProvider(options.db, {
      runId: options.runId,
      providerId: provider.id,
      status: provider.isConfigured() ? 'ran' : 'skipped_missing_key',
      declaredTier: provider.declaredTier(),
      timingResolutionMs: providerTimingMs(config, provider),
    })
  }
  for (const adapter of (await import('../providers/registry.ts')).allProviderAdapters()) {
    if (adapter.isConfigured() || providers.some((p) => p.id === adapter.id)) {
      continue
    }
    insertRunProvider(options.db, {
      runId: options.runId,
      providerId: adapter.id,
      status: 'skipped_missing_key',
      declaredTier: adapter.declaredTier(),
      timingResolutionMs: providerTimingMs(config, adapter),
    })
  }

  const companyByTicker = new Map(universe.companies.map((c) => [c.ticker, c]))
  const ctx: ProbeContext = {
    runId: options.runId,
    db: options.db,
    config,
    companyByTicker,
  }
  const budgets = new ProviderBudgetTracker()
  const seenEventIds = new Set<string>()

  console.log(`[event-coverage] run=${options.runId} durationMs=${options.durationMs}`)

  const anchorLoop = async () => {
    while (Date.now() < endsAt) {
      const cycleStart = Date.now()
      await ingestAnchors(options.db, options.runId, seenEventIds)
      await sleepUntil(cycleStart + config.anchorPollIntervalMs, endsAt)
    }
  }

  const activeProviders = providers.filter((p) => p.isConfigured() && adapterSupportsSearch(p))
  await Promise.all([anchorLoop(), runProbeScheduler(ctx, activeProviders, endsAt, budgets)])

  finishRun(options.db, options.runId, new Date().toISOString())
  console.log(`[event-coverage] finished ${options.runId}`)
}
