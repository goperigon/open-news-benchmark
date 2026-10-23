export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) {
        continue
      }
      results[index] = await fn(item)
    }
  })
  await Promise.all(workers)
  return results
}

/** Sleeps until `targetMs`, but never past `deadlineMs`. */
export async function sleepUntil(targetMs: number, deadlineMs: number): Promise<void> {
  const wakeAt = Math.min(targetMs, deadlineMs)
  const delay = wakeAt - Date.now()
  if (delay > 0) {
    await Bun.sleep(delay)
  }
}
