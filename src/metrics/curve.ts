const CURVE_MINUTES = [1, 5, 15, 30, 60, 120, 360, 720, 1440] as const

export function buildTimeToIndexCurve(
  timeToIndexMs: Array<number | null>,
  articleCount: number
): Array<{ minutes: number; cumulativeShare: number }> {
  if (articleCount === 0) {
    return []
  }
  return CURVE_MINUTES.map((minutes) => {
    const thresholdMs = minutes * 60_000
    const found = timeToIndexMs.filter(
      (value) => value !== null && value <= thresholdMs
    ).length
    return { minutes, cumulativeShare: found / articleCount }
  })
}

export function shareFoundWithin(
  timeToIndexMs: Array<number | null>,
  articleCount: number,
  minutes: number
): number {
  if (articleCount === 0) {
    return 0
  }
  const thresholdMs = minutes * 60_000
  const found = timeToIndexMs.filter(
    (value) => value !== null && value <= thresholdMs
  ).length
  return found / articleCount
}
