import { median, percentile } from './percentiles.ts'

export interface EventCoverageInput {
  eventId: string
  tier: string | null
  itemTypes: string[]
  providerId: string
  mode: string
  timeToCoverageMs: number | null
  preAnchor: boolean
  entityTagged: boolean | null
  hasSentiment: boolean | null
  providerTimestampMs: number | null
  anchorMs: number
}

export interface EventCoverageMetrics {
  eventCount: number
  coveredWithin: { m5: number; m15: number; m60: number; m240: number }
  medianTimeToCoverageMs: number | null
  p90TimeToCoverageMs: number | null
  preAnchorShare: number
  firstCoverageShare: number | null
  medianLeadVsNextFastestMs: number | null
  structuredFindableWithin: { m15: number | null; m60: number | null }
  entityTaggedShare: number | null
  sentimentPresentShare: number | null
  selfReportedMedianLagMs: number | null
}

function shareWithin(times: Array<number | null>, eventCount: number, minutes: number): number {
  if (eventCount === 0) {
    return 0
  }
  const limit = minutes * 60_000
  const hit = times.filter((t) => t !== null && t <= limit).length
  return hit / eventCount
}

export function computeEventCoverageMetrics(
  events: Array<{ id: string; tier: string | null; itemTypes: string[]; anchorMs: number }>,
  observations: EventCoverageInput[],
  providerId: string,
  mode: 'keyword' | 'structured',
  allProviderFirstFound?: Map<string, Map<string, number>>
): EventCoverageMetrics {
  const eventCount = events.length
  const byEvent = new Map<string, number | null>()
  const preAnchorFlags: boolean[] = []
  let entityTaggedCount = 0
  let entityTaggedTotal = 0
  let sentimentCount = 0
  let sentimentTotal = 0
  const selfReported: number[] = []

  for (const event of events) {
    const obs = observations.find(
      (o) => o.eventId === event.id && o.providerId === providerId && o.mode === mode
    )
    byEvent.set(event.id, obs?.timeToCoverageMs ?? null)
    if (obs) {
      preAnchorFlags.push(obs.preAnchor)
      if (obs.entityTagged !== null) {
        entityTaggedTotal += 1
        if (obs.entityTagged) {
          entityTaggedCount += 1
        }
      }
      if (obs.hasSentiment !== null) {
        sentimentTotal += 1
        if (obs.hasSentiment) {
          sentimentCount += 1
        }
      }
      if (obs.providerTimestampMs !== null) {
        selfReported.push(obs.providerTimestampMs - event.anchorMs)
      }
    }
  }

  const times = [...byEvent.values()]
  const foundTimes = times.filter((t): t is number => t !== null)

  let firstCoverageShare: number | null = null
  let medianLead: number | null = null
  if (allProviderFirstFound && mode === 'keyword') {
    let first = 0
    let comparable = 0
    const leads: number[] = []
    for (const event of events) {
      const ranking = allProviderFirstFound.get(event.id)
      if (!ranking || ranking.size < 2) {
        continue
      }
      comparable += 1
      const sorted = [...ranking.entries()].sort((a, b) => a[1] - b[1])
      const top = sorted[0]
      const second = sorted[1]
      if (top?.[0] === providerId) {
        first += 1
        if (second) {
          leads.push(second[1] - top[1])
        }
      }
    }
    firstCoverageShare = comparable === 0 ? null : first / comparable
    medianLead = leads.length === 0 ? null : median(leads)
  }

  const structuredSupported = mode === 'structured'
  return {
    eventCount,
    coveredWithin: {
      m5: shareWithin(times, eventCount, 5),
      m15: shareWithin(times, eventCount, 15),
      m60: shareWithin(times, eventCount, 60),
      m240: shareWithin(times, eventCount, 240),
    },
    medianTimeToCoverageMs: median(foundTimes),
    p90TimeToCoverageMs: percentile(foundTimes, 90),
    preAnchorShare:
      preAnchorFlags.length === 0
        ? 0
        : preAnchorFlags.filter(Boolean).length / preAnchorFlags.length,
    firstCoverageShare,
    medianLeadVsNextFastestMs: medianLead,
    structuredFindableWithin:
      mode === 'structured'
        ? {
            m15: shareWithin(times, eventCount, 15),
            m60: shareWithin(times, eventCount, 60),
          }
        : { m15: null, m60: null },
    entityTaggedShare:
      structuredSupported && entityTaggedTotal > 0 ? entityTaggedCount / entityTaggedTotal : null,
    sentimentPresentShare:
      structuredSupported && sentimentTotal > 0 ? sentimentCount / sentimentTotal : null,
    selfReportedMedianLagMs: selfReported.length > 0 ? median(selfReported) : null,
  }
}

export function buildFirstFoundMap(
  events: Array<{ id: string }>,
  observations: EventCoverageInput[]
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>()
  for (const event of events) {
    const inner = new Map<string, number>()
    for (const obs of observations.filter((o) => o.eventId === event.id && o.mode === 'keyword')) {
      if (obs.timeToCoverageMs !== null) {
        inner.set(obs.providerId, obs.timeToCoverageMs)
      }
    }
    if (inner.size > 0) {
      map.set(event.id, inner)
    }
  }
  return map
}
