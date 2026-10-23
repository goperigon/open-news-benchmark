import { decodeEntities } from '../ground-truth/rss.ts'

export interface Parsed8KEntry {
  accessionNumber: string
  cik: string
  title: string
  anchorAt: string
  itemCodes: string[]
  link: string
}

const ITEM_CODE_RE = /\b(\d\.\d{2})\b/g

export function parse8KItemCodes(text: string): string[] {
  const codes = new Set<string>()
  for (const match of text.matchAll(ITEM_CODE_RE)) {
    const code = match[1]
    if (code) {
      codes.add(code)
    }
  }
  return [...codes]
}

export function filterTrackedItems(codes: string[], tracked: readonly string[]): string[] {
  const trackedSet = new Set(tracked)
  return codes.filter((c) => trackedSet.has(c))
}

function extractTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block)
  return match?.[1] ? decodeEntities(match[1].trim()) : null
}

function extractLink(block: string): string | null {
  const href = /<link[^>]+href=["']([^"']+)["']/i.exec(block)?.[1]
  return href ? decodeEntities(href.trim()) : extractTag(block, 'link')
}

/** Parse SEC EDGAR current filings Atom feed (8-K). */
export function parseEdgarCurrentAtom(xml: string): Parsed8KEntry[] {
  const entries: Parsed8KEntry[] = []
  const blocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  for (const block of blocks) {
    const title = extractTag(block, 'title')
    const updated = extractTag(block, 'updated')
    const link = extractLink(block)
    const summary = extractTag(block, 'summary') ?? ''
    const id = extractTag(block, 'id') ?? link ?? ''
    if (!title || !updated || !link) {
      continue
    }
    const accessionMatch =
      /accession-number=([\d-]+)/i.exec(link) ?? /(\d{10}-\d{2}-\d{6})/.exec(id)
    const accessionNumber = accessionMatch?.[1] ?? id
    const cikMatch = /CIK=(\d+)/i.exec(link) ?? /cik=(\d+)/i.exec(id)
    const cik = cikMatch?.[1] ? cikMatch[1].padStart(10, '0') : ''
    if (!cik) {
      continue
    }
    const itemCodes = parse8KItemCodes(`${title} ${summary}`)
    entries.push({
      accessionNumber,
      cik,
      title,
      anchorAt: updated,
      itemCodes,
      link,
    })
  }
  return entries
}
