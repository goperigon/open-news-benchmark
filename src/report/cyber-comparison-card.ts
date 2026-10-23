import type { CyberBreachSuiteResult } from '../schema/results.ts'

/** Plain-language summary for sales / homepage footnotes. */
export function buildCyberComparisonCard(
  providers: CyberBreachSuiteResult['providers']
): string {
  const monitor = providers.find((p) => p.id === 'perigon_monitor')
  const openai = providers.find((p) => p.id === 'openai_websearch')
  if (!monitor?.metrics || monitor.status !== 'ran') {
    return 'Cyber-breach run completed; Perigon Monitor was not configured or did not run.'
  }
  const mCov = Math.round((monitor.metrics.coveredWithin.m240 ?? 0) * 100)
  const mOrg = Math.round((monitor.metrics.enrichment?.orgNamesRate ?? 0) * 100)
  let line = `Perigon Monitor found ${mCov}% of verified incidents within the tracking window and named impacted organizations on ${mOrg}% of claims.`
  if (openai?.metrics && openai.status === 'ran') {
    const oCov = Math.round((openai.metrics.coveredWithin.m240 ?? 0) * 100)
    const oOrg = Math.round((openai.metrics.enrichment?.orgNamesRate ?? 0) * 100)
    line += ` OpenAI (web search) reached ${oCov}% coverage and ${oOrg}% org naming under the same protocol.`
  }
  line += ' See methodology for blind adjudication and pooled ground truth.'
  return line
}
