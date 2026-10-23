import { fetchText } from '../lib/http.ts'
import { decodeEntities } from './rss.ts'

export interface SitemapUrl {
  loc: string
  title?: string
  publicationDate?: string
}

export type SitemapKind = 'urlset' | 'sitemapindex' | 'unknown'

export function sitemapKind(xml: string): SitemapKind {
  if (/<sitemapindex[\s>]/i.test(xml)) {
    return 'sitemapindex'
  }
  if (/<urlset[\s>]/i.test(xml)) {
    return 'urlset'
  }
  return 'unknown'
}

const MAX_INDEX_CHILDREN = 3

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim()
}

function extractLoc(block: string): string | null {
  const raw = /<loc>([\s\S]*?)<\/loc>/i.exec(block)?.[1]?.trim()
  return raw ? decodeEntities(stripCdata(raw)) : null
}

/** Child sitemap URLs listed in a `<sitemapindex>`, in document order. */
export function parseSitemapIndex(xml: string): string[] {
  const blocks = xml.match(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi) ?? []
  return blocks.map(extractLoc).filter((loc): loc is string => loc !== null)
}

export function parseNewsSitemap(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = []
  const blocks = xml.match(/<url[\s>][\s\S]*?<\/url>/gi) ?? []
  for (const block of blocks) {
    const loc = extractLoc(block)
    if (!loc) {
      continue
    }
    const rawTitle =
      /<news:title>([\s\S]*?)<\/news:title>/i.exec(block)?.[1]?.trim() ??
      /<title>([\s\S]*?)<\/title>/i.exec(block)?.[1]?.trim()
    const title = rawTitle ? stripCdata(rawTitle) : undefined
    const publicationDate =
      /<news:publication_date>([\s\S]*?)<\/news:publication_date>/i.exec(block)?.[1]?.trim()
    urls.push({
      loc,
      title: title ? decodeEntities(title) : undefined,
      publicationDate,
    })
  }
  return urls
}

export interface SitemapFetchResult {
  status: number
  kind: SitemapKind
  urls: SitemapUrl[]
}

/**
 * URLs from a sitemap document. News sitemap indexes (Reuters, BBC, Arc-hosted papers)
 * list their newest children first, so only the first few children are followed.
 * Returns null when the document is an index and none of its children could be fetched.
 */
export async function expandSitemap(xml: string): Promise<SitemapUrl[] | null> {
  const kind = sitemapKind(xml)
  if (kind === 'urlset') {
    return parseNewsSitemap(xml)
  }
  if (kind !== 'sitemapindex') {
    return []
  }
  const children = parseSitemapIndex(xml).slice(0, MAX_INDEX_CHILDREN)
  const responses = await Promise.all(children.map((child) => fetchText(child)))
  const fetched = responses.filter(
    (r): r is NonNullable<typeof r> => r !== null && r.ok && sitemapKind(r.text) === 'urlset'
  )
  if (children.length > 0 && fetched.length === 0) {
    return null
  }
  return fetched.flatMap((r) => parseNewsSitemap(r.text))
}

/** Returns null when the sitemap could not be fetched or returned a non-2xx status. */
export async function fetchNewsSitemap(sitemapUrl: string): Promise<SitemapFetchResult | null> {
  const response = await fetchText(sitemapUrl)
  if (!response || !response.ok) {
    return null
  }
  const urls = await expandSitemap(response.text)
  if (urls === null) {
    return null
  }
  return { status: response.status, kind: sitemapKind(response.text), urls }
}
