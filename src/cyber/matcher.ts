import type { Database } from 'bun:sqlite'

import type { NormalizedCyberIncident } from '../schema/cyber-breach.ts'
import { orgKeysForIncident } from './claim-normalize.ts'
import { orgKeysOverlap } from './org-normalize.ts'
import { filterIncidentsWithVerifiedUrls } from './url-verifier.ts'
import {
  insertCyberClaim,
  listCyberIncidents,
  upsertCyberFinding,
  type CyberIncidentRow,
} from '../store/cyber-db.ts'

export function findMatchingIncident(
  incidents: CyberIncidentRow[],
  claimKeys: string[],
  claimAtMs: number,
  clusterWindowMs: number
): CyberIncidentRow | null {
  for (const incident of incidents) {
    const incidentMs = Date.parse(incident.first_seen_at)
    if (Math.abs(claimAtMs - incidentMs) > clusterWindowMs) {
      continue
    }
    const incidentKeys = [incident.org_key]
    if (orgKeysOverlap(claimKeys, incidentKeys)) {
      return incident
    }
  }
  return null
}

export async function recordClaimsForPoll(
  db: Database,
  runId: string,
  participantId: string,
  polledAt: string,
  incidents: NormalizedCyberIncident[],
  responseMs: number,
  status: string,
  payload: unknown,
  clusterWindowMs: number,
  trackingWindowMs: number
): Promise<void> {
  const polledMs = Date.parse(polledAt)
  const existing = listCyberIncidents(db, runId)
  const verifiedIncidents =
    status === 'ran' ? await filterIncidentsWithVerifiedUrls(incidents) : incidents

  for (const [index, incident] of verifiedIncidents.entries()) {
    const normalizedJson = JSON.stringify(incident)
    const claimId = insertCyberClaim(db, {
      run_id: runId,
      participant_id: participantId,
      polled_at: polledAt,
      external_id: `${polledAt}-${index}`,
      payload_json: JSON.stringify(payload),
      normalized_json: normalizedJson,
      response_ms: responseMs,
      status,
    })

    const keys = orgKeysForIncident(incident)
    if (keys.length === 0) {
      continue
    }

    let match = findMatchingIncident(existing, keys, polledMs, clusterWindowMs)
    if (!match) {
      continue
    }

    const firstSeenMs = Date.parse(match.first_seen_at)
    const timeToFind = polledMs - firstSeenMs
    if (timeToFind < 0 || timeToFind > trackingWindowMs) {
      continue
    }

    upsertCyberFinding(db, {
      run_id: runId,
      incident_id: match.id,
      participant_id: participantId,
      first_found_at: polledAt,
      time_to_find_ms: timeToFind,
      claim_id: claimId,
    })
  }
}
