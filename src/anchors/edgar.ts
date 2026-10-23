import type { UniverseCompany } from '../schema/universe.ts'
import { TRACKED_8K_ITEMS } from '../schema/event-coverage.ts'
import { fetchSec } from '../lib/sec-http.ts'
import {
  filterTrackedItems,
  parseEdgarCurrentAtom,
  type Parsed8KEntry,
} from './edgar-parse.ts'

export const EDGAR_CURRENT_8K_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom'

export interface DetectedEvent {
  id: string
  anchorSource: 'edgar_8k'
  anchorAt: string
  detectedAt: string
  accessionNumber: string
  cik: string
  ticker: string
  companyName: string
  tier: 'sp500' | 'smallmid'
  itemTypes: string[]
  edgarLink: string
}

function eventId(entry: Parsed8KEntry): string {
  return `edgar:${entry.accessionNumber}`
}

export function entriesToUniverseEvents(
  entries: Parsed8KEntry[],
  byCik: Map<string, UniverseCompany>,
  detectedAt: string
): DetectedEvent[] {
  const out: DetectedEvent[] = []
  for (const entry of entries) {
    const company = byCik.get(entry.cik)
    if (!company) {
      continue
    }
    const itemTypes = filterTrackedItems(entry.itemCodes, TRACKED_8K_ITEMS)
    if (itemTypes.length === 0) {
      continue
    }
    out.push({
      id: eventId(entry),
      anchorSource: 'edgar_8k',
      anchorAt: entry.anchorAt,
      detectedAt,
      accessionNumber: entry.accessionNumber,
      cik: entry.cik,
      ticker: company.ticker,
      companyName: company.name,
      tier: company.tier,
      itemTypes,
      edgarLink: entry.link,
    })
  }
  return out
}

export async function fetchCurrent8KEntries(): Promise<Parsed8KEntry[] | null> {
  const response = await fetchSec(EDGAR_CURRENT_8K_URL)
  if (!response?.ok) {
    return null
  }
  return parseEdgarCurrentAtom(response.text)
}

export function buildCikIndex(companies: UniverseCompany[]): Map<string, UniverseCompany> {
  const map = new Map<string, UniverseCompany>()
  for (const company of companies) {
    map.set(company.cik.padStart(10, '0'), company)
  }
  return map
}
