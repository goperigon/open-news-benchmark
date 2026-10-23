import { parseRssOrAtom } from '../ground-truth/rss.ts'
import { expandSitemap, sitemapKind, type SitemapKind } from '../ground-truth/news-sitemap.ts'
import { fetchText } from '../lib/http.ts'
import { mapWithConcurrency } from '../lib/concurrency.ts'
import { domainFromUrl, isSameSite } from '../matching/normalize-url.ts'
import type { PanelSource } from '../schema/panel.ts'

const STALE_AFTER_HOURS = 72
const CHECK_CONCURRENCY = 10
const MAX_FEED_CANDIDATES = 6
const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/index.xml']

export interface ChannelCheck {
  url: string
  status: number | null
  itemCount: number
  onDomainCount: number
  newestAgeHours: number | null
  sitemapKind?: SitemapKind
  usable: boolean
}

export type SourceVerdict = 'ok' | 'stale' | 'dead'

export interface SourceCheck {
  domain: string
  verdict: SourceVerdict
  feed: ChannelCheck | null
  sitemap: ChannelCheck | null
  /** Every URL that was tried, for auditing why a source was excluded. */
  attempts: ChannelCheck[]
}

function newestAgeHours(dates: Array<string | undefined>, nowMs: number): number | null {
  let newest: number | null = null
  for (const date of dates) {
    if (!date) {
      continue
    }
    const ms = Date.parse(date)
    if (Number.isNaN(ms)) {
      continue
    }
    newest = newest === null ? ms : Math.max(newest, ms)
  }
  return newest === null ? null : Math.max(0, (nowMs - newest) / 3_600_000)
}

function isFresh(ageHours: number | null): boolean {
  return ageHours === null || ageHours <= STALE_AFTER_HOURS
}

function onDomain(url: string, domain: string): boolean {
  const host = domainFromUrl(url)
  return host !== null && isSameSite(host, domain)
}

export async function checkFeed(url: string, domain: string, nowMs = Date.now()): Promise<ChannelCheck> {
  const response = await fetchText(url)
  if (!response || !response.ok) {
    return { url, status: response?.status ?? null, itemCount: 0, onDomainCount: 0, newestAgeHours: null, usable: false }
  }
  const items = parseRssOrAtom(response.text)
  const mine = items.filter((item) => onDomain(item.url, domain))
  const age = newestAgeHours(
    mine.map((item) => item.publishedAt),
    nowMs
  )
  return {
    url: response.finalUrl,
    status: response.status,
    itemCount: items.length,
    onDomainCount: mine.length,
    newestAgeHours: age,
    usable: mine.length > 0 && isFresh(age),
  }
}

export async function checkSitemap(
  url: string,
  domain: string,
  nowMs = Date.now()
): Promise<ChannelCheck> {
  const response = await fetchText(url)
  if (!response || !response.ok) {
    return { url, status: response?.status ?? null, itemCount: 0, onDomainCount: 0, newestAgeHours: null, usable: false }
  }
  const kind = sitemapKind(response.text)
  const urls = (await expandSitemap(response.text)) ?? []
  const mine = urls.filter((item) => onDomain(item.loc, domain))
  const age = newestAgeHours(
    mine.map((item) => item.publicationDate),
    nowMs
  )
  return {
    url: response.finalUrl,
    status: response.status,
    itemCount: urls.length,
    onDomainCount: mine.length,
    newestAgeHours: age,
    sitemapKind: kind,
    usable: kind !== 'unknown' && mine.length > 0 && isFresh(age),
  }
}

/** `<link rel="alternate" type="application/rss+xml" href="...">` tags from a homepage. */
export function parseFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) {
      continue
    }
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href) {
      continue
    }
    try {
      links.push(new URL(href.replace(/&amp;/g, '&'), baseUrl).toString())
    } catch {
      // ignore malformed hrefs
    }
  }
  return [...new Set(links)]
}

/** `Sitemap:` lines in robots.txt that look like Google News sitemaps. */
export function parseNewsSitemapsFromRobots(robots: string): string[] {
  const urls: string[] = []
  for (const line of robots.split(/\r?\n/)) {
    const match = /^\s*sitemap:\s*(\S+)/i.exec(line)
    if (match?.[1] && /news/i.test(match[1])) {
      urls.push(match[1])
    }
  }
  return [...new Set(urls)]
}

async function discoverFeedCandidates(domain: string): Promise<string[]> {
  const homepage = `https://www.${domain}/`
  const response = (await fetchText(homepage)) ?? (await fetchText(`https://${domain}/`))
  const linked = response?.ok ? parseFeedLinks(response.text, response.finalUrl) : []
  const base = response?.finalUrl ? new URL(response.finalUrl).origin : `https://www.${domain}`
  const common = COMMON_FEED_PATHS.map((path) => `${base}${path}`)
  return [...new Set([...linked, ...common])].slice(0, MAX_FEED_CANDIDATES)
}

async function discoverSitemapCandidates(domain: string): Promise<string[]> {
  const response =
    (await fetchText(`https://www.${domain}/robots.txt`)) ??
    (await fetchText(`https://${domain}/robots.txt`))
  return response?.ok ? parseNewsSitemapsFromRobots(response.text) : []
}

async function firstUsable(
  candidates: string[],
  check: (url: string) => Promise<ChannelCheck>,
  attempts: ChannelCheck[]
): Promise<ChannelCheck | null> {
  for (const url of candidates) {
    const result = await check(url)
    attempts.push(result)
    if (result.usable) {
      return result
    }
  }
  return null
}

export function verdictFor(attempts: ChannelCheck[], feed: ChannelCheck | null, sitemap: ChannelCheck | null): SourceVerdict {
  if (feed || sitemap) {
    return 'ok'
  }
  const respondedWithItems = attempts.some((a) => a.onDomainCount > 0)
  return respondedWithItems ? 'stale' : 'dead'
}

export async function checkSource(source: PanelSource): Promise<SourceCheck> {
  const attempts: ChannelCheck[] = []
  const checkFeedForSource = (url: string) => checkFeed(url, source.domain)
  const checkSitemapForSource = (url: string) => checkSitemap(url, source.domain)

  let feed = source.feedUrl ? await firstUsable([source.feedUrl], checkFeedForSource, attempts) : null
  if (!feed) {
    const tried = new Set(attempts.map((a) => a.url))
    const candidates = (await discoverFeedCandidates(source.domain)).filter((u) => !tried.has(u))
    feed = await firstUsable(candidates, checkFeedForSource, attempts)
  }

  let sitemap = source.sitemapUrl
    ? await firstUsable([source.sitemapUrl], checkSitemapForSource, attempts)
    : null
  if (!sitemap) {
    const tried = new Set(attempts.map((a) => a.url))
    const candidates = (await discoverSitemapCandidates(source.domain)).filter((u) => !tried.has(u))
    sitemap = await firstUsable(candidates, checkSitemapForSource, attempts)
  }

  return { domain: source.domain, verdict: verdictFor(attempts, feed, sitemap), feed, sitemap, attempts }
}

export async function checkPanel(
  sources: PanelSource[],
  onResult?: (result: SourceCheck) => void
): Promise<SourceCheck[]> {
  return mapWithConcurrency(sources, CHECK_CONCURRENCY, async (source) => {
    const result = await checkSource(source)
    onResult?.(result)
    return result
  })
}

export interface PanelExclusion {
  domain: string
  verdict: Exclude<SourceVerdict, 'ok'>
  reason: string
}

/** Applies check results: usable channels replace configured URLs; unusable sources are excluded. */
export function applyPanelCheck(
  sources: PanelSource[],
  results: SourceCheck[]
): { sources: PanelSource[]; exclusions: PanelExclusion[] } {
  const byDomain = new Map(results.map((r) => [r.domain, r]))
  const kept: PanelSource[] = []
  const exclusions: PanelExclusion[] = []
  for (const source of sources) {
    const result = byDomain.get(source.domain)
    if (!result) {
      kept.push(source)
      continue
    }
    if (result.verdict !== 'ok') {
      const newest = result.attempts
        .map((a) => a.newestAgeHours)
        .filter((h): h is number => h !== null)
        .sort((a, b) => a - b)[0]
      exclusions.push({
        domain: source.domain,
        verdict: result.verdict,
        reason:
          result.verdict === 'stale'
            ? `newest on-domain item is ${Math.round(newest ?? 0)}h old (limit ${STALE_AFTER_HOURS}h)`
            : `no reachable feed or news sitemap with on-domain items (${result.attempts.length} URLs tried)`,
      })
      continue
    }
    const { feedUrl: _feedUrl, sitemapUrl: _sitemapUrl, ...rest } = source
    kept.push({
      ...rest,
      ...(result.feed ? { feedUrl: result.feed.url } : {}),
      ...(result.sitemap ? { sitemapUrl: result.sitemap.url } : {}),
    })
  }
  return { sources: kept, exclusions }
}
