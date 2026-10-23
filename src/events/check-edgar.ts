import { loadUniverse } from '../lib/load-config.ts'
import { buildCikIndex, entriesToUniverseEvents, fetchCurrent8KEntries } from '../anchors/edgar.ts'

export async function checkEdgarAnchors(): Promise<void> {
  const universe = loadUniverse()
  const byCik = buildCikIndex(universe.companies)
  const detectedAt = new Date().toISOString()
  const entries = await fetchCurrent8KEntries()
  if (!entries) {
    console.log('[events check] EDGAR feed unavailable (SEC_CONTACT_EMAIL set?)')
    return
  }
  const matches = entriesToUniverseEvents(entries, byCik, detectedAt)
  console.log(`[events check] universe=${universe.companies.length} feed=${entries.length} matches=${matches.length}`)
  for (const event of matches.slice(0, 10)) {
    console.log(`  ${event.ticker} items=${event.itemTypes.join(',')} anchor=${event.anchorAt}`)
  }
}
