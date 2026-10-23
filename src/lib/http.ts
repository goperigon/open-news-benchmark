export const BENCH_USER_AGENT =
  'OpenNewsBenchmark/0.1 (+https://github.com/goperigon/open-news-benchmark)'

export interface TextResponse {
  status: number
  ok: boolean
  text: string
  finalUrl: string
}

/** Returns null when the request itself fails (network error or timeout). */
export async function fetchText(url: string, timeoutMs = 15_000): Promise<TextResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BENCH_USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html',
      },
    })
    const text = await response.text()
    return { status: response.status, ok: response.ok, text, finalUrl: response.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
