import type { Database } from 'bun:sqlite'

export const EVENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS run_providers (
  run_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  declared_tier TEXT,
  timing_resolution_ms INTEGER NOT NULL,
  PRIMARY KEY (run_id, provider_id)
);

CREATE TABLE IF NOT EXISTS bench_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  anchor_source TEXT NOT NULL,
  anchor_at TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  accession_number TEXT,
  cik TEXT,
  ticker TEXT,
  company_name TEXT,
  tier TEXT,
  item_types TEXT NOT NULL,
  edgar_link TEXT,
  scheduled_name TEXT,
  probe_terms TEXT
);

CREATE TABLE IF NOT EXISTS event_probes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  mode TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  response_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  UNIQUE(run_id, event_id, provider_id, offset_minutes, mode)
);

CREATE TABLE IF NOT EXISTS event_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  found_at TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  time_to_coverage_ms INTEGER NOT NULL,
  pre_anchor INTEGER NOT NULL,
  entity_tagged INTEGER,
  has_sentiment INTEGER,
  provider_timestamp TEXT,
  match_method TEXT NOT NULL,
  UNIQUE(run_id, event_id, provider_id, mode)
);

CREATE TABLE IF NOT EXISTS relevance_cache (
  cache_key TEXT PRIMARY KEY,
  relevant INTEGER NOT NULL,
  reason TEXT NOT NULL,
  judged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  question TEXT NOT NULL,
  gold_answer TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,
  UNIQUE(run_id, event_id, question)
);

CREATE TABLE IF NOT EXISTS qa_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  qa_item_id INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL,
  synthesized_answer TEXT NOT NULL,
  grade TEXT NOT NULL,
  graded_at TEXT NOT NULL,
  UNIQUE(run_id, qa_item_id, provider_id, delay_minutes)
);

CREATE TABLE IF NOT EXISTS qa_queries (
  cache_key TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  model TEXT NOT NULL,
  rewritten_query TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS static_qa_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  synthesized_answer TEXT NOT NULL,
  grade TEXT NOT NULL,
  response_ms INTEGER NOT NULL,
  error TEXT,
  graded_at TEXT NOT NULL,
  UNIQUE(run_id, question_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_bench_events_run ON bench_events(run_id);
CREATE INDEX IF NOT EXISTS idx_event_obs_run ON event_observations(run_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_static_qa_run ON static_qa_results(run_id, provider_id);
`

function tableHasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}

function migrateQaItems(db: Database): void {
  if (!tableHasColumn(db, 'qa_items', 'source_kind')) {
    db.exec(`ALTER TABLE qa_items ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'filing'`)
  }
  if (!tableHasColumn(db, 'qa_items', 'anchor_at')) {
    db.exec(`ALTER TABLE qa_items ADD COLUMN anchor_at TEXT`)
  }
  if (!tableHasColumn(db, 'qa_items', 'query')) {
    db.exec(`ALTER TABLE qa_items ADD COLUMN query TEXT`)
  }
  if (!tableHasColumn(db, 'qa_items', 'stale')) {
    db.exec(`ALTER TABLE qa_items ADD COLUMN stale INTEGER NOT NULL DEFAULT 0`)
  }
  if (!tableHasColumn(db, 'qa_items', 'source_type')) {
    db.exec(`ALTER TABLE qa_items ADD COLUMN source_type TEXT`)
  }
}

export interface BenchEventRow {
  id: string
  run_id: string
  anchor_source: string
  anchor_at: string
  detected_at: string
  accession_number: string | null
  cik: string | null
  ticker: string | null
  company_name: string | null
  tier: string | null
  item_types: string
  edgar_link: string | null
  scheduled_name: string | null
  probe_terms: string | null
}

export function initEventSchema(db: Database): void {
  db.exec(EVENT_SCHEMA)
  migrateQaItems(db)
}

export function insertRunProvider(
  db: Database,
  row: {
    runId: string
    providerId: string
    status: string
    declaredTier?: string
    timingResolutionMs: number
  }
): void {
  db.prepare(
    `INSERT OR REPLACE INTO run_providers (run_id, provider_id, status, declared_tier, timing_resolution_ms)
     VALUES (@runId, @providerId, @status, @declaredTier, @timingResolutionMs)`
  ).run({
    runId: row.runId,
    providerId: row.providerId,
    status: row.status,
    declaredTier: row.declaredTier ?? null,
    timingResolutionMs: row.timingResolutionMs,
  })
}

export function listRunProviders(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM run_providers WHERE run_id = ?`)
    .all(runId) as Array<{
    provider_id: string
    status: string
    declared_tier: string | null
    timing_resolution_ms: number
  }>
}

export function insertBenchEvent(db: Database, event: BenchEventRow): boolean {
  try {
    db.prepare(
      `INSERT INTO bench_events (
        id, run_id, anchor_source, anchor_at, detected_at, accession_number, cik, ticker,
        company_name, tier, item_types, edgar_link, scheduled_name, probe_terms
      ) VALUES (
        @id, @run_id, @anchor_source, @anchor_at, @detected_at, @accession_number, @cik, @ticker,
        @company_name, @tier, @item_types, @edgar_link, @scheduled_name, @probe_terms
      )`
    ).run(event as unknown as Record<string, string | null>)
    return true
  } catch {
    return false
  }
}

export function listBenchEvents(db: Database, runId: string): BenchEventRow[] {
  return db.prepare(`SELECT * FROM bench_events WHERE run_id = ?`).all(runId) as BenchEventRow[]
}

export function getEventObservation(
  db: Database,
  runId: string,
  eventId: string,
  providerId: string,
  mode: string
): { found_at: string } | null {
  return db
    .prepare(
      `SELECT found_at FROM event_observations
       WHERE run_id = ? AND event_id = ? AND provider_id = ? AND mode = ?`
    )
    .get(runId, eventId, providerId, mode) as { found_at: string } | null
}

export function insertEventObservation(
  db: Database,
  row: {
    runId: string
    eventId: string
    providerId: string
    mode: string
    url: string
    title: string
    foundAt: string
    offsetMinutes: number
    timeToCoverageMs: number
    preAnchor: boolean
    entityTagged: boolean | null
    hasSentiment: boolean | null
    providerTimestamp: string | null
    matchMethod: string
  }
): void {
  const existing = getEventObservation(db, row.runId, row.eventId, row.providerId, row.mode)
  if (existing) {
    return
  }
  db.prepare(
    `INSERT INTO event_observations (
      run_id, event_id, provider_id, mode, url, title, found_at, offset_minutes,
      time_to_coverage_ms, pre_anchor, entity_tagged, has_sentiment, provider_timestamp, match_method
    ) VALUES (
      @runId, @eventId, @providerId, @mode, @url, @title, @foundAt, @offsetMinutes,
      @timeToCoverageMs, @preAnchor, @entityTagged, @hasSentiment, @providerTimestamp, @matchMethod
    )`
  ).run({
    runId: row.runId,
    eventId: row.eventId,
    providerId: row.providerId,
    mode: row.mode,
    url: row.url,
    title: row.title,
    foundAt: row.foundAt,
    offsetMinutes: row.offsetMinutes,
    timeToCoverageMs: row.timeToCoverageMs,
    preAnchor: row.preAnchor ? 1 : 0,
    entityTagged: row.entityTagged === null ? null : row.entityTagged ? 1 : 0,
    hasSentiment: row.hasSentiment === null ? null : row.hasSentiment ? 1 : 0,
    providerTimestamp: row.providerTimestamp ?? null,
    matchMethod: row.matchMethod,
  })
}

export function insertEventProbe(
  db: Database,
  row: {
    runId: string
    eventId: string
    providerId: string
    offsetMinutes: number
    mode: string
    requestedAt: string
    responseMs: number
    status: string
    error?: string
  }
): void {
  db.prepare(
    `INSERT OR IGNORE INTO event_probes (
      run_id, event_id, provider_id, offset_minutes, mode, requested_at, response_ms, status, error
    ) VALUES (
      @runId, @eventId, @providerId, @offsetMinutes, @mode, @requestedAt, @responseMs, @status, @error
    )`
  ).run({
    ...row,
    error: row.error ?? null,
  })
}

export function getRelevanceCache(db: Database, cacheKey: string): RelevanceVerdictRow | null {
  return db
    .prepare(`SELECT relevant, reason FROM relevance_cache WHERE cache_key = ?`)
    .get(cacheKey) as RelevanceVerdictRow | null
}

export interface RelevanceVerdictRow {
  relevant: number
  reason: string
}

export function setRelevanceCache(
  db: Database,
  cacheKey: string,
  relevant: boolean,
  reason: string
): void {
  db.prepare(
    `INSERT OR REPLACE INTO relevance_cache (cache_key, relevant, reason, judged_at)
     VALUES (?, ?, ?, ?)`
  ).run(cacheKey, relevant ? 1 : 0, reason, new Date().toISOString())
}

export function listEventObservations(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM event_observations WHERE run_id = ?`)
    .all(runId) as Array<{
    event_id: string
    provider_id: string
    mode: string
    time_to_coverage_ms: number
    pre_anchor: number
    entity_tagged: number | null
    has_sentiment: number | null
    provider_timestamp: string | null
    found_at: string
  }>
}

export function insertQaItem(
  db: Database,
  row: {
    runId: string
    eventId: string
    question: string
    goldAnswer: string
    evidenceQuote: string
    sourceKind?: 'filing' | 'article'
    anchorAt?: string | null
    query?: string | null
    stale?: boolean
    sourceType?: string | null
  }
): number | null {
  try {
    const result = db
      .prepare(
        `INSERT INTO qa_items (
          run_id, event_id, question, gold_answer, evidence_quote,
          source_kind, anchor_at, query, stale, source_type
        ) VALUES (
          @runId, @eventId, @question, @goldAnswer, @evidenceQuote,
          @sourceKind, @anchorAt, @query, @stale, @sourceType
        )`
      )
      .run({
        runId: row.runId,
        eventId: row.eventId,
        question: row.question,
        goldAnswer: row.goldAnswer,
        evidenceQuote: row.evidenceQuote,
        sourceKind: row.sourceKind ?? 'filing',
        anchorAt: row.anchorAt ?? null,
        query: row.query ?? null,
        stale: row.stale ? 1 : 0,
        sourceType: row.sourceType ?? null,
      })
    return Number(result.lastInsertRowid)
  } catch {
    return null
  }
}

export function markQaItemStale(db: Database, qaItemId: number): void {
  db.prepare(`UPDATE qa_items SET stale = 1 WHERE id = ?`).run(qaItemId)
}

export function listQaItems(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM qa_items WHERE run_id = ?`)
    .all(runId) as Array<{
    id: number
    event_id: string
    question: string
    gold_answer: string
    evidence_quote: string
    source_kind: string
    anchor_at: string | null
    query: string | null
    stale: number
    source_type: string | null
  }>
}

export function listQaItemsForRuns(db: Database, runIds: string[]) {
  if (runIds.length === 0) {
    return []
  }
  const placeholders = runIds.map(() => '?').join(', ')
  return db
    .prepare(`SELECT * FROM qa_items WHERE run_id IN (${placeholders})`)
    .all(...runIds) as ReturnType<typeof listQaItems>
}

export function listQaResultsForRuns(db: Database, runIds: string[]) {
  if (runIds.length === 0) {
    return []
  }
  const placeholders = runIds.map(() => '?').join(', ')
  return db
    .prepare(`SELECT * FROM qa_results WHERE run_id IN (${placeholders})`)
    .all(...runIds) as ReturnType<typeof listQaResults>
}

export function getCachedQuery(db: Database, cacheKey: string): string | null {
  const row = db
    .prepare(`SELECT rewritten_query FROM qa_queries WHERE cache_key = ?`)
    .get(cacheKey) as { rewritten_query: string } | null
  return row?.rewritten_query ?? null
}

export function setCachedQuery(
  db: Database,
  cacheKey: string,
  question: string,
  model: string,
  rewrittenQuery: string
): void {
  db.prepare(
    `INSERT OR REPLACE INTO qa_queries (cache_key, question, model, rewritten_query, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(cacheKey, question, model, rewrittenQuery, new Date().toISOString())
}

export function hasStaticQaResult(
  db: Database,
  runId: string,
  questionId: string,
  providerId: string
): boolean {
  const row = db
    .prepare(`SELECT 1 FROM static_qa_results WHERE run_id = ? AND question_id = ? AND provider_id = ?`)
    .get(runId, questionId, providerId)
  return row !== null && row !== undefined
}

export function insertStaticQaResult(
  db: Database,
  row: {
    runId: string
    questionId: string
    providerId: string
    searchQuery: string
    synthesizedAnswer: string
    grade: string
    responseMs: number
    error: string | null
  }
): void {
  db.prepare(
    `INSERT OR IGNORE INTO static_qa_results (
      run_id, question_id, provider_id, search_query, synthesized_answer,
      grade, response_ms, error, graded_at
    ) VALUES (
      @runId, @questionId, @providerId, @searchQuery, @synthesizedAnswer,
      @grade, @responseMs, @error, @gradedAt
    )`
  ).run({ ...row, gradedAt: new Date().toISOString() })
}

export function listStaticQaResults(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM static_qa_results WHERE run_id = ?`)
    .all(runId) as Array<{
    question_id: string
    provider_id: string
    search_query: string
    synthesized_answer: string
    grade: string
    response_ms: number
    error: string | null
  }>
}

export function insertQaResult(
  db: Database,
  row: {
    runId: string
    qaItemId: number
    providerId: string
    delayMinutes: number
    synthesizedAnswer: string
    grade: string
  }
): void {
  db.prepare(
    `INSERT OR IGNORE INTO qa_results (
      run_id, qa_item_id, provider_id, delay_minutes, synthesized_answer, grade, graded_at
    ) VALUES (@runId, @qaItemId, @providerId, @delayMinutes, @synthesizedAnswer, @grade, @gradedAt)`
  ).run({ ...row, gradedAt: new Date().toISOString() })
}

export function listQaResults(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM qa_results WHERE run_id = ?`)
    .all(runId) as Array<{
    qa_item_id: number
    provider_id: string
    delay_minutes: number
    grade: string
  }>
}

export function hasQaResult(
  db: Database,
  runId: string,
  qaItemId: number,
  providerId: string,
  delayMinutes: number
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM qa_results WHERE run_id = ? AND qa_item_id = ? AND provider_id = ? AND delay_minutes = ?`
    )
    .get(runId, qaItemId, providerId, delayMinutes)
  return row !== null && row !== undefined
}
