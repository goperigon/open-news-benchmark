import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Database } from 'bun:sqlite'

import { REPO_ROOT } from '../lib/paths.ts'
import { listNeverFoundArticles } from '../store/db.ts'

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j] as T
    out[j] = tmp as T
  }
  return out
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportAuditMisses(
  db: Database,
  runId: string,
  providerId: string,
  sampleSize: number
): string {
  const neverFound = listNeverFoundArticles(db, runId, providerId)
  const sample = shuffle(neverFound).slice(0, sampleSize)
  const lines = ['url,title,domain,first_seen_at,actually_present,notes']
  for (const row of sample) {
    lines.push(
      [
        csvEscape(row.url),
        csvEscape(row.title),
        csvEscape(row.domain),
        csvEscape(row.first_seen_at),
        '',
        '',
      ].join(',')
    )
  }
  const resultsDir = join(REPO_ROOT, 'results')
  mkdirSync(resultsDir, { recursive: true })
  const path = join(resultsDir, `audit-${runId}-${providerId}.csv`)
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
  return path
}
