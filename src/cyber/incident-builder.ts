import type { Database } from 'bun:sqlite'

import type { CyberBreachConfig } from '../schema/cyber-breach.ts'
import { guessOrgKeyFromTitle, titleLooksLikeIncident } from './incident-keywords.ts'
import { normalizeOrgName } from './org-normalize.ts'
import { insertCyberIncident, listCyberIncidents } from '../store/cyber-db.ts'

export function maybeCreateIncidentFromArticle(
  db: Database,
  runId: string,
  config: CyberBreachConfig,
  article: { title: string; url: string; first_seen_at: string }
): boolean {
  if (!titleLooksLikeIncident(article.title)) {
    return false
  }
  const guessed = guessOrgKeyFromTitle(article.title)
  const orgKey = guessed ?? normalizeOrgName(article.title.slice(0, 48))
  if (orgKey.length < 3) {
    return false
  }

  const existing = listCyberIncidents(db, runId)
  const seenMs = Date.parse(article.first_seen_at)
  for (const row of existing) {
    if (row.org_key === orgKey) {
      const delta = Math.abs(seenMs - Date.parse(row.first_seen_at))
      if (delta <= config.incidentClusterWindowMs) {
        return false
      }
    }
  }

  const trackingEnds = new Date(seenMs + config.trackingWindowMs).toISOString()
  const id = insertCyberIncident(db, {
    run_id: runId,
    org_key: orgKey,
    first_seen_at: article.first_seen_at,
    tracking_ends_at: trackingEnds,
    primary_title: article.title,
    primary_url: article.url,
  })
  return id !== null
}
