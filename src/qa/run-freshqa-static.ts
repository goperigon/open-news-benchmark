import type { Database } from 'bun:sqlite'
import { loadFreshQaStaticConfig } from '../lib/load-config.ts'
import { freshQaStaticDatasetPath } from '../lib/paths.ts'
import { fileHash } from '../lib/hash.ts'
import { configuredProviders } from '../providers/registry.ts'
import { adapterSupportsSearch } from '../providers/types.ts'
import { insertRun, finishRun } from '../store/db.ts'
import { insertRunProvider, hasStaticQaResult, insertStaticQaResult } from '../store/event-db.ts'
import { freshQaStaticConfigPath } from '../lib/paths.ts'
import { filterFreshQaStaticQuestions, loadFreshQaDataset } from './freshqa-dataset.ts'
import { verifyDatasetSha256 } from './fetch-freshqa-dataset.ts'
import { rewriteQuery } from './rewrite-query.ts'
import { probeQuestion } from './probe-question.ts'
import { mapWithConcurrency } from '../lib/concurrency.ts'
import { openAiConfigured } from '../llm/openai.ts'

export interface FreshQaStaticRunOptions {
  runId: string
  db: Database
  harnessGitSha: string
  region: string
  limit?: number
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
    // ignore
  }
  return 'unknown'
}

export async function startFreshQaStaticRun(options: FreshQaStaticRunOptions): Promise<void> {
  if (!openAiConfigured()) {
    throw new Error('[freshqa-static] OPENAI_API_KEY required')
  }
  const config = loadFreshQaStaticConfig()
  if (!config.enabled) {
    throw new Error('[freshqa-static] suite disabled in suites/freshqa-static/config.json')
  }
  const csvPath = freshQaStaticDatasetPath(config.datasetFile)
  await verifyDatasetSha256(csvPath)
  const loaded = loadFreshQaDataset(csvPath, config.split)
  const filtered = filterFreshQaStaticQuestions(loaded, config)
  const limited = options.limit ? filtered.slice(0, options.limit) : filtered
  if (limited.length === 0) {
    throw new Error('[freshqa-static] no questions loaded (check split and CSV)')
  }

  const configHash = await fileHash(freshQaStaticConfigPath())
  const datasetHash = await fileHash(csvPath)
  const panelHash = datasetHash
  const gitSha = options.harnessGitSha === 'auto' ? await getGitSha() : options.harnessGitSha
  const startedAt = new Date().toISOString()
  const sinceIso = new Date(Date.now() - config.lookbackDays * 86_400_000).toISOString()

  insertRun(options.db, {
    id: options.runId,
    suite_id: 'freshqa-static',
    started_at: startedAt,
    panel_hash: panelHash,
    config_hash: configHash,
    harness_git_sha: gitSha,
    region: options.region,
  })

  const providers = configuredProviders().filter((p) => adapterSupportsSearch(p))
  for (const provider of providers) {
    insertRunProvider(options.db, {
      runId: options.runId,
      providerId: provider.id,
      status: provider.isConfigured() ? 'ran' : 'skipped_missing_key',
      declaredTier: provider.declaredTier(),
      timingResolutionMs: provider.capabilities.minPollIntervalMs,
    })
  }

  console.log(
    `[freshqa-static] run=${options.runId} questions=${limited.length} providers=${providers.length}`
  )

  for (const provider of providers) {
    if (!provider.isConfigured()) {
      continue
    }
    await mapWithConcurrency(limited, config.concurrencyPerProvider, async (q) => {
      if (hasStaticQaResult(options.db, options.runId, q.id, provider.id)) {
        return
      }
      const searchQuery = await rewriteQuery(options.db, q.question)
      const result = await probeQuestion(provider, {
        question: q.question,
        goldAnswers: q.goldAnswers,
        searchQuery,
        sinceIso,
        topK: config.topKArticles,
        grader: 'freshqa_relaxed',
      })
      insertStaticQaResult(options.db, {
        runId: options.runId,
        questionId: q.id,
        providerId: provider.id,
        searchQuery,
        synthesizedAnswer: result.answer,
        grade: result.grade,
        responseMs: result.responseMs,
        error: result.error,
      })
    })
  }

  finishRun(options.db, options.runId, new Date().toISOString())
  console.log(`[freshqa-static] finished ${options.runId}`)
}
