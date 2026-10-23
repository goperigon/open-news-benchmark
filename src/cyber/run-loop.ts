import type { Database } from 'bun:sqlite'

import type { CyberBreachConfig } from '../schema/cyber-breach.ts'
import type { PanelSource } from '../schema/panel.ts'
import { BaselineTracker, isPlausiblyNew } from '../ground-truth/baseline-tracker.ts'
import {
  pollSource,
  persistDiscoveredArticles,
} from '../ground-truth/poller.ts'
import { configuredDiscoveryAdapters } from '../discovery/registry.ts'
import { fileHash } from '../lib/hash.ts'
import { mapWithConcurrency, sleepUntil } from '../lib/concurrency.ts'
import { cyberBreachConfigPath, cyberBreachPanelPath } from '../lib/paths.ts'
import { finishRun, getArticle, insertRun } from '../store/db.ts'
import { countCyberIncidents } from '../store/cyber-db.ts'
import { maybeCreateIncidentFromArticle } from './incident-builder.ts'
import { recordClaimsForPoll } from './matcher.ts'

const GROUND_TRUTH_CONCURRENCY = 12

export interface CyberRunOptions {
  runId: string
  db: Database
  panelSources: PanelSource[]
  config: CyberBreachConfig
  durationMs: number
  targetIncidentCount: number
  trackingWindowMs: number
  harnessGitSha: string
  region: string
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
    // git unavailable
  }
  return 'unknown'
}

async function runGroundTruthLoop(options: CyberRunOptions, collectionEndsAt: number): Promise<void> {
  const tracker = new BaselineTracker()
  const intervalMs = options.config.groundTruthPollIntervalMs
  const persistConfig = {
    trackingWindowMs: options.trackingWindowMs,
    targetArticleCount: 10_000,
    maxArticlesPerDomain: 200,
  }

  while (Date.now() < collectionEndsAt) {
    const incidents = countCyberIncidents(options.db, options.runId)
    if (incidents >= options.targetIncidentCount) {
      console.log(`[cyber-gt] ${incidents}/${options.targetIncidentCount} incidents — target reached`)
      break
    }

    const cycleStart = Date.now()
    await mapWithConcurrency(options.panelSources, GROUND_TRUTH_CONCURRENCY, async (source) => {
      const result = await pollSource(source)
      const observedAtMs = Date.now()
      const observedAt = new Date(observedAtMs).toISOString()
      for (const channel of ['feed', 'sitemap'] as const) {
        const unseen = tracker.ingest(source.domain, channel, result[channel])
        const fresh = unseen.filter((item) =>
          isPlausiblyNew(item, observedAtMs, options.config.maxPublisherAgeMs)
        )
        persistDiscoveredArticles(
          options.db,
          options.runId,
          fresh,
          observedAt,
          persistConfig,
          (articleId) => {
            const row = getArticle(options.db, options.runId, articleId)
            if (row) {
              maybeCreateIncidentFromArticle(options.db, options.runId, options.config, {
                title: row.title,
                url: row.url,
                first_seen_at: row.first_seen_at,
              })
            }
          }
        )
      }
    })

    console.log(
      `[cyber-gt] incidents=${countCyberIncidents(options.db, options.runId)}/${options.targetIncidentCount}`
    )
    await sleepUntil(cycleStart + intervalMs, collectionEndsAt + options.trackingWindowMs)
  }
}

async function runDiscoveryLoop(
  options: CyberRunOptions,
  endsAt: number,
  lastPollByParticipant: Map<string, string>
): Promise<void> {
  const adapters = configuredDiscoveryAdapters()
  const intervalMs = options.config.discoveryPollIntervalMs

  while (Date.now() < endsAt) {
    const cycleStart = Date.now()
    const sinceDefault = new Date(cycleStart - intervalMs).toISOString()

    for (const adapter of adapters) {
      const sinceIso = lastPollByParticipant.get(adapter.id) ?? sinceDefault
      const polledAt = new Date().toISOString()
      lastPollByParticipant.set(adapter.id, polledAt)

      const result = await adapter.poll(sinceIso)
      const status =
        result.status === 'ok'
          ? 'ran'
          : result.status === 'skipped_missing_key'
            ? 'skipped_missing_key'
            : 'skipped_error'

      await recordClaimsForPoll(
        options.db,
        options.runId,
        adapter.id,
        polledAt,
        result.incidents,
        result.responseMs,
        status,
        result.raw,
        options.config.incidentClusterWindowMs,
        options.trackingWindowMs
      )
      console.log(
        `[cyber-discovery] ${adapter.id} status=${status} claims=${result.incidents.length} ms=${Math.round(result.responseMs)}`
      )
    }

    await sleepUntil(cycleStart + intervalMs, endsAt)
  }
}

export async function startCyberBreachRun(options: CyberRunOptions): Promise<void> {
  const panelHash = await fileHash(cyberBreachPanelPath())
  const configHash = await fileHash(cyberBreachConfigPath())
  const startedAt = new Date().toISOString()
  const gitSha = options.harnessGitSha === 'auto' ? await getGitSha() : options.harnessGitSha

  insertRun(options.db, {
    id: options.runId,
    suite_id: 'cyber-breach',
    started_at: startedAt,
    panel_hash: panelHash,
    config_hash: configHash,
    harness_git_sha: gitSha,
    region: options.region,
  })

  const collectionEndsAt = Date.now() + options.durationMs
  const endsAt = collectionEndsAt + options.trackingWindowMs
  const lastPollByParticipant = new Map<string, string>()

  console.log(
    `[cyber run] id=${options.runId} collectionMs=${options.durationMs} trackingWindowMs=${options.trackingWindowMs} targetIncidents=${options.targetIncidentCount}`
  )

  await Promise.all([
    runGroundTruthLoop(options, collectionEndsAt),
    runDiscoveryLoop(options, endsAt, lastPollByParticipant),
  ])

  finishRun(options.db, options.runId, new Date().toISOString())
  console.log(`[cyber run] finished ${options.runId}`)
}
