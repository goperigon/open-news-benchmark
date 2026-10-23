import { fetchText } from '../lib/http.ts'

export interface FeedItem {
  url: string
  title: string
  publishedAt?: string
  /** Google News RSS: `<source url="https://publisher.com">Publisher</source>` */
  sourceUrl?: string
  sourceName?: string
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function extractTag(block: string, tag: string): string | null {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i').exec(
    block
  )
  if (cdata?.[1]) {
    return cdata[1].trim()
  }
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (plain?.[1]) {
    return decodeEntities(plain[1].replace(/<[^>]+>/g, '').trim())
  }
  return null
}

function extractLink(block: string): string | null {
  const alt = /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i.exec(block)
  if (alt?.[1]) {
    return decodeEntities(alt[1].trim())
  }
  return extractTag(block, 'link')
}

function extractSource(block: string): { url?: string; name?: string } {
  const match = /<source[^>]*\burl=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i.exec(block)
  if (!match) {
    return {}
  }
  return {
    url: match[1] ? decodeEntities(match[1].trim()) : undefined,
    name: match[2] ? decodeEntities(match[2].trim()) : undefined,
  }
}

export function parseRssOrAtom(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  for (const block of blocks) {
    const url = extractLink(block)
    const title = extractTag(block, 'title')
    if (!url || !title) {
      continue
    }
    const publishedAt =
      extractTag(block, 'pubDate') ??
      extractTag(block, 'published') ??
      extractTag(block, 'dc:date') ??
      extractTag(block, 'updated') ??
      undefined
    const source = extractSource(block)
    items.push({ url, title, publishedAt, sourceUrl: source.url, sourceName: source.name })
  }
  return items
}

export interface FeedFetchResult {
  status: number
  items: FeedItem[]
}

/** Returns null when the feed could not be fetched or returned a non-2xx status. */
export async function fetchFeed(feedUrl: string): Promise<FeedFetchResult | null> {
  const response = await fetchText(feedUrl)
  if (!response || !response.ok) {
    return null
  }
  return { status: response.status, items: parseRssOrAtom(response.text) }
}
