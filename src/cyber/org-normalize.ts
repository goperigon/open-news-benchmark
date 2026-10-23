const GENERIC = new Set([
  'unknown',
  'unnamed',
  'undisclosed',
  'various',
  'multiple',
  'unidentified',
  'na',
  'none',
  'company',
])

export function normalizeOrgName(name: string): string {
  let s = name.toLowerCase().trim()
  s = s.replace(/\b(inc|corp|corporation|ltd|llc|plc|co|company|group|the)\b/g, ' ')
  s = s.replace(/[^a-z0-9]+/g, '')
  return s
}

export function orgKeysFromNames(names: readonly string[]): string[] {
  const keys = new Set<string>()
  for (const name of names) {
    const key = normalizeOrgName(name)
    if (key.length >= 3 && !GENERIC.has(key)) {
      keys.add(key)
    }
  }
  return [...keys]
}

export function orgKeysOverlap(a: readonly string[], b: readonly string[]): boolean {
  const setB = new Set(b)
  return a.some((k) => setB.has(k))
}
