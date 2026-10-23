export function probeOffsetsForEvent(
  anchorAtMs: number,
  offsetsMinutes: readonly number[],
  nowMs: number,
  runEndsAtMs: number
): number[] {
  const due: number[] = []
  for (const offset of offsetsMinutes) {
    const probeAt = anchorAtMs + offset * 60_000
    if (probeAt <= nowMs && probeAt <= runEndsAtMs) {
      due.push(offset)
    }
  }
  return due
}

export function nextProbeWakeMs(
  anchorAtMs: number,
  offsetsMinutes: readonly number[],
  nowMs: number,
  runEndsAtMs: number
): number | null {
  let next: number | null = null
  for (const offset of offsetsMinutes) {
    const probeAt = anchorAtMs + offset * 60_000
    if (probeAt <= nowMs || probeAt > runEndsAtMs) {
      continue
    }
    if (next === null || probeAt < next) {
      next = probeAt
    }
  }
  return next
}

export function sinceIsoForEvent(anchorAtMs: number, preAnchorWindowMs: number): string {
  return new Date(anchorAtMs - preAnchorWindowMs).toISOString()
}

export function timeToCoverageMs(anchorAtMs: number, foundAtMs: number, preAnchorWindowMs: number): {
  ms: number
  preAnchor: boolean
} {
  const windowStart = anchorAtMs - preAnchorWindowMs
  const preAnchor = foundAtMs < anchorAtMs
  const ms = preAnchor ? 0 : foundAtMs - anchorAtMs
  if (foundAtMs < windowStart) {
    return { ms: 0, preAnchor: true }
  }
  return { ms: Math.max(0, ms), preAnchor }
}
