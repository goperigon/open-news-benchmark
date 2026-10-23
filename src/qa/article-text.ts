import { fetchText } from '../lib/http.ts'

const MAX_BYTES = 500_000

export function extractArticleTextFromHtml(html: string): string {
  const jsonLd = extractJsonLdArticleBody(html)
  if (jsonLd && jsonLd.length >= 200) {
    return jsonLd
  }
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch?.[1]) {
    const text = stripHtml(articleMatch[1])
    if (text.length >= 200) {
      return text
    }
  }
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1] ?? ''))
    .filter((p) => p.length > 40)
  return paragraphs.join('\n\n')
}

function extractJsonLdArticleBody(html: string): string | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of scripts) {
    const raw = match[1]?.trim()
    if (!raw) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      const body = findArticleBody(parsed)
      if (body) {
        return stripHtml(body)
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return null
}

function findArticleBody(node: unknown): string | null {
  if (typeof node === 'string') {
    return null
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findArticleBody(item)
      if (found) {
        return found
      }
    }
    return null
  }
  if (typeof node === 'object' && node !== null) {
    if ('articleBody' in node && typeof node.articleBody === 'string') {
      return node.articleBody
    }
    for (const value of Object.values(node)) {
      const found = findArticleBody(value)
      if (found) {
        return found
      }
    }
  }
  return null
}

function stripHtml(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchArticleText(url: string, minChars: number): Promise<string | null> {
  const response = await fetchText(url)
  if (!response?.ok || !response.text) {
    return null
  }
  if (response.text.length > MAX_BYTES) {
    return null
  }
  const text = extractArticleTextFromHtml(response.text)
  if (text.length < minChars) {
    return null
  }
  return text.slice(0, 120_000)
}
