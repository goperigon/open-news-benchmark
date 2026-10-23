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

function citationUrlFromEventContext(data: Record<string, unknown>): string | null {
  if (typeof data.url === 'string' && data.url.startsWith('http')) {
    return data.url
  }
  if (Array.isArray(data.articles)) {
    for (const article of data.articles) {
      if (typeof article === 'object' && article !== null && 'url' in article) {
        const url = article.url
        if (typeof url === 'string' && url.startsWith('http')) {
          return url
        }
      }
    }
  }
  if (
    typeof data.source === 'object' &&
    data.source !== null &&
    'domain' in data.source &&
    typeof data.source.domain === 'string'
  ) {
    return `https://${data.source.domain}/`
  }
  return null
}

export function normalizeFromMonitorEvent(data: Record<string, unknown>): NormalizedCyberIncident[] {
  const names = Array.isArray(data.affectedOrganizationName)
    ? data.affectedOrganizationName.filter((x): x is string => typeof x === 'string')
    : []
  if (names.length === 0) {
    return []
  }
  const url = citationUrlFromEventContext(data)
  if (!url) {
    return []
  }
  const recordCount =
    typeof data.affectedRecordsCount === 'number'
      ? Math.floor(data.affectedRecordsCount)
      : typeof data.peopleAffectedCount === 'number'
        ? Math.floor(data.peopleAffectedCount)
        : null
  const dataTypes = Array.isArray(data.dataTypeCompromised)
    ? data.dataTypeCompromised.filter((x): x is string => typeof x === 'string')
    : Array.isArray(data.dataTypesCompromised)
      ? data.dataTypesCompromised.filter((x): x is string => typeof x === 'string')
      : undefined
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
    peopleAffectedCount: recordCount,
    dataTypesCompromised: dataTypes,
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
