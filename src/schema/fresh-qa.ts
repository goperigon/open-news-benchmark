import { z } from 'zod'

export const FreshQaArticleConfigSchema = z.object({
  enabled: z.boolean().default(false),
  samplesPerHour: z.number().int().positive(),
  languages: z.array(z.string()),
  minTextChars: z.number().int().positive(),
  maxQuestionsPerArticle: z.number().int().positive(),
  /** Search window start = anchor_at minus this many minutes (aligns Perigon `from` with RSS/GDELT day windows). */
  searchLookbackMinutes: z.number().int().positive().default(360),
})

export const FreshQaConfigSchema = z.object({
  enabled: z.boolean().default(false),
  probeDelaysMinutes: z.array(z.number().int().positive()),
  topKArticles: z.number().int().positive(),
  maxQuestionsPerEvent: z.number().int().positive(),
  article: FreshQaArticleConfigSchema.default({
    enabled: false,
    samplesPerHour: 30,
    languages: ['en'],
    minTextChars: 600,
    maxQuestionsPerArticle: 1,
    searchLookbackMinutes: 360,
  }),
})

export type FreshQaConfig = z.infer<typeof FreshQaConfigSchema>
