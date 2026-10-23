/** AI search / answer products are out of scope; only news data providers. */
export const OUT_OF_SCOPE_PROVIDER_ID_PATTERNS = [
  'tavily',
  'parallel',
  'perplexity',
  'brave',
  'serp',
] as const

export function isOutOfScopeProviderId(id: string): boolean {
  const lower = id.toLowerCase()
  return OUT_OF_SCOPE_PROVIDER_ID_PATTERNS.some(
    (pattern) =>
      lower === pattern ||
      lower.startsWith(`${pattern}_`) ||
      lower.endsWith(`_${pattern}`) ||
      lower.includes(`_${pattern}_`)
  )
}
