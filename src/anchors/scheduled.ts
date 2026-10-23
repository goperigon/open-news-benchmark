import { readFileSync } from 'node:fs'

import { scheduledEventsPath } from '../lib/paths.ts'

export interface ScheduledMacroEvent {
  id: string
  name: string
  scheduledAt: string
  queryTerms: string[]
  itemTypes: string[]
}

export interface ScheduledDetectedEvent {
  id: string
  anchorSource: 'scheduled'
  anchorAt: string
  detectedAt: string
  name: string
  queryTerms: string[]
  itemTypes: string[]
  probeTerms: string[]
}

export function loadScheduledEvents(): ScheduledMacroEvent[] {
  const raw = JSON.parse(readFileSync(scheduledEventsPath(), 'utf8')) as {
    events: ScheduledMacroEvent[]
  }
  return raw.events
}

export function scheduledEventsDue(nowMs: number): ScheduledDetectedEvent[] {
  const detectedAt = new Date(nowMs).toISOString()
  const out: ScheduledDetectedEvent[] = []
  for (const event of loadScheduledEvents()) {
    const at = Date.parse(event.scheduledAt)
    if (Number.isNaN(at) || at > nowMs) {
      continue
    }
    out.push({
      id: `scheduled:${event.id}`,
      anchorSource: 'scheduled',
      anchorAt: event.scheduledAt,
      detectedAt,
      name: event.name,
      queryTerms: event.queryTerms,
      itemTypes: event.itemTypes.length > 0 ? event.itemTypes : ['macro'],
      probeTerms: event.queryTerms,
    })
  }
  return out
}
