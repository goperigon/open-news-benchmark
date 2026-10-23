import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

import { loadCyberBreachConfig, loadCyberBreachPanel } from '../lib/load-config.ts'
import { defaultDbPath } from '../lib/paths.ts'
import { openDatabase } from '../store/db.ts'
import { startCyberBreachRun } from '../cyber/run-loop.ts'
import { buildSummary } from '../report/build-summary.ts'
import { publishResults } from '../report/publish.ts'
import { exportAdjudicationCsv, importAdjudicationCsv } from '../report/cyber-adjudicate.ts'
import { runCyberExtractTest } from '../report/cyber-extract-test.ts'
import { listCyberIncidents } from '../store/cyber-db.ts'

export async function handleCyberCommand(
  command: string,
  args: Map<string, string | boolean>
): Promise<boolean> {
  if (!command.startsWith('cyber')) {
    return false
  }

  if (command === 'cyber run') {
    const baseConfig = loadCyberBreachConfig()
    const panel = loadCyberBreachPanel()
    let durationMs = baseConfig.defaultRunDurationMs
    let targetIncidentCount = baseConfig.targetIncidentCount
    let trackingWindowMs = baseConfig.trackingWindowMs
    const durationArg = args.get('duration')
    if (durationArg === 'quick') {
      durationMs = baseConfig.quickRunDurationMs
      targetIncidentCount = baseConfig.quickTargetIncidentCount
      trackingWindowMs = baseConfig.quickTrackingWindowMs
    } else if (typeof durationArg === 'string' && durationArg !== 'default') {
      durationMs = Number(durationArg)
    }
    const targetArg = args.get('target-incidents')
    if (typeof targetArg === 'string' && Number(targetArg) > 0) {
      targetIncidentCount = Number(targetArg)
    }
    const windowArg = args.get('tracking-ms')
    if (typeof windowArg === 'string' && Number(windowArg) > 0) {
      trackingWindowMs = Number(windowArg)
    }
    const runId =
      typeof args.get('run-id') === 'string' ? String(args.get('run-id')) : `cyber-${randomUUID()}`
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const region = process.env.BENCH_REGION ?? 'unknown'
    await startCyberBreachRun({
      runId,
      db,
      panelSources: panel.sources,
      config: baseConfig,
      durationMs,
      targetIncidentCount,
      trackingWindowMs,
      harnessGitSha: 'auto',
      region,
    })
    return true
  }

  if (command === 'cyber report') {
    const runId = args.get('run-id')
    if (typeof runId !== 'string') {
      throw new Error('cyber report requires --run-id')
    }
    await cyberReport(args, runId)
    return true
  }

  if (command === 'cyber adjudicate export') {
    const runId = args.get('run-id')
    if (typeof runId !== 'string') {
      throw new Error('cyber adjudicate export requires --run-id')
    }
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const path = exportAdjudicationCsv(db, runId)
    console.log(`[cyber adjudicate] wrote ${path}`)
    return true
  }

  if (command === 'cyber adjudicate import') {
    const runId = args.get('run-id')
    const csv = args.get('csv')
    if (typeof runId !== 'string' || typeof csv !== 'string') {
      throw new Error('cyber adjudicate import requires --run-id and --csv')
    }
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const n = importAdjudicationCsv(db, runId, csv)
    console.log(`[cyber adjudicate] imported ${n} rows`)
    return true
  }

  if (command === 'cyber extract-test') {
    const runId =
      typeof args.get('run-id') === 'string' ? String(args.get('run-id')) : `cyber-extract-${randomUUID()}`
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const incidents = listCyberIncidents(db, runId)
    const articles = incidents.slice(0, 3).map((i) => ({
      url: i.primary_url,
      title: i.primary_title,
      body: i.primary_title,
    }))
    if (articles.length === 0) {
      articles.push({
        url: 'https://example.com/sample',
        title: 'Sample Corp discloses data breach affecting customer records',
        body: 'Sample Corp disclosed unauthorized access to customer records.',
      })
    }
    await runCyberExtractTest(db, runId, articles)
    console.log(`[cyber extract-test] recorded extractions for run ${runId}`)
    return true
  }

  return false
}

async function cyberReport(args: Map<string, string | boolean>, runId: string): Promise<true> {
  const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
  const db: Database = openDatabase(dbPath)
  const region = process.env.BENCH_REGION ?? 'unknown'
  const summary = buildSummary(db, runId, region)
  if (args.has('publish')) {
    const path = await publishResults(summary, runId)
    console.log(`[cyber report] published ${path}`)
  } else {
    console.log(JSON.stringify(summary, null, 2))
  }
  return true
}
