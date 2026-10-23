export interface StaticQaRow {
  questionId: string
  providerId: string
  grade: string
  responseMs: number
  error: string | null
  factType?: string
}

export interface StaticQaAggregate {
  n: number
  accuracy: number
  notAttemptedRate: number
  errorRate: number
  medianResponseMs: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

export function aggregateStaticQa(rows: StaticQaRow[]): StaticQaAggregate {
  const total = rows.length
  const errors = rows.filter((r) => r.grade === 'error' || r.error).length
  const graded = rows.filter((r) => r.grade !== 'error' && !r.error)
  const n = graded.length
  const correct = graded.filter((r) => r.grade === 'correct').length
  const notAttempted = graded.filter((r) => r.grade === 'not_attempted').length
  return {
    n,
    accuracy: n === 0 ? 0 : correct / n,
    notAttemptedRate: n === 0 ? 0 : notAttempted / n,
    errorRate: total === 0 ? 0 : errors / total,
    medianResponseMs: median(rows.map((r) => r.responseMs).filter((ms) => ms > 0)),
  }
}

export function aggregateStaticQaByFactType(
  rows: StaticQaRow[],
  factTypeByQuestion: Map<string, string>
): Array<{ factType: string; metrics: StaticQaAggregate }> {
  const byType = new Map<string, StaticQaRow[]>()
  for (const row of rows) {
    const ft = factTypeByQuestion.get(row.questionId) ?? 'unknown'
    const list = byType.get(ft) ?? []
    list.push(row)
    byType.set(ft, list)
  }
  return [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([factType, group]) => ({ factType, metrics: aggregateStaticQa(group) }))
}
