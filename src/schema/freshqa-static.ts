import { z } from 'zod'

export const FreshQaStaticConfigSchema = z.object({
  enabled: z.boolean().default(false),
  datasetFile: z.string(),
  datasetVersion: z.string(),
  datasetSha256: z.string(),
  split: z.string().default('TEST'),
  lookbackDays: z.number().int().positive(),
  topKArticles: z.number().int().positive(),
  concurrencyPerProvider: z.number().int().positive(),
  factTypes: z.array(z.string()).default([]),
  includeFalsePremise: z.boolean().default(true),
})

export type FreshQaStaticConfig = z.infer<typeof FreshQaStaticConfigSchema>

export interface FreshQaStaticQuestion {
  id: string
  question: string
  goldAnswers: string[]
  factType: string
  numHops: string
  falsePremise: string
  split: string
}
