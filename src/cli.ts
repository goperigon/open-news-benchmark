#!/usr/bin/env bun
import { randomUUID } from 'node:crypto'

import { loadLatencyConfig, loadPanel } from './lib/load-config.ts'
import { defaultDbPath } from './lib/paths.ts'
import { openDatabase } from './store/db.ts'
import { startLatencyRun } from './prober/run-loop.ts'
import { runDoctor } from './providers/doctor.ts'
import { buildSummary } from './report/build-summary.ts'
import { exportRunCsv } from './report/export-csv.ts'
import { publishResults } from './report/publish.ts'

function usage(): void {
  console.log(`Open News Benchmark

Usage:
  bun run bench doctor [--skip-probe]
  bun run bench run [--duration <ms|quick|default>] [--run-id <id>] [--db <path>] [--target-articles <n>] [--drain-ms <ms>]
  bun run bench report --run-id <id> [--db <path>] [--publish]
  bun run bench export --run-id <id> [--db <path>]
  bun run bench audit-misses --run-id <id> --provider <id> [--n 50]
  bun run bench db merge-run --from-db <path> --run-id <id> [--db <target>]
  bun run bench panel-check [--apply]
`)
}

function parseArgs(argv: string[]): Map<string, string | boolean> {
  const args = new Map<string, string | boolean>()
  const tokens = [...argv]
  while (tokens.length > 0) {
    const token = tokens.shift()
    if (!token) {
      break
    }
    if (!token.startsWith('--')) {
      const existing = args.get('_command')
      args.set('_command', existing ? `${existing} ${token}` : token)
      continue
    }
    const key = token.slice(2)
    const next = tokens[0]
    if (!next || next.startsWith('--')) {
      args.set(key, true)
    } else {
      args.set(key, tokens.shift() ?? '')
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const command = String(args.get('_command') ?? '')

  if (!command || command === 'help' || args.has('help')) {
    usage()
    return
  }

  if (command === 'doctor') {
    const skipProbe = args.has('skip-probe')
    const lines = skipProbe
      ? (await import('./providers/registry.ts')).allProviderAdapters().map((adapter) => ({
          id: adapter.id,
          displayName: adapter.displayName,
          status: adapter.isConfigured() ? ('ready' as const) : ('missing_key' as const),
          missingEnv: adapter.isConfigured() ? [] : [...adapter.requiredEnv],
          declaredTier: adapter.declaredTier(),
        }))
      : await runDoctor()
    for (const line of lines) {
      console.log(`${line.status.padEnd(14)} ${line.id} (${line.displayName})`)
      if (line.missingEnv.length > 0) {
        console.log(`               missing: ${line.missingEnv.join(', ')}`)
      }
      if ('message' in line && line.message) {
        console.log(`               ${line.message}`)
      }
    }
    return
  }

  if (command === 'run') {
    const baseConfig = loadLatencyConfig()
    const targetArg = args.get('target-articles')
    const drainArg = args.get('drain-ms')
    const config = {
      ...baseConfig,
      ...(typeof targetArg === 'string' && Number(targetArg) > 0
        ? { targetArticleCount: Number(targetArg) }
        : {}),
      ...(typeof drainArg === 'string' && Number(drainArg) >= 0
        ? { coverageWindowMs: Number(drainArg) }
        : {}),
    }
    const panel = loadPanel()
    let durationMs = config.defaultRunDurationMs
    const durationArg = args.get('duration')
    if (durationArg === 'quick') {
      durationMs = config.quickRunDurationMs
    } else if (typeof durationArg === 'string' && durationArg !== 'default') {
      durationMs = Number(durationArg)
    }
    const runId = typeof args.get('run-id') === 'string' ? String(args.get('run-id')) : randomUUID()
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const region = process.env.BENCH_REGION ?? 'unknown'
    await startLatencyRun({
      runId,
      db,
      panelSources: panel.sources,
      config,
      durationMs,
      harnessGitSha: 'auto',
      region,
    })
    return
  }

  if (command === 'panel-check') {
    const { runPanelCheck } = await import('./panel/run-panel-check.ts')
    await runPanelCheck({ apply: args.has('apply') })
    return
  }

  if (command === 'report') {
    const runId = args.get('run-id')
    if (typeof runId !== 'string') {
      throw new Error('report requires --run-id')
    }
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const region = process.env.BENCH_REGION ?? 'unknown'
    const summary = buildSummary(db, runId, region)
    if (args.has('publish')) {
      const path = await publishResults(summary, runId)
      console.log(`[report] published ${path}`)
    } else {
      console.log(JSON.stringify(summary, null, 2))
    }
    return
  }

  if (command === 'audit-misses') {
    const runId = args.get('run-id')
    const providerId = args.get('provider')
    if (typeof runId !== 'string' || typeof providerId !== 'string') {
      throw new Error('audit-misses requires --run-id and --provider')
    }
    const nArg = args.get('n')
    const n = typeof nArg === 'string' ? Number(nArg) : 50
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const { exportAuditMisses } = await import('./report/audit-misses.ts')
    const sampleN = Number.isFinite(n) && n > 0 ? n : 50
    const path = exportAuditMisses(db, runId, providerId, sampleN)
    console.log(`[audit-misses] wrote ${path}`)
    return
  }

  if (command === 'export') {
    const runId = args.get('run-id')
    if (typeof runId !== 'string') {
      throw new Error('export requires --run-id')
    }
    const dbPath = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const db = openDatabase(dbPath)
    const paths = exportRunCsv(db, runId)
    console.log(`[export] ${paths.articlesPath}`)
    console.log(`[export] ${paths.obsPath}`)
    return
  }

  if (command === 'db merge-run') {
    const fromDb = args.get('from-db')
    const runId = args.get('run-id')
    if (typeof fromDb !== 'string' || typeof runId !== 'string') {
      throw new Error('db merge-run requires --from-db and --run-id')
    }
    const toDb = typeof args.get('db') === 'string' ? String(args.get('db')) : defaultDbPath()
    const { copyRunBetweenDatabases } = await import('./store/copy-run.ts')
    copyRunBetweenDatabases(fromDb, toDb, runId)
    console.log(`[db merge-run] copied ${runId} from ${fromDb} → ${toDb}`)
    return
  }

  usage()
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
