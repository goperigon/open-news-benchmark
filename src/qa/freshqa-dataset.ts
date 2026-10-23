import { readFileSync } from 'node:fs'

import { parseCsv, csvRowToRecord } from '../lib/csv.ts'
import { createHash } from 'node:crypto'
import type { FreshQaStaticConfig, FreshQaStaticQuestion } from '../schema/freshqa-static.ts'

function findHeaderRow(rows: string[][]): { headerIndex: number; header: string[] } | null {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) {
      continue
    }
    const normalized = row.map((c) => c.trim().toLowerCase())
    if (normalized.includes('question')) {
      return { headerIndex: i, header: row.map((c) => c.trim()) }
    }
  }
  return null
}

function goldAnswersFromRecord(record: Record<string, string>): string[] {
  const answers: string[] = []
  for (let i = 0; i <= 9; i += 1) {
    const key = `answer_${i}`
    const val = record[key]?.trim()
    if (val) {
      answers.push(val)
    }
  }
  return answers
}

export function loadFreshQaDataset(csvPath: string, splitFilter?: string): FreshQaStaticQuestion[] {
  const text = readFileSync(csvPath, 'utf8')
  const rows = parseCsv(text)
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) {
    throw new Error(`[freshqa] no header row with "question" in ${csvPath}`)
  }
  const { headerIndex, header } = headerInfo
  const out: FreshQaStaticQuestion[] = []
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const cells = rows[i]
    if (!cells || cells.every((c) => !c.trim())) {
      continue
    }
    const record = csvRowToRecord(header, cells)
    const question = record.question?.trim()
    if (!question) {
      continue
    }
    const split = record.split?.trim() ?? ''
    if (splitFilter && split && split.toUpperCase() !== splitFilter.toUpperCase()) {
      continue
    }
    const goldAnswers = goldAnswersFromRecord(record)
    if (goldAnswers.length === 0) {
      continue
    }
    const id =
      record.id?.trim() ||
      createHash('sha256').update(question).digest('hex').slice(0, 16)
    out.push({
      id,
      question,
      goldAnswers,
      factType: record.fact_type?.trim() ?? record['Fact Type']?.trim() ?? 'unknown',
      numHops: record.num_hops?.trim() ?? record['Num Hops']?.trim() ?? 'unknown',
      falsePremise: record.false_premise?.trim() ?? record['False Premise']?.trim() ?? 'unknown',
      split,
    })
  }
  return out
}

export function filterFreshQaStaticQuestions(
  questions: FreshQaStaticQuestion[],
  config: Pick<FreshQaStaticConfig, 'factTypes' | 'includeFalsePremise'>
): FreshQaStaticQuestion[] {
  let filtered = questions
  if (config.factTypes.length > 0) {
    const allowed = new Set(config.factTypes.map((t) => t.toLowerCase()))
    filtered = filtered.filter((q) => allowed.has(q.factType.toLowerCase()))
  }
  if (!config.includeFalsePremise) {
    filtered = filtered.filter((q) => q.falsePremise.trim().toUpperCase() !== 'TRUE')
  }
  return filtered
}
