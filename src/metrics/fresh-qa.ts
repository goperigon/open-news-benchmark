export interface FreshQaMetrics {
  delayMinutes: number
  n: number
  accuracy: number
  notAttemptedRate: number
}

export function computeFreshQaMetrics(
  rows: Array<{ delayMinutes: number; grade: string }>
): FreshQaMetrics[] {
  const byDelay = new Map<number, string[]>()
  for (const row of rows) {
    const list = byDelay.get(row.delayMinutes) ?? []
    list.push(row.grade)
    byDelay.set(row.delayMinutes, list)
  }
  return [...byDelay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([delayMinutes, grades]) => {
      const graded = grades.filter((g) => g !== 'error')
      const n = graded.length
      const correct = graded.filter((g) => g === 'correct').length
      const notAttempted = graded.filter((g) => g === 'not_attempted').length
      return {
        delayMinutes,
        n,
        accuracy: n === 0 ? 0 : correct / n,
        notAttemptedRate: n === 0 ? 0 : notAttempted / n,
      }
    })
}
