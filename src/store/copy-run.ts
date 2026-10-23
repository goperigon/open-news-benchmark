import type { Database } from 'bun:sqlite'

import { openDatabase, type RunRow } from './db.ts'

type SqlRow = Record<string, string | number | bigint | boolean | null | Uint8Array>

function runRow(stmt: ReturnType<Database['prepare']>, row: SqlRow): void {
  stmt.run(row)
}

function assertRunAbsent(db: Database, runId: string): void {
  const existing = db.prepare(`SELECT id FROM runs WHERE id = ?`).get(runId) as { id: string } | null
  if (existing) {
    throw new Error(
      `[db merge-run] run ${runId} already exists in target database; pick a new --run-id or remove the old run`
    )
  }
}

function copyRunRow(db: Database, row: RunRow): void {
  db.prepare(
    `INSERT INTO runs (id, suite_id, started_at, ended_at, panel_hash, config_hash, harness_git_sha, region)
     VALUES (@id, @suite_id, @started_at, @ended_at, @panel_hash, @config_hash, @harness_git_sha, @region)`
  ).run({
    id: row.id,
    suite_id: row.suite_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    panel_hash: row.panel_hash,
    config_hash: row.config_hash,
    harness_git_sha: row.harness_git_sha,
    region: row.region,
  })
}

function copyRunProviders(from: Database, to: Database, runId: string): void {
  const rows = from
    .prepare(`SELECT * FROM run_providers WHERE run_id = ?`)
    .all(runId) as Array<Record<string, unknown>>
  const insert = to.prepare(
    `INSERT INTO run_providers (run_id, provider_id, status, declared_tier, timing_resolution_ms)
     VALUES (@run_id, @provider_id, @status, @declared_tier, @timing_resolution_ms)`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

function copyArticlesAndObservations(from: Database, to: Database, runId: string): void {
  const articles = from
    .prepare(`SELECT * FROM articles WHERE run_id = ?`)
    .all(runId) as Array<Record<string, unknown> & { id: number }>
  const articleIdMap = new Map<number, number>()
  const insertArticle = to.prepare(
    `INSERT INTO articles (
      run_id, url, normalized_url, domain, title, normalized_title,
      source_type, language, country, publisher_published_at, first_seen_at, tracking_ends_at
    ) VALUES (
      @run_id, @url, @normalized_url, @domain, @title, @normalized_title,
      @source_type, @language, @country, @publisher_published_at, @first_seen_at, @tracking_ends_at
    )`
  )
  for (const row of articles) {
    const oldId = row.id
    runRow(insertArticle, row as SqlRow)
    const newId = to.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }
    articleIdMap.set(oldId, newId.id)
  }

  const observations = from
    .prepare(`SELECT * FROM observations WHERE run_id = ?`)
    .all(runId) as Array<Record<string, unknown> & { article_id: number }>
  const insertObs = to.prepare(
    `INSERT INTO observations (run_id, article_id, provider_id, found_at, match_method, time_to_index_ms, provider_timestamp)
     VALUES (@run_id, @article_id, @provider_id, @found_at, @match_method, @time_to_index_ms, @provider_timestamp)`
  )
  for (const row of observations) {
    const mapped = articleIdMap.get(row.article_id)
    if (mapped === undefined) {
      continue
    }
    runRow(insertObs, {
      ...row,
      article_id: mapped,
      provider_timestamp: row.provider_timestamp ?? null,
    } as SqlRow)
  }
}

function copyRequests(from: Database, to: Database, runId: string): void {
  const rows = from.prepare(`SELECT * FROM requests WHERE run_id = ?`).all(runId) as Array<
    Record<string, unknown>
  >
  const insert = to.prepare(
    `INSERT INTO requests (run_id, provider_id, requested_at, response_ms, status, error)
     VALUES (@run_id, @provider_id, @requested_at, @response_ms, @status, @error)`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

function copyBenchEvents(from: Database, to: Database, runId: string): void {
  const rows = from.prepare(`SELECT * FROM bench_events WHERE run_id = ?`).all(runId) as Array<
    Record<string, unknown>
  >
  const insert = to.prepare(
    `INSERT INTO bench_events (
      id, run_id, anchor_source, anchor_at, detected_at, accession_number, cik, ticker,
      company_name, tier, item_types, edgar_link, scheduled_name, probe_terms
    ) VALUES (
      @id, @run_id, @anchor_source, @anchor_at, @detected_at, @accession_number, @cik, @ticker,
      @company_name, @tier, @item_types, @edgar_link, @scheduled_name, @probe_terms
    )`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

function copyEventProbes(from: Database, to: Database, runId: string): void {
  const rows = from.prepare(`SELECT * FROM event_probes WHERE run_id = ?`).all(runId) as Array<
    Record<string, unknown>
  >
  const insert = to.prepare(
    `INSERT INTO event_probes (
      run_id, event_id, provider_id, offset_minutes, mode, requested_at, response_ms, status, error
    ) VALUES (
      @run_id, @event_id, @provider_id, @offset_minutes, @mode, @requested_at, @response_ms, @status, @error
    )`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

function copyEventObservations(from: Database, to: Database, runId: string): void {
  const rows = from
    .prepare(`SELECT * FROM event_observations WHERE run_id = ?`)
    .all(runId) as Array<Record<string, unknown>>
  const insert = to.prepare(
    `INSERT INTO event_observations (
      run_id, event_id, provider_id, mode, url, title, found_at, offset_minutes,
      time_to_coverage_ms, pre_anchor, entity_tagged, has_sentiment, provider_timestamp, match_method
    ) VALUES (
      @run_id, @event_id, @provider_id, @mode, @url, @title, @found_at, @offset_minutes,
      @time_to_coverage_ms, @pre_anchor, @entity_tagged, @has_sentiment, @provider_timestamp, @match_method
    )`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

function copyQaItemsAndResults(from: Database, to: Database, runId: string): void {
  const items = from.prepare(`SELECT * FROM qa_items WHERE run_id = ?`).all(runId) as Array<
    Record<string, unknown> & { id: number }
  >
  const itemIdMap = new Map<number, number>()
  const insertItem = to.prepare(
    `INSERT INTO qa_items (
      run_id, event_id, question, gold_answer, evidence_quote,
      source_kind, anchor_at, query, stale, source_type
    ) VALUES (
      @run_id, @event_id, @question, @gold_answer, @evidence_quote,
      @source_kind, @anchor_at, @query, @stale, @source_type
    )`
  )
  for (const row of items) {
    const oldId = row.id
    runRow(insertItem, {
      run_id: String(row.run_id),
      event_id: String(row.event_id),
      question: String(row.question),
      gold_answer: String(row.gold_answer),
      evidence_quote: String(row.evidence_quote),
      source_kind: String(row.source_kind ?? 'filing'),
      anchor_at: row.anchor_at == null ? null : String(row.anchor_at),
      query: row.query == null ? null : String(row.query),
      stale: Number(row.stale ?? 0),
      source_type: row.source_type == null ? null : String(row.source_type),
    })
    const newId = to.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }
    itemIdMap.set(oldId, newId.id)
  }

  const results = from.prepare(`SELECT * FROM qa_results WHERE run_id = ?`).all(runId) as Array<
    Record<string, unknown> & { qa_item_id: number }
  >
  const insertResult = to.prepare(
    `INSERT INTO qa_results (
      run_id, qa_item_id, provider_id, delay_minutes, synthesized_answer, grade, graded_at
    ) VALUES (
      @run_id, @qa_item_id, @provider_id, @delay_minutes, @synthesized_answer, @grade, @graded_at
    )`
  )
  for (const row of results) {
    const mapped = itemIdMap.get(row.qa_item_id)
    if (mapped === undefined) {
      continue
    }
    runRow(insertResult, { ...row, qa_item_id: mapped } as SqlRow)
  }
}

function copyStaticQaResults(from: Database, to: Database, runId: string): void {
  const rows = from
    .prepare(`SELECT * FROM static_qa_results WHERE run_id = ?`)
    .all(runId) as Array<Record<string, unknown>>
  const insert = to.prepare(
    `INSERT INTO static_qa_results (
      run_id, question_id, provider_id, search_query, synthesized_answer,
      grade, response_ms, error, graded_at
    ) VALUES (
      @run_id, @question_id, @provider_id, @search_query, @synthesized_answer,
      @grade, @response_ms, @error, @graded_at
    )`
  )
  for (const row of rows) {
    runRow(insert, row as SqlRow)
  }
}

export function copyRunBetweenDatabases(fromDbPath: string, toDbPath: string, runId: string): void {
  const from = openDatabase(fromDbPath)
  const to = openDatabase(toDbPath)
  const run = from.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | null
  if (!run) {
    throw new Error(`[db merge-run] unknown run ${runId} in ${fromDbPath}`)
  }
  assertRunAbsent(to, runId)

  const tx = to.transaction(() => {
    copyRunRow(to, run)
    copyRunProviders(from, to, runId)
    copyArticlesAndObservations(from, to, runId)
    copyRequests(from, to, runId)
    copyBenchEvents(from, to, runId)
    copyEventProbes(from, to, runId)
    copyEventObservations(from, to, runId)
    copyQaItemsAndResults(from, to, runId)
    copyStaticQaResults(from, to, runId)
  })
  tx()
}
