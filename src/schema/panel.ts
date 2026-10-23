import { z } from 'zod'

export const SourceTypeSchema = z.enum([
  'wire',
  'press_release_wire',
  'business',
  'regional',
  'non_english',
])

export const PanelSourceSchema = z
  .object({
    domain: z.string().min(1),
    sourceType: SourceTypeSchema,
    language: z.string().min(2).max(5),
    country: z.string().min(2).max(2),
    feedUrl: z.string().url().optional(),
    sitemapUrl: z.string().url().optional(),
  })
  .refine((source) => source.feedUrl !== undefined || source.sitemapUrl !== undefined, {
    message: 'A panel source needs a feedUrl, a sitemapUrl, or both',
  })

export const PanelFileSchema = z.object({
  schemaVersion: z.literal(1),
  registeredAt: z.string(),
  description: z.string(),
  sources: z.array(PanelSourceSchema).min(1),
})

export type PanelSource = z.infer<typeof PanelSourceSchema>
export type PanelFile = z.infer<typeof PanelFileSchema>

export const LatencyConfigSchema = z.object({
  groundTruthPollIntervalMs: z.number().int().positive(),
  providerProbeIntervalMs: z.number().int().positive(),
  trackingWindowMs: z.number().int().positive(),
  maxPublisherAgeMs: z.number().int().positive(),
  domainBatchSize: z.number().int().positive(),
  targetArticleCount: z.number().int().positive(),
  maxArticlesPerDomain: z.number().int().positive(),
  latencyWindowMs: z.number().int().positive(),
  coverageWindowMs: z.number().int().positive(),
  quickRunDurationMs: z.number().int().positive(),
  defaultRunDurationMs: z.number().int().positive(),
})

export type LatencyConfig = z.infer<typeof LatencyConfigSchema>
