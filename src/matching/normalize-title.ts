import { decodeEntities } from '../ground-truth/rss.ts'

export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
