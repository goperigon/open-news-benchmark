import type { EntityQueryCompany } from './types.ts'

export function companyKeywordPhrase(company: EntityQueryCompany): string {
  const parts = [company.name, ...company.aliases, company.ticker].filter(
    (p, i, arr) => p.length > 0 && arr.indexOf(p) === i
  )
  return parts.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR ')
}

export function eventTypeKeywords(itemTypes: string[] | undefined): string[] {
  if (!itemTypes || itemTypes.length === 0) {
    return []
  }
  const sets: Record<string, string[]> = {
    '2.02': ['earnings', 'results', 'revenue', 'eps', 'quarter', 'guidance', 'profit'],
    '5.02': ['ceo', 'cfo', 'director', 'officer', 'resign', 'appoint'],
    '1.01': ['agreement', 'contract', 'deal', 'partnership'],
    '2.01': ['acquisition', 'acquire', 'merger', 'completed'],
    '8.01': ['announce', 'update', 'disclosure'],
    macro: ['fed', 'fomc', 'jobs', 'cpi', 'inflation', 'rate'],
  }
  const keywords = new Set<string>()
  for (const item of itemTypes) {
    for (const kw of sets[item] ?? []) {
      keywords.add(kw)
    }
  }
  return [...keywords]
}
