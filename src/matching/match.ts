import { domainFromUrl, isSameSite, normalizeUrl } from './normalize-url.ts'
import { normalizeTitle } from './normalize-title.ts'

export type MatchMethod = 'url' | 'canonical' | 'slug' | 'title' | 'fuzzy_title' | 'none'

const MATCH_PRIORITY: MatchMethod[] = ['url', 'canonical', 'slug', 'title', 'fuzzy_title', 'none']

function betterMethod(current: MatchMethod, candidate: MatchMethod): MatchMethod {
  if (candidate === 'none') {
    return current
  }
  if (current === 'none') {
    return candidate
  }
  return MATCH_PRIORITY.indexOf(candidate) < MATCH_PRIORITY.indexOf(current) ? candidate : current
}

export interface MatchCandidate {
  url: string
  title: string
  /** Publisher host when `url` points at an aggregator rather than the publisher. */
  sourceDomain?: string
  providerTimestamp?: string
}

export interface GroundArticle {
  id: number
  url: string
  normalizedUrl: string
  domain: string
  title: string
  normalizedTitle: string
  canonicalAliases?: readonly string[]
  firstSeenAt?: string
}

function titleTokens(normalizedTitle: string): Set<string> {
  return new Set(normalizedTitle.split(/\s+/).filter((t) => t.length > 0))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0
  }
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1
    }
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function lastPathSegment(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const parts = path.split('/').filter(Boolean)
    return parts.length > 0 ? (parts[parts.length - 1] ?? null) : null
  } catch {
    return null
  }
}

function slugMatch(segmentA: string, segmentB: string): boolean {
  if (segmentA === segmentB && segmentA.length >= 20) {
    return true
  }
  const idA = segmentA.match(/\d{6,}/)?.[0]
  const idB = segmentB.match(/\d{6,}/)?.[0]
  return idA !== undefined && idB !== undefined && idA === idB
}

function withinSixHours(firstSeenAt: string | undefined, providerTimestamp: string | undefined): boolean {
  if (!firstSeenAt || !providerTimestamp) {
    return true
  }
  const a = Date.parse(firstSeenAt)
  const b = Date.parse(providerTimestamp)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true
  }
  return Math.abs(b - a) <= 6 * 3_600_000
}

export function matchArticle(ground: GroundArticle, candidate: MatchCandidate): MatchMethod {
  const normalizedCandidateUrl = normalizeUrl(candidate.url)
  if (normalizedCandidateUrl && normalizedCandidateUrl === ground.normalizedUrl) {
    return 'url'
  }
  if (
    normalizedCandidateUrl &&
    ground.canonicalAliases?.some((alias) => alias === normalizedCandidateUrl)
  ) {
    return 'canonical'
  }

  const candidateDomain =
    candidate.sourceDomain ?? (normalizedCandidateUrl ? domainFromUrl(normalizedCandidateUrl) : null)

  if (candidateDomain && isSameSite(candidateDomain, ground.domain)) {
    const groundSeg = lastPathSegment(ground.url)
    const candSeg = normalizedCandidateUrl ? lastPathSegment(normalizedCandidateUrl) : null
    if (groundSeg && candSeg && slugMatch(groundSeg, candSeg)) {
      return 'slug'
    }

    if (ground.normalizedTitle.length > 0 && normalizeTitle(candidate.title) === ground.normalizedTitle) {
      return 'title'
    }

    const groundTokens = titleTokens(ground.normalizedTitle)
    const candTokens = titleTokens(normalizeTitle(candidate.title))
    if (
      groundTokens.size >= 5 &&
      candTokens.size >= 5 &&
      jaccard(groundTokens, candTokens) >= 0.9 &&
      withinSixHours(ground.firstSeenAt, candidate.providerTimestamp)
    ) {
      return 'fuzzy_title'
    }
  }

  return 'none'
}

export interface MatchResult {
  method: MatchMethod
  candidate: MatchCandidate | null
}

export function findMatchResult(
  ground: GroundArticle,
  candidates: MatchCandidate[]
): MatchResult {
  let best: MatchMethod = 'none'
  let bestCandidate: MatchCandidate | null = null
  for (const candidate of candidates) {
    const method = matchArticle(ground, candidate)
    const improved = betterMethod(best, method)
    if (improved !== best) {
      best = improved
      bestCandidate = candidate
    }
    if (best === 'url') {
      return { method: 'url', candidate }
    }
  }
  return { method: best, candidate: bestCandidate }
}

export function findMatch(ground: GroundArticle, candidates: MatchCandidate[]): MatchMethod {
  return findMatchResult(ground, candidates).method
}
