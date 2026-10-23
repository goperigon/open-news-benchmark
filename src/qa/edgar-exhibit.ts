import { fetchSec } from '../lib/sec-http.ts'

export async function fetchFilingIndexHtml(cik: string, accessionNumber: string): Promise<string | null> {
  const cikNum = String(Number(cik))
  const accessionPath = accessionNumber.replace(/-/g, '')
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionPath}/${accessionNumber}-index.htm`
  const response = await fetchSec(url)
  return response?.ok ? response.text : null
}

export function findEx991DocumentUrl(indexHtml: string, cik: string, accessionNumber: string): string | null {
  const accessionPath = accessionNumber.replace(/-/g, '')
  const cikNum = String(Number(cik))
  const match =
    /<tr[^>]*>[\s\S]*?ex-99\.1[\s\S]*?<a href="([^"]+)"/i.exec(indexHtml) ??
    /<a href="([^"]*ex991[^"]*)"/i.exec(indexHtml)
  if (!match?.[1]) {
    return null
  }
  const href = match[1]
  if (href.startsWith('http')) {
    return href
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionPath}/${href.replace(/^\//, '')}`
}

export async function fetchExhibitText(url: string): Promise<string | null> {
  const response = await fetchSec(url)
  return response?.ok ? response.text : null
}
