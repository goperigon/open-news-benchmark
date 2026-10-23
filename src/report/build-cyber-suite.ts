import type { Database } from 'bun:sqlite'

import { allDiscoveryAdapters } from '../discovery/registry.ts'
import type { RunRow } from '../store/db.ts'
import {
  listCyberAdjudications,
  listCyberClaims,
  listCyberFindings,
  listCyberIncidents,
} from '../store/cyber-db.ts'
import type { CyberBreachSuiteResult } from '../schema/results.ts'
import { buildCyberComparisonCard } from './cyber-comparison-card.ts'

const M15 = 15 * 60_000
const M60 = 60 * 60_000
const M240 = 240 * 60_000

function enrichmentFromClaims(claims: ReturnType<typeof listCyberClaims>, participantId: string) {
  const mine = claims.filter((c) => c.participant_id === participantId && c.status === 'ran')
  if (mine.length === 0) {
    return { orgNamesRate: 0, peopleAffectedRate: 0, dataTypesRate: 0 }
  }
  let org = 0
  let people = 0
  let dataTypes = 0
  for (const row of mine) {
    const parsed = JSON.parse(row.normalized_json) as {
      impactedOrganizationNames?: string[]
      peopleAffectedCount?: number | null
      dataTypesCompromised?: string[]
    }
    if ((parsed.impactedOrganizationNames?.length ?? 0) > 0) {
      org += 1
    }
    if (typeof parsed.peopleAffectedCount === 'number' && parsed.peopleAffectedCount > 0) {
      people += 1
    }
    if ((parsed.dataTypesCompromised?.length ?? 0) > 0) {
      dataTypes += 1
    }
  }
  const n = mine.length
  return { orgNamesRate: org / n, peopleAffectedRate: people / n, dataTypesRate: dataTypes / n }
}

function metricsForParticipant(
  incidents: ReturnType<typeof listCyberIncidents>,
  findings: ReturnType<typeof listCyberFindings>,
  participantId: string,
  windowMs: number
) {
  const panelIncidents = incidents.filter((i) => i.pooled === 0)
  const n = panelIncidents.length
  if (n === 0) {
    return {
      incidentCount: 0,
      coveredWithin: { m15: 0, m60: 0, m240: 0 },
      medianTimeToFindMs: null,
      neverFoundShare: 1,
      enrichment: { orgNamesRate: 0, peopleAffectedRate: 0, dataTypesRate: 0 },
      unsupportedClaimsPer100: 0,
    }
  }
  const byIncident = new Map<number, number>()
  for (const f of findings.filter((x) => x.participant_id === participantId)) {
    byIncident.set(f.incident_id, f.time_to_find_ms)
  }
  let m15 = 0
  let m60 = 0
  let m240 = 0
  const times: number[] = []
  for (const incident of panelIncidents) {
    const t = byIncident.get(incident.id)
    if (t === undefined || t > windowMs) {
      continue
    }
    times.push(t)
    if (t <= M15) {
      m15 += 1
    }
    if (t <= M60) {
      m60 += 1
    }
    if (t <= M240) {
      m240 += 1
    }
  }
  times.sort((a, b) => a - b)
  const median = times.length > 0 ? times[Math.floor(times.length / 2)] ?? null : null
  const found = times.length
  return {
    incidentCount: n,
    coveredWithin: { m15: m15 / n, m60: m60 / n, m240: m240 / n },
    medianTimeToFindMs: median,
    neverFoundShare: 1 - found / n,
    enrichment: { orgNamesRate: 0, peopleAffectedRate: 0, dataTypesRate: 0 },
    unsupportedClaimsPer100: 0,
  }
}

export function buildCyberBreachSuite(
  db: Database,
  run: RunRow,
  trackingWindowMs: number
): CyberBreachSuiteResult {
  const incidents = listCyberIncidents(db, run.id)
  const findings = listCyberFindings(db, run.id)
  const claims = listCyberClaims(db, run.id)
  const adjudications = listCyberAdjudications(db, run.id)

  const providers = allDiscoveryAdapters().map((adapter) => {
    const participantClaims = claims.filter((c) => c.participant_id === adapter.id)
    const ran = participantClaims.some((c) => c.status === 'ran')
    const configured = adapter.isConfigured()
    const base = metricsForParticipant(incidents, findings, adapter.id, trackingWindowMs)
    const enrichment = enrichmentFromClaims(claims, adapter.id)
    const unsupported = adjudications.filter((a) => a.verdict === 'unsupported').length
    const claimCount = participantClaims.length
    const status = ran
      ? ('ran' as const)
      : configured
        ? ('skipped_error' as const)
        : ('skipped_missing_key' as const)
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      timingResolutionMs: 900_000,
      metrics: {
        ...base,
        enrichment,
        unsupportedClaimsPer100: claimCount > 0 ? (unsupported / claimCount) * 100 : 0,
      },
    }
  })

  return {
    id: 'cyber-breach',
    runId: run.id,
    windowStart: run.started_at,
    windowEnd: run.ended_at ?? new Date().toISOString(),
    panelHash: run.panel_hash,
    configHash: run.config_hash,
    discoveryPollIntervalMs: 900_000,
    trackingWindowMs,
    providers,
    comparisonCard: buildCyberComparisonCard(providers),
  }
}
