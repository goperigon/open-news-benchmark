const VERIFY_TIMEOUT_MS = 8000
const BLOCKED_HOSTS = new Set(['unknown.local', 'example.com', 'localhost'])

export type UrlVerificationResult = 'ok' | 'unreachable' | 'blocked'

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isVerifiableCitationUrl(url: string): boolean {
  const host = hostFromUrl(url)
  if (!host) {
    return false
  }
  if (BLOCKED_HOSTS.has(host)) {
    return false
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false
  }
  return true
}

export async function verifyCitationUrl(url: string): Promise<UrlVerificationResult> {
  if (!isVerifiableCitationUrl(url)) {
    return 'blocked'
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'open-news-benchmark/1.0 (+https://github.com/goperigon/open-news-benchmark)' },
    })
    if (head.ok || head.status === 405 || head.status === 403) {
      return 'ok'
    }
    const get = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'open-news-benchmark/1.0 (+https://github.com/goperigon/open-news-benchmark)' },
    })
    if (get.ok) {
      return 'ok'
    }
    return 'unreachable'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

export async function filterIncidentsWithVerifiedUrls<T extends { citationUrls: string[] }>(
  incidents: T[]
): Promise<T[]> {
  const out: T[] = []
  for (const incident of incidents) {
    const urls = incident.citationUrls.filter(isVerifiableCitationUrl)
    if (urls.length === 0) {
      continue
    }
    let verified = false
    for (const url of urls) {
      const result = await verifyCitationUrl(url)
      if (result === 'ok') {
        verified = true
        break
      }
    }
    if (verified) {
      out.push(incident)
    }
  }
  return out
}
