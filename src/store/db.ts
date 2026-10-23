import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { initEventSchema } from './event-db.ts'
import { initCyberSchema } from './cyber-db.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  panel_hash TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  harness_git_sha TEXT NOT NULL,
  region TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  language TEXT NOT NULL,
  country TEXT NOT NULL,
  publisher_published_at TEXT,
  first_seen_at TEXT NOT NULL,
  tracking_ends_at TEXT NOT NULL,
  UNIQUE(run_id, normalized_url)
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  article_id INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  found_at TEXT,
  match_method TEXT,
  time_to_index_ms INTEGER,
  provider_timestamp TEXT,
  UNIQUE(run_id, article_id, provider_id)
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  response_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_run_pending ON articles(run_id, tracking_ends_at);
CREATE INDEX IF NOT EXISTS idx_observations_run ON observations(run_id, provider_id);

CREATE TABLE IF NOT EXISTS article_aliases (
  article_id INTEGER NOT NULL,
  normalized_url TEXT NOT NULL,
  PRIMARY KEY (article_id, normalized_url)
);
`

function migrateObservationsProviderTimestamp(db: Database): void {
  const columns = db.prepare(`PRAGMA table_info(observations)`).all() as Array<{
    name: string
  }>
  if (!columns.some((c) => c.name === 'provider_timestamp')) {
    db.exec(`ALTER TABLE observations ADD COLUMN provider_timestamp TEXT`)
  }
}

export function openDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { strict: true })
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA busy_timeout = 120000;')
  db.exec(SCHEMA)
  migrateObservationsProviderTimestamp(db)
  initEventSchema(db)
  initCyberSchema(db)
  return db
}

export interface RunRow {
  id: string
  suite_id: string
  started_at: string
  ended_at: string | null
  panel_hash: string
  config_hash: string
  harness_git_sha: string
  region: string
}

export interface ArticleRow {
  id: number
  run_id: string
  url: string
  normalized_url: string
  domain: string
  title: string
  normalized_title: string
  source_type: string
  language: string
  country: string
  publisher_published_at: string | null
  first_seen_at: string
  tracking_ends_at: string
}

export function insertRun(
  db: Database,
  row: Omit<RunRow, 'ended_at'> & { ended_at?: string | null }
): void {
  db.prepare(
    `INSERT INTO runs (id, suite_id, started_at, ended_at, panel_hash, config_hash, harness_git_sha, region)
     VALUES (@id, @suite_id, @started_at, @ended_at, @panel_hash, @config_hash, @harness_git_sha, @region)`
  ).run({
    ...row,
    ended_at: row.ended_at ?? null,
  })
}

export function finishRun(db: Database, runId: string, endedAt: string): void {
  db.prepare(`UPDATE runs SET ended_at = ? WHERE id = ?`).run(endedAt, runId)
}

export function insertArticle(
  db: Database,
  article: Omit<ArticleRow, 'id'>
): number | null {
  try {
    const result = db
      .prepare(
        `INSERT INTO articles (
          run_id, url, normalized_url, domain, title, normalized_title,
          source_type, language, country, publisher_published_at,
          first_seen_at, tracking_ends_at
        ) VALUES (
          @run_id, @url, @normalized_url, @domain, @title, @normalized_title,
          @source_type, @language, @country, @publisher_published_at,
          @first_seen_at, @tracking_ends_at
        )`
      )
      .run(article)
    return Number(result.lastInsertRowid)
  } catch {
    return null
  }
}

export function listPendingArticles(db: Database, runId: string, nowIso: string): ArticleRow[] {
  return db
    .prepare(
      `SELECT a.* FROM articles a
       LEFT JOIN observations o ON o.article_id = a.id AND o.found_at IS NOT NULL
       WHERE a.run_id = ? AND a.tracking_ends_at > ?
       GROUP BY a.id
       HAVING COUNT(o.id) < (
         SELECT COUNT(DISTINCT provider_id) FROM observations obs
         WHERE obs.run_id = ? AND obs.article_id = a.id
       ) OR SUM(CASE WHEN o.found_at IS NOT NULL THEN 1 ELSE 0 END) = 0`
    )
    .all(runId, nowIso, runId) as ArticleRow[]
}

/** Articles still within tracking window (for probing). */
export function listTrackableArticles(db: Database, runId: string, nowIso: string): ArticleRow[] {
  return db
    .prepare(`SELECT * FROM articles WHERE run_id = ? AND tracking_ends_at > ?`)
    .all(runId, nowIso) as ArticleRow[]
}

export function getObservation(
  db: Database,
  runId: string,
  articleId: number,
  providerId: string
): { found_at: string | null } | null {
  return db
    .prepare(
      `SELECT found_at FROM observations WHERE run_id = ? AND article_id = ? AND provider_id = ?`
    )
    .get(runId, articleId, providerId) as { found_at: string | null } | null
}

export function upsertObservationFound(
  db: Database,
  input: {
    runId: string
    articleId: number
    providerId: string
    foundAt: string
    matchMethod: string
    timeToIndexMs: number
    providerTimestamp?: string | null
  }
): void {
  const existing = getObservation(db, input.runId, input.articleId, input.providerId)
  if (existing?.found_at) {
    return
  }
  db.prepare(
    `INSERT INTO observations (run_id, article_id, provider_id, found_at, match_method, time_to_index_ms, provider_timestamp)
     VALUES (@runId, @articleId, @providerId, @foundAt, @matchMethod, @timeToIndexMs, @providerTimestamp)
     ON CONFLICT(run_id, article_id, provider_id) DO UPDATE SET
       found_at = excluded.found_at,
       match_method = excluded.match_method,
       time_to_index_ms = excluded.time_to_index_ms,
       provider_timestamp = excluded.provider_timestamp`
  ).run({ ...input, providerTimestamp: input.providerTimestamp ?? null })
}

export function ensureObservationPlaceholder(
  db: Database,
  runId: string,
  articleId: number,
  providerId: string
): void {
  db.prepare(
    `INSERT OR IGNORE INTO observations (run_id, article_id, provider_id, found_at, match_method, time_to_index_ms)
     VALUES (?, ?, ?, NULL, NULL, NULL)`
  ).run(runId, articleId, providerId)
}

export function insertRequest(
  db: Database,
  row: {
    runId: string
    providerId: string
    requestedAt: string
    responseMs: number
    status: string
    error?: string
  }
): void {
  db.prepare(
    `INSERT INTO requests (run_id, provider_id, requested_at, response_ms, status, error)
     VALUES (@runId, @providerId, @requestedAt, @responseMs, @status, @error)`
  ).run({
    runId: row.runId,
    providerId: row.providerId,
    requestedAt: row.requestedAt,
    responseMs: row.responseMs,
    status: row.status,
    error: row.error ?? null,
  })
}

export function listArticlesForRun(db: Database, runId: string): ArticleRow[] {
  return db.prepare(`SELECT * FROM articles WHERE run_id = ?`).all(runId) as ArticleRow[]
}

export function countArticlesForRun(db: Database, runId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM articles WHERE run_id = ?`)
    .get(runId) as { c: number }
  return row.c
}

export function countArticlesFoundByProvider(
  db: Database,
  runId: string,
  providerId: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM observations
       WHERE run_id = ? AND provider_id = ? AND found_at IS NOT NULL`
    )
    .get(runId, providerId) as { c: number }
  return row.c
}

export function countArticlesByDomain(db: Database, runId: string, domain: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM articles WHERE run_id = ? AND domain = ?`)
    .get(runId, domain) as { c: number }
  return row.c
}

export function insertArticleAlias(db: Database, articleId: number, normalizedUrl: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO article_aliases (article_id, normalized_url) VALUES (?, ?)`
  ).run(articleId, normalizedUrl)
}

export function listAliasesByArticleIds(
  db: Database,
  articleIds: readonly number[]
): Map<number, string[]> {
  const map = new Map<number, string[]>()
  if (articleIds.length === 0) {
    return map
  }
  const placeholders = articleIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT article_id, normalized_url FROM article_aliases WHERE article_id IN (${placeholders})`
    )
    .all(...articleIds) as Array<{ article_id: number; normalized_url: string }>
  for (const row of rows) {
    const list = map.get(row.article_id) ?? []
    list.push(row.normalized_url)
    map.set(row.article_id, list)
  }
  return map
}

export function listNeverFoundArticles(
  db: Database,
  runId: string,
  providerId: string
): ArticleRow[] {
  return db
    .prepare(
      `SELECT a.* FROM articles a
       WHERE a.run_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM observations o
         WHERE o.run_id = a.run_id AND o.article_id = a.id AND o.provider_id = ? AND o.found_at IS NOT NULL
       )`
    )
    .all(runId, providerId) as ArticleRow[]
}

export function listArticlesWithoutQaItems(db: Database, runId: string): ArticleRow[] {
  return db
    .prepare(
      `SELECT a.* FROM articles a
       LEFT JOIN qa_items q ON q.run_id = a.run_id AND q.event_id = 'article:' || a.id
       WHERE a.run_id = ? AND q.id IS NULL
       ORDER BY a.first_seen_at ASC`
    )
    .all(runId) as ArticleRow[]
}

export function getArticle(db: Database, runId: string, articleId: number): ArticleRow | null {
  return db
    .prepare(`SELECT * FROM articles WHERE run_id = ? AND id = ?`)
    .get(runId, articleId) as ArticleRow | null
}

export function listObservationsForRun(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM observations WHERE run_id = ?`)
    .all(runId) as Array<{
    article_id: number
    provider_id: string
    found_at: string | null
    match_method: string | null
    time_to_index_ms: number | null
    provider_timestamp: string | null
  }>
}

export function listRequestsForRun(db: Database, runId: string) {
  return db
    .prepare(`SELECT provider_id, response_ms, status FROM requests WHERE run_id = ?`)
    .all(runId) as Array<{ provider_id: string; response_ms: number; status: string }>
}

export function getRun(db: Database, runId: string): RunRow | null {
  return db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | null
}
