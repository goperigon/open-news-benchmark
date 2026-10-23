import {
  NormalizedCyberIncidentSchema,
  type NormalizedCyberIncident,
} from '../schema/cyber-breach.ts'
import { orgKeysFromNames } from './org-normalize.ts'

export function normalizeFromLlmPayload(raw: unknown): NormalizedCyberIncident[] {
  if (typeof raw !== 'object' || raw === null || !('incidents' in raw)) {
    return []
  }
  const incidents = raw.incidents
  if (!Array.isArray(incidents)) {
    return []
  }
  const out: NormalizedCyberIncident[] = []
  for (const item of incidents) {
    const parsed = NormalizedCyberIncidentSchema.safeParse(item)
    if (parsed.success && parsed.data.citationUrls.length > 0) {
      out.push(parsed.data)
    }
  }
  return out
}

export function normalizeFromMonitorEvent(data: Record<string, unknown>): NormalizedCyberIncident[] {
  const names = Array.isArray(data.affectedOrganizationName)
    ? data.affectedOrganizationName.filter((x): x is string => typeof x === 'string')
    : []
  if (names.length === 0) {
    return []
  }
  const url =
    typeof data.url === 'string'
      ? data.url
      : typeof data.source === 'object' &&
          data.source !== null &&
          'domain' in data.source &&
          typeof data.source.domain === 'string'
        ? `https://${data.source.domain}/`
        : 'https://unknown.local/'
  const incident: NormalizedCyberIncident = {
    shortDescription:
      typeof data.shortDescription === 'string'
        ? data.shortDescription
        : typeof data.summary === 'string'
          ? data.summary
          : names.join(', '),
    attackType:
      typeof data.breachType === 'string' ? data.breachType.replace(/\s+/g, '_').toUpperCase() : 'BREACH',
    impactedOrganizationNames: names,
    impactedOrganizationDomains: [],
    peopleAffectedCount:
      typeof data.peopleAffectedCount === 'number' ? Math.floor(data.peopleAffectedCount) : null,
    countriesAffected:
      typeof data.country === 'string' && data.country.length === 2 ? [data.country.toUpperCase()] : [],
    citationUrls: [url],
    discoveryDate: typeof data.discoveryDate === 'string' ? data.discoveryDate : undefined,
  }
  return [incident]
}

export function orgKeysForIncident(incident: NormalizedCyberIncident): string[] {
  return orgKeysFromNames(incident.impactedOrganizationNames)
}
