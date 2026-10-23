export interface FirstFoundInput {
  articleId: number
  findings: Array<{ providerId: string; timeToIndexMs: number }>
}

export interface FirstFoundPairResult {
  providerA: string
  providerB: string
  aFirstShare: number
  medianLeadMinutesWhenAFirst: number | null
}

export function computeFirstFoundPairs(
  providerA: string,
  providerB: string,
  rows: FirstFoundInput[]
): FirstFoundPairResult {
  let comparable = 0
  let aFirst = 0
  const leadsMinutes: number[] = []

  for (const row of rows) {
    const a = row.findings.find((f) => f.providerId === providerA)
    const b = row.findings.find((f) => f.providerId === providerB)
    if (!a || !b) {
      continue
    }
    comparable += 1
    if (a.timeToIndexMs < b.timeToIndexMs) {
      aFirst += 1
      leadsMinutes.push((b.timeToIndexMs - a.timeToIndexMs) / 60_000)
    } else if (a.timeToIndexMs === b.timeToIndexMs) {
      aFirst += 0.5
    }
  }

  const medianLead =
    leadsMinutes.length === 0
      ? null
      : [...leadsMinutes].sort((x, y) => x - y)[Math.floor(leadsMinutes.length / 2)] ?? null

  return {
    providerA,
    providerB,
    aFirstShare: comparable === 0 ? 0 : aFirst / comparable,
    medianLeadMinutesWhenAFirst: medianLead,
  }
}
