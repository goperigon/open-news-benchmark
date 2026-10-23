import type { Database } from 'bun:sqlite'

const CYBER_SCHEMA = `
CREATE TABLE IF NOT EXISTS cyber_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  org_key TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  tracking_ends_at TEXT NOT NULL,
  primary_title TEXT NOT NULL,
  primary_url TEXT NOT NULL,
  pooled INTEGER NOT NULL DEFAULT 0,
  UNIQUE(run_id, org_key, first_seen_at)
);

CREATE TABLE IF NOT EXISTS cyber_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  polled_at TEXT NOT NULL,
  external_id TEXT,
  payload_json TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  response_ms INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cyber_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  incident_id INTEGER NOT NULL,
  participant_id TEXT NOT NULL,
  first_found_at TEXT NOT NULL,
  time_to_find_ms INTEGER NOT NULL,
  claim_id INTEGER NOT NULL,
  UNIQUE(run_id, incident_id, participant_id)
);

CREATE TABLE IF NOT EXISTS cyber_adjudications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  claim_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  reviewer TEXT,
  notes TEXT,
  UNIQUE(run_id, claim_id)
);

CREATE TABLE IF NOT EXISTS cyber_extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  article_url TEXT NOT NULL,
  article_title TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  graded_json TEXT,
  response_ms INTEGER NOT NULL,
  UNIQUE(run_id, participant_id, article_url)
);

CREATE INDEX IF NOT EXISTS idx_cyber_incidents_run ON cyber_incidents(run_id);
CREATE INDEX IF NOT EXISTS idx_cyber_claims_run ON cyber_claims(run_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_cyber_findings_run ON cyber_findings(run_id, participant_id);
`

export function initCyberSchema(db: Database): void {
  db.exec(CYBER_SCHEMA)
}

export interface CyberIncidentRow {
  id: number
  run_id: string
  org_key: string
  first_seen_at: string
  tracking_ends_at: string
  primary_title: string
  primary_url: string
  pooled: number
}

export function insertCyberIncident(
  db: Database,
  row: Omit<CyberIncidentRow, 'id' | 'pooled'> & { pooled?: number }
): number | null {
  try {
    const result = db
      .prepare(
        `INSERT INTO cyber_incidents (run_id, org_key, first_seen_at, tracking_ends_at, primary_title, primary_url, pooled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.run_id,
        row.org_key,
        row.first_seen_at,
        row.tracking_ends_at,
        row.primary_title,
        row.primary_url,
        row.pooled ?? 0
      )
    return Number(result.lastInsertRowid)
  } catch {
    return null
  }
}

export function listCyberIncidents(db: Database, runId: string): CyberIncidentRow[] {
  return db
    .prepare(`SELECT * FROM cyber_incidents WHERE run_id = ? ORDER BY first_seen_at`)
    .all(runId) as CyberIncidentRow[]
}

export function countCyberIncidents(db: Database, runId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM cyber_incidents WHERE run_id = ? AND pooled = 0`)
    .get(runId) as { c: number }
  return row.c
}

export function insertCyberClaim(
  db: Database,
  row: {
    run_id: string
    participant_id: string
    polled_at: string
    external_id: string | null
    payload_json: string
    normalized_json: string
    response_ms: number
    status: string
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO cyber_claims (run_id, participant_id, polled_at, external_id, payload_json, normalized_json, response_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.run_id,
      row.participant_id,
      row.polled_at,
      row.external_id,
      row.payload_json,
      row.normalized_json,
      row.response_ms,
      row.status
    )
  return Number(result.lastInsertRowid)
}

export function listCyberClaims(db: Database, runId: string) {
  return db.prepare(`SELECT * FROM cyber_claims WHERE run_id = ?`).all(runId) as Array<{
    id: number
    run_id: string
    participant_id: string
    polled_at: string
    external_id: string | null
    payload_json: string
    normalized_json: string
    response_ms: number
    status: string
  }>
}

export function upsertCyberFinding(
  db: Database,
  row: {
    run_id: string
    incident_id: number
    participant_id: string
    first_found_at: string
    time_to_find_ms: number
    claim_id: number
  }
): void {
  const existing = db
    .prepare(
      `SELECT time_to_find_ms FROM cyber_findings WHERE run_id = ? AND incident_id = ? AND participant_id = ?`
    )
    .get(row.run_id, row.incident_id, row.participant_id) as { time_to_find_ms: number } | null
  if (existing && existing.time_to_find_ms <= row.time_to_find_ms) {
    return
  }
  db.prepare(
    `INSERT INTO cyber_findings (run_id, incident_id, participant_id, first_found_at, time_to_find_ms, claim_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, incident_id, participant_id) DO UPDATE SET
       first_found_at = excluded.first_found_at,
       time_to_find_ms = excluded.time_to_find_ms,
       claim_id = excluded.claim_id`
  ).run(
    row.run_id,
    row.incident_id,
    row.participant_id,
    row.first_found_at,
    row.time_to_find_ms,
    row.claim_id
  )
}

export function listCyberFindings(db: Database, runId: string) {
  return db.prepare(`SELECT * FROM cyber_findings WHERE run_id = ?`).all(runId) as Array<{
    id: number
    run_id: string
    incident_id: number
    participant_id: string
    first_found_at: string
    time_to_find_ms: number
    claim_id: number
  }>
}

export function listCyberAdjudications(db: Database, runId: string) {
  return db
    .prepare(`SELECT * FROM cyber_adjudications WHERE run_id = ?`)
    .all(runId) as Array<{
    id: number
    run_id: string
    claim_id: number
    verdict: string
    reviewer: string | null
    notes: string | null
  }>
}

export function upsertCyberAdjudication(
  db: Database,
  row: { run_id: string; claim_id: number; verdict: string; reviewer?: string; notes?: string }
): void {
  db.prepare(
    `INSERT INTO cyber_adjudications (run_id, claim_id, verdict, reviewer, notes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(run_id, claim_id) DO UPDATE SET verdict = excluded.verdict, reviewer = excluded.reviewer, notes = excluded.notes`
  ).run(row.run_id, row.claim_id, row.verdict, row.reviewer ?? null, row.notes ?? null)
}

export function insertCyberExtraction(
  db: Database,
  row: {
    run_id: string
    participant_id: string
    article_url: string
    article_title: string
    extracted_json: string
    response_ms: number
  }
): void {
  db.prepare(
    `INSERT INTO cyber_extractions (run_id, participant_id, article_url, article_title, extracted_json, response_ms)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, participant_id, article_url) DO UPDATE SET extracted_json = excluded.extracted_json, response_ms = excluded.response_ms`
  ).run(
    row.run_id,
    row.participant_id,
    row.article_url,
    row.article_title,
    row.extracted_json,
    row.response_ms
  )
}
