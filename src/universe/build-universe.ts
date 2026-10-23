import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { fetchText } from '../lib/http.ts'
import { fetchSec } from '../lib/sec-http.ts'
import { universePath } from '../lib/paths.ts'
import { UniverseFileSchema } from '../schema/universe.ts'
import { aliasesForCompanyName } from './aliases.ts'

const SP500_CSV =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv'
const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers.json'

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x1_0000_0000
  }
}

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = items[i]
    items[i] = items[j] as T
    items[j] = tmp as T
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
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

async function loadSecCikByTicker(): Promise<Map<string, { cik: string; name: string }>> {
  const response = await fetchSec(SEC_TICKERS, 30_000)
  if (!response?.ok) {
    throw new Error('[universe] failed to fetch SEC company_tickers.json')
  }
  const raw = JSON.parse(response.text) as Record<string, { cik_str: number; ticker: string; title: string }>
  const map = new Map<string, { cik: string; name: string }>()
  for (const entry of Object.values(raw)) {
    const ticker = entry.ticker.toUpperCase()
    map.set(ticker, { cik: String(entry.cik_str).padStart(10, '0'), name: entry.title })
  }
  return map
}

async function loadSp500Tickers(): Promise<Array<{ ticker: string; name: string }>> {
  const response = await fetchText(SP500_CSV, 30_000)
  if (!response?.ok) {
    throw new Error('[universe] failed to fetch S&P 500 constituents CSV')
  }
  const lines = response.text.trim().split(/\r?\n/)
  const header = parseCsvLine(lines[0] ?? '')
  const symIdx = header.indexOf('Symbol')
  const nameIdx = header.indexOf('Security')
  if (symIdx < 0 || nameIdx < 0) {
    throw new Error('[universe] unexpected S&P 500 CSV shape')
  }
  const rows: Array<{ ticker: string; name: string }> = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue
    }
    const cols = parseCsvLine(line)
    const ticker = cols[symIdx]?.trim().toUpperCase()
    const name = cols[nameIdx]?.trim()
    if (ticker && name) {
      rows.push({ ticker, name })
    }
  }
  return rows
}

/** Mid/small: all SEC tickers not in S&P 500, sampled with seed. */
function sampleSmallMid(
  sec: Map<string, { cik: string; name: string }>,
  sp500Tickers: Set<string>,
  sampleSize: number,
  seed: number
): Array<{ ticker: string; name: string; cik: string }> {
  const pool: Array<{ ticker: string; name: string; cik: string }> = []
  for (const [ticker, info] of sec) {
    if (sp500Tickers.has(ticker)) {
      continue
    }
    if (!/^[A-Z0-9.-]{1,6}$/.test(ticker)) {
      continue
    }
    pool.push({ ticker, name: info.name, cik: info.cik })
  }
  shuffleInPlace(pool, seededRandom(seed))
  return pool.slice(0, sampleSize)
}

export interface BuildUniverseOptions {
  seed?: number
  smallmidSampleSize?: number
  snapshotDate?: string
}

export async function buildUniverse(options: BuildUniverseOptions = {}): Promise<void> {
  const seed = options.seed ?? 42
  const smallmidSampleSize = options.smallmidSampleSize ?? 300
  const snapshotDate = options.snapshotDate ?? new Date().toISOString().slice(0, 10)

  const sec = await loadSecCikByTicker()
  const sp500Rows = await loadSp500Tickers()
  const sp500Set = new Set(sp500Rows.map((r) => r.ticker))

  const companies = []
  for (const row of sp500Rows) {
    const secRow = sec.get(row.ticker)
    const name = secRow?.name ?? row.name
    const cik = secRow?.cik
    if (!cik) {
      continue
    }
    companies.push({
      ticker: row.ticker,
      cik,
      name,
      aliases: aliasesForCompanyName(name),
      tier: 'sp500' as const,
    })
  }

  for (const row of sampleSmallMid(sec, sp500Set, smallmidSampleSize, seed)) {
    companies.push({
      ticker: row.ticker,
      cik: row.cik,
      name: row.name,
      aliases: aliasesForCompanyName(row.name),
      tier: 'smallmid' as const,
    })
  }

  const file = UniverseFileSchema.parse({
    schemaVersion: 1,
    snapshotDate,
    sampleSeed: seed,
    smallmidSampleSize,
    companies,
  })

  const path = universePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`)
  console.log(
    `[universe-build] wrote ${path} (${file.companies.length} companies, sp500=${sp500Set.size}, smallmid sample=${smallmidSampleSize})`
  )
}
