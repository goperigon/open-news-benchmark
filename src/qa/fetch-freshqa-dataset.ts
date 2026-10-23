import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { freshQaStaticConfigPath, freshQaStaticDataPath } from '../lib/paths.ts'
import { fileHash, sha256Hex } from '../lib/hash.ts'
import { loadFreshQaStaticConfig } from '../lib/load-config.ts'
import { readFileSync, writeFileSync } from 'node:fs'

export async function fetchFreshQaCsv(sheetId: string, outfileName?: string): Promise<{ path: string; sha256: string }> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[freshqa fetch] HTTP ${response.status}`)
  }
  const text = await response.text()
  const config = loadFreshQaStaticConfig()
  const fileName = outfileName ?? config.datasetFile
  const path = join(freshQaStaticDataPath(), fileName)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
  const sha256 = await sha256Hex(text)
  updateConfigSha256(sha256)
  return { path, sha256 }
}

function updateConfigSha256(sha256: string): void {
  const raw = JSON.parse(readFileSync(freshQaStaticConfigPath(), 'utf8')) as Record<string, unknown>
  raw.datasetSha256 = sha256
  writeFileSync(freshQaStaticConfigPath(), `${JSON.stringify(raw, null, 2)}\n`)
}

export async function verifyDatasetSha256(csvPath: string): Promise<void> {
  const config = loadFreshQaStaticConfig()
  if (!config.datasetSha256) {
    return
  }
  const actual = await fileHash(csvPath)
  if (actual !== config.datasetSha256) {
    throw new Error(
      `[freshqa] dataset sha256 mismatch (expected ${config.datasetSha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Run bench freshqa fetch.`
    )
  }
}
