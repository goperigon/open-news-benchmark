import { fetchText } from './http.ts'

export function secUserAgent(): string {
  const email = process.env.SEC_CONTACT_EMAIL?.trim()
  if (!email) {
    throw new Error('[sec] SEC_CONTACT_EMAIL is required for SEC requests')
  }
  return `OpenNewsBenchmark/0.1 (${email})`
}

export async function fetchSec(url: string, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': secUserAgent(), Accept: 'application/atom+xml, application/xml, text/xml' },
    })
    const text = await response.text()
    return { status: response.status, ok: response.ok, text, finalUrl: response.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
