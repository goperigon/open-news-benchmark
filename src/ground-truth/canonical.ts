import type { Database } from 'bun:sqlite'

import { fetchText } from '../lib/http.ts'
import { normalizeUrl } from '../matching/normalize-url.ts'
import { insertArticleAlias } from '../store/db.ts'

const CANONICAL_LINK = /<link[^>]+rel=["']canonical["'][^>]*>/i
const HREF = /href=["']([^"']+)["']/i
const OG_URL = /<meta[^>]+property=["']og:url["'][^>]*>/i
const CONTENT = /content=["']([^"']+)["']/i

function extractCanonicalHref(html: string, pageUrl: string): string[] {
  const out: string[] = []
  const linkMatch = html.match(CANONICAL_LINK)
  if (linkMatch) {
    const href = linkMatch[0].match(HREF)?.[1]
    if (href) {
      try {
        out.push(new URL(href, pageUrl).toString())
      } catch {
        // ignore bad href
      }
    }
  }
  const ogMatch = html.match(OG_URL)
  if (ogMatch) {
    const content = ogMatch[0].match(CONTENT)?.[1]
    if (content) {
      try {
        out.push(new URL(content, pageUrl).toString())
      } catch {
        // ignore
      }
    }
  }
  return out
}

export async function fetchAndStoreArticleAliases(db: Database, articleId: number, pageUrl: string): Promise<void> {
  const response = await fetchText(pageUrl)
  if (!response?.ok) {
    return
  }
  const hrefs = extractCanonicalHref(response.text, pageUrl)
  const seen = new Set<string>()
  for (const href of hrefs) {
    const normalized = normalizeUrl(href)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    insertArticleAlias(db, articleId, normalized)
  }
}
