import type { Database } from 'bun:sqlite'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { listQaItems, listBenchEvents } from '../store/event-db.ts'
import { resultsDir } from '../lib/paths.ts'

export async function exportFreshQaCsv(db: Database, runId: string): Promise<string> {
  const items = listQaItems(db, runId)
  const events = new Map(listBenchEvents(db, runId).map((e) => [e.id, e]))
  const lines = ['problem,answer,metadata']
  for (const item of items) {
    const event = events.get(item.event_id)
    const metadata = JSON.stringify({
      runId,
      eventId: item.event_id,
      anchorAt: event?.anchor_at,
      ticker: event?.ticker,
      accession: event?.accession_number,
      evidence: item.evidence_quote,
    })
    const problem = item.question.replace(/"/g, '""')
    const answer = item.gold_answer.replace(/"/g, '""')
    const meta = metadata.replace(/"/g, '""')
    lines.push(`"${problem}","${answer}","${meta}"`)
  }
  const path = join(resultsDir(), `fresh-qa-${runId}.csv`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${lines.join('\n')}\n`)
  return path
}
