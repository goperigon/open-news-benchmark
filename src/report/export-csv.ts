import type { Database } from 'bun:sqlite'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { listArticlesForRun, listObservationsForRun } from '../store/db.ts'
import { resultsDir } from '../lib/paths.ts'

export function exportRunCsv(db: Database, runId: string): { articlesPath: string; obsPath: string } {
  const dir = join(resultsDir(), runId)
  mkdirSync(dir, { recursive: true })

  const articles = listArticlesForRun(db, runId)
  const observations = listObservationsForRun(db, runId)

  const articlesPath = join(dir, 'articles.csv')
  const obsPath = join(dir, 'observations.csv')

  const articleHeader =
    'id,url,domain,source_type,language,country,first_seen_at,tracking_ends_at,publisher_published_at\n'
  const articleLines = articles.map((a) =>
    [
      a.id,
      csvEscape(a.url),
      a.domain,
      a.source_type,
      a.language,
      a.country,
      a.first_seen_at,
      a.tracking_ends_at,
      a.publisher_published_at ?? '',
    ].join(',')
  )
  writeFileSync(articlesPath, articleHeader + articleLines.join('\n') + '\n')

  const obsHeader = 'article_id,provider_id,found_at,match_method,time_to_index_ms\n'
  const obsLines = observations.map((o) =>
    [
      o.article_id,
      o.provider_id,
      o.found_at ?? '',
      o.match_method ?? '',
      o.time_to_index_ms ?? '',
    ].join(',')
  )
  writeFileSync(obsPath, obsHeader + obsLines.join('\n') + '\n')

  return { articlesPath, obsPath }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
