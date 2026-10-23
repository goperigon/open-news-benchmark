import { z } from 'zod'

export const CompanyTierSchema = z.enum(['sp500', 'smallmid'])

export const UniverseCompanySchema = z.object({
  ticker: z.string().min(1),
  cik: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  tier: CompanyTierSchema,
})

export const UniverseFileSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotDate: z.string(),
  sampleSeed: z.number().int(),
  smallmidSampleSize: z.number().int(),
  companies: z.array(UniverseCompanySchema),
})

export type UniverseCompany = z.infer<typeof UniverseCompanySchema>
export type UniverseFile = z.infer<typeof UniverseFileSchema>
