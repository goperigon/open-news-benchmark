import { readFileSync } from 'node:fs'

import { cyberBreachPerigonMonitorPath } from '../lib/paths.ts'
import { envPresent } from '../providers/types.ts'
import { normalizeFromMonitorEvent } from '../cyber/claim-normalize.ts'
import type { DiscoveryAdapter, DiscoveryPollResult } from './types.ts'

function monitorUuid(): string {
  const fromEnv = process.env.PERIGON_MONITOR_ID?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const raw = JSON.parse(readFileSync(cyberBreachPerigonMonitorPath(), 'utf8')) as { uuid?: string }
  return raw.uuid ?? ''
}

export function createPerigonMonitorDiscoveryAdapter(): DiscoveryAdapter {
  return {
    id: 'perigon_monitor',
    displayName: 'Perigon Monitor (benchmark config)',
    requiredEnv: ['PERIGON_API_KEY'],
    isConfigured() {
      return envPresent(['PERIGON_API_KEY']) && monitorUuid().length > 0
    },
    async poll(sinceIso: string): Promise<DiscoveryPollResult> {
      const uuid = monitorUuid()
      if (!uuid) {
        return { status: 'skipped_error', incidents: [], responseMs: 0, raw: null, error: 'no monitor uuid' }
      }
      const base = process.env.API_BASE_URL ?? 'https://api.perigon.io'
      const key = process.env.PERIGON_API_KEY ?? ''
      const params = new URLSearchParams({ page: '0', size: '25', sortOrder: 'desc', createdAtFrom: sinceIso })
      const started = performance.now()
      try {
        const response = await fetch(`${base}/v1/api/monitors/${uuid}/events?${params}`, {
          headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        })
        const responseMs = performance.now() - started
        if (!response.ok) {
          const text = await response.text()
          return {
            status: 'skipped_error',
            incidents: [],
            responseMs,
            raw: text.slice(0, 500),
            error: `HTTP ${response.status}`,
          }
        }
        const payload: unknown = await response.json()
        const incidents = parseMonitorEvents(payload)
        return { status: 'ok', incidents, responseMs, raw: payload }
      } catch (error) {
        return {
          status: 'skipped_error',
          incidents: [],
          responseMs: performance.now() - started,
          raw: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

function parseMonitorEvents(payload: unknown) {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload && Array.isArray(payload.data)
      ? payload.data
      : []
  const out = []
  for (const event of data) {
    if (typeof event !== 'object' || event === null) {
      continue
    }
    let dataField: Record<string, unknown> = {}
    if ('data' in event) {
      if (typeof event.data === 'string') {
        try {
          dataField = JSON.parse(event.data) as Record<string, unknown>
        } catch {
          continue
        }
      } else if (typeof event.data === 'object' && event.data !== null) {
        dataField = event.data as Record<string, unknown>
      }
    }
    if ('summary' in event && typeof event.summary === 'string') {
      dataField.summary = event.summary
    }
    if ('articles' in event && Array.isArray(event.articles)) {
      dataField.articles = event.articles
    }
    out.push(...normalizeFromMonitorEvent(dataField))
  }
  return out
}
