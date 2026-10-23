import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { BenchmarkResults } from '../schema/results.ts'
import { resultsDir } from '../lib/paths.ts'

export async function publishResults(results: BenchmarkResults, runId: string): Promise<string> {
  mkdirSync(resultsDir(), { recursive: true })
  const dated = join(resultsDir(), `${runId}.json`)
  const latest = join(resultsDir(), 'latest.json')
  const payload = `${JSON.stringify(results, null, 2)}\n`
  writeFileSync(dated, payload)
  writeFileSync(latest, payload)

  if (process.env.S3_BUCKET && process.env.S3_PUBLIC_BASE_URL) {
    console.log(
      `[publish] Wrote ${latest}. Upload to ${process.env.S3_PUBLIC_BASE_URL}/latest.json (see deploy/README.md).`
    )
  }

  return latest
}
