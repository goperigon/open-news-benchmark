const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'cmpid',
  'smid',
  'ito',
  'ocid',
  'taid',
])

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase()
  return TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')
}

function stripHostPrefix(host: string): string {
  let h = host.toLowerCase()
  for (const prefix of ['www.', 'amp.', 'm.']) {
    if (h.startsWith(prefix)) {
      h = h.slice(prefix.length)
      break
    }
  }
  return h
}

function normalizePathname(pathname: string): string {
  let path = pathname
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length)
  }
  if (path.endsWith('/amp')) {
    path = path.slice(0, -'/amp'.length)
  }
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1)
  }
  return path
}

export function normalizeUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  url.protocol = 'https:'
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key) || key.toLowerCase() === 'outputtype') {
      url.searchParams.delete(key)
    }
  }
  if (url.searchParams.get('outputType')?.toLowerCase() === 'amp') {
    url.searchParams.delete('outputType')
  }
  url.hostname = stripHostPrefix(url.hostname)
  url.pathname = normalizePathname(url.pathname)
  return url.toString()
}

function bareHost(host: string): string {
  return stripHostPrefix(host)
}

/** True when both hosts are the same site, allowing subdomains (uk.reuters.com ~ reuters.com). */
export function isSameSite(hostA: string, hostB: string): boolean {
  const a = bareHost(hostA)
  const b = bareHost(hostB)
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export function domainFromUrl(raw: string): string | null {
  try {
    return stripHostPrefix(new URL(raw).hostname)
  } catch {
    return null
  }
}
