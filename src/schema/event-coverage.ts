import { z } from 'zod'

export const EventCoverageConfigSchema = z.object({
  anchorPollIntervalMs: z.number().int().positive(),
  preAnchorWindowMs: z.number().int().nonnegative(),
  probeOffsetsMinutes: z.array(z.number().int().positive()),
  quickRunDurationMs: z.number().int().positive(),
  defaultRunDurationMs: z.number().int().positive(),
  relevanceJudgeMaxCandidates: z.number().int().positive(),
  relevanceJudgeEnabled: z.boolean().default(false),
})

export type EventCoverageConfig = z.infer<typeof EventCoverageConfigSchema>

export const TRACKED_8K_ITEMS = ['1.01', '2.01', '2.02', '5.02', '8.01'] as const
