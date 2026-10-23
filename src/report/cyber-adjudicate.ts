import type { Database } from 'bun:sqlite'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resultsDir } from '../lib/paths.ts'
import { listCyberClaims } from '../store/cyber-db.ts'
import { upsertCyberAdjudication } from '../store/cyber-db.ts'

export function exportAdjudicationCsv(db: Database, runId: string): string {
  const claims = listCyberClaims(db, runId)
  const lines = [
    'claim_id,participant_id,polled_at,short_description,verdict,reviewer,notes',
  ]
  for (const row of claims) {
    const parsed = JSON.parse(row.normalized_json) as { shortDescription?: string }
    const desc = (parsed.shortDescription ?? '').replaceAll('"', '""')
    lines.push(
      `${row.id},${row.participant_id},${row.polled_at},"${desc}",,,`
    )
  }
  const path = join(resultsDir(), `cyber-adjudicate-${runId}.csv`)
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

export function importAdjudicationCsv(db: Database, runId: string, csvPath: string): number {
  const text = readFileSync(csvPath, 'utf8')
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  let count = 0
  for (const line of lines.slice(1)) {
    const parts = parseCsvLine(line)
    if (parts.length < 5) {
      continue
    }
    const claimId = Number(parts[0])
    const verdict = parts[4]?.trim()
    if (!Number.isFinite(claimId) || !verdict) {
      continue
    }
    upsertCyberAdjudication(db, {
      run_id: runId,
      claim_id: claimId,
      verdict,
      reviewer: parts[5]?.trim() || undefined,
      notes: parts[6]?.trim() || undefined,
    })
    count += 1
  }
  return count
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}
