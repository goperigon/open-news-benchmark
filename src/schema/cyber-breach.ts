import { z } from 'zod'

import { PanelFileSchema } from './panel.ts'

export const CyberBreachConfigSchema = z.object({
  groundTruthPollIntervalMs: z.number().int().positive(),
  maxPublisherAgeMs: z.number().int().positive(),
  discoveryPollIntervalMs: z.number().int().positive(),
  trackingWindowMs: z.number().int().positive(),
  incidentClusterWindowMs: z.number().int().positive(),
  targetIncidentCount: z.number().int().positive(),
  quickTargetIncidentCount: z.number().int().positive(),
  quickRunDurationMs: z.number().int().positive(),
  quickTrackingWindowMs: z.number().int().positive(),
  defaultRunDurationMs: z.number().int().positive(),
})

export type CyberBreachConfig = z.infer<typeof CyberBreachConfigSchema>

export const CyberPanelFileSchema = PanelFileSchema

export const NormalizedCyberIncidentSchema = z.object({
  discoveryDate: z.string().optional(),
  shortDescription: z.string(),
  attackType: z.string().optional(),
  impactedOrganizationNames: z.array(z.string()),
  impactedOrganizationDomains: z.array(z.string()).optional(),
  organizationRoles: z.array(z.string()).optional(),
  peopleAffectedCount: z.number().int().nullable().optional(),
  dataTypesCompromised: z.array(z.string()).optional(),
  countriesAffected: z.array(z.string()).optional(),
  citationUrls: z.array(z.string()),
})

export type NormalizedCyberIncident = z.infer<typeof NormalizedCyberIncidentSchema>
