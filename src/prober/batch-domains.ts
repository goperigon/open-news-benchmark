const BUSY_DOMAIN_PENDING_THRESHOLD = 20

export function batchDomains(
  domains: string[],
  batchSize: number,
  pendingByDomain?: ReadonlyMap<string, number>
): string[][] {
  const batches: string[][] = []
  let batch: string[] = []

  const flush = (): void => {
    if (batch.length > 0) {
      batches.push(batch)
      batch = []
    }
  }

  for (const domain of domains) {
    const pending = pendingByDomain?.get(domain) ?? 0
    if (pending >= BUSY_DOMAIN_PENDING_THRESHOLD) {
      flush()
      batches.push([domain])
      continue
    }
    batch.push(domain)
    if (batch.length >= batchSize) {
      flush()
    }
  }
  flush()
  return batches
}
