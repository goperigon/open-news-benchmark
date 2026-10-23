import { z } from 'zod'

export const RESULTS_SCHEMA_VERSION = 1 as const

export const ProviderRunStatusSchema = z.enum([
  'ran',
  'skipped_missing_key',
  'skipped_error',
  'budget_exhausted',
])

export const LatencyMetricsSchema = z.object({
  articleCount: z.number().int().nonnegative(),
  foundWithinMinutes: z.object({
    m5: z.number(),
    m15: z.number(),
    m60: z.number(),
  }),
  medianTimeToIndexMs: z.number().nullable(),
  p90TimeToIndexMs: z.number().nullable(),
  neverFoundShare: z.number(),
  timeToIndexCurve: z.array(
    z.object({
      minutes: z.number(),
      cumulativeShare: z.number(),
    })
  ),
  medianApiResponseMs: z.number().nullable(),
  matchMethodShares: z
    .object({
      url: z.number(),
      canonical: z.number(),
      slug: z.number(),
      title: z.number(),
      fuzzy_title: z.number(),
    })
    .optional(),
})

export const EventCoverageMetricsSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  coveredWithin: z.object({
    m5: z.number(),
    m15: z.number(),
    m60: z.number(),
    m240: z.number(),
  }),
  medianTimeToCoverageMs: z.number().nullable(),
  p90TimeToCoverageMs: z.number().nullable(),
  preAnchorShare: z.number(),
  firstCoverageShare: z.number().nullable(),
  medianLeadVsNextFastestMs: z.number().nullable(),
  structuredFindableWithin: z.object({
    m15: z.number().nullable(),
    m60: z.number().nullable(),
  }),
  entityTaggedShare: z.number().nullable(),
  sentimentPresentShare: z.number().nullable(),
  selfReportedMedianLagMs: z.number().nullable(),
})

export const FirstFoundPairSchema = z.object({
  providerA: z.string(),
  providerB: z.string(),
  aFirstShare: z.number(),
  medianLeadMinutesWhenAFirst: z.number().nullable(),
})

export const BreakdownMetricsSchema = z.object({
  dimension: z.enum(['sourceType', 'language', 'tier', 'itemType']),
  value: z.string(),
  metrics: LatencyMetricsSchema.or(EventCoverageMetricsSchema),
})

export const ProviderResultSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  status: ProviderRunStatusSchema,
  declaredTier: z.string().optional(),
  timingResolutionMs: z.number(),
  metrics: LatencyMetricsSchema.optional(),
  coverageMetrics: LatencyMetricsSchema.optional(),
  keywordMetrics: EventCoverageMetricsSchema.optional(),
  structuredMetrics: EventCoverageMetricsSchema.optional(),
})

export const LatencySuiteResultSchema = z.object({
  id: z.literal('latency'),
  runId: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  panelHash: z.string(),
  configHash: z.string(),
  groundTruthPollIntervalMs: z.number(),
  providerProbeIntervalMs: z.number(),
  /** Per-article cap: finds after first_seen_at + this ms are excluded from headline metrics. */
  equalIndexWindowMs: z.number().int().positive().optional(),
  /** Per-article coverage window: finds within this ms count toward coverageMetrics. */
  coverageWindowMs: z.number().int().positive().optional(),
  providers: z.array(ProviderResultSchema),
  firstFoundPairs: z.array(FirstFoundPairSchema),
  breakdowns: z.array(BreakdownMetricsSchema),
})

export const EventCoverageSuiteResultSchema = z.object({
  id: z.literal('event-coverage'),
  runId: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  universeHash: z.string(),
  configHash: z.string(),
  anchorPollIntervalMs: z.number(),
  probeOffsetsMinutes: z.array(z.number()),
  preAnchorWindowMs: z.number(),
  llmModels: z.object({
    qaWriter: z.string().optional(),
    synthesizer: z.string().optional(),
    grader: z.string().optional(),
  }),
  providers: z.array(ProviderResultSchema),
  breakdowns: z.array(BreakdownMetricsSchema),
})

export const FreshQaSuiteResultSchema = z.object({
  id: z.literal('fresh-qa'),
  runId: z.string(),
  sourceRunIds: z.array(z.string()).optional(),
  windowStart: z.string(),
  windowEnd: z.string(),
  configHash: z.string(),
  probeDelaysMinutes: z.array(z.number()),
  llmModels: z.object({
    qaWriter: z.string().optional(),
    synthesizer: z.string().optional(),
    grader: z.string().optional(),
    queryRewrite: z.string().optional(),
  }),
  providers: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      status: ProviderRunStatusSchema,
      byDelay: z.array(
        z.object({
          delayMinutes: z.number(),
          n: z.number(),
          accuracy: z.number(),
          notAttemptedRate: z.number(),
        })
      ),
    })
  ),
  breakdowns: z
    .array(
      z.object({
        dimension: z.enum(['sourceKind', 'sourceType']),
        value: z.string(),
        byDelay: z.array(
          z.object({
            delayMinutes: z.number(),
            n: z.number(),
            accuracy: z.number(),
            notAttemptedRate: z.number(),
          })
        ),
      })
    )
    .optional(),
})

export const CyberBreachMetricsSchema = z.object({
  incidentCount: z.number().int().nonnegative(),
  coveredWithin: z.object({
    m15: z.number(),
    m60: z.number(),
    m240: z.number(),
  }),
  medianTimeToFindMs: z.number().nullable(),
  neverFoundShare: z.number(),
  enrichment: z.object({
    orgNamesRate: z.number(),
    peopleAffectedRate: z.number(),
    dataTypesRate: z.number(),
  }),
  unsupportedClaimsPer100: z.number(),
})

export const CyberBreachSuiteResultSchema = z.object({
  id: z.literal('cyber-breach'),
  runId: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  panelHash: z.string(),
  configHash: z.string(),
  discoveryPollIntervalMs: z.number(),
  trackingWindowMs: z.number(),
  providers: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      status: ProviderRunStatusSchema,
      timingResolutionMs: z.number(),
      metrics: CyberBreachMetricsSchema.optional(),
    })
  ),
  comparisonCard: z.string(),
})

export type CyberBreachSuiteResult = z.infer<typeof CyberBreachSuiteResultSchema>

export const FreshQaStaticSuiteResultSchema = z.object({
  id: z.literal('freshqa-static'),
  runId: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  configHash: z.string(),
  datasetVersion: z.string(),
  datasetSha256: z.string(),
  split: z.string(),
  lookbackDays: z.number(),
  topKArticles: z.number(),
  llmModels: z.object({
    synthesizer: z.string().optional(),
    grader: z.string().optional(),
    queryRewrite: z.string().optional(),
  }),
  providers: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      status: ProviderRunStatusSchema,
      overall: z.object({
        n: z.number(),
        accuracy: z.number(),
        notAttemptedRate: z.number(),
        errorRate: z.number(),
        medianResponseMs: z.number().nullable(),
      }),
      byFactType: z.array(
        z.object({
          factType: z.string(),
          n: z.number(),
          accuracy: z.number(),
          notAttemptedRate: z.number(),
          errorRate: z.number(),
          medianResponseMs: z.number().nullable(),
        })
      ),
    })
  ),
})

export const SuiteResultSchema = z.discriminatedUnion('id', [
  LatencySuiteResultSchema,
  EventCoverageSuiteResultSchema,
  FreshQaSuiteResultSchema,
  FreshQaStaticSuiteResultSchema,
  CyberBreachSuiteResultSchema,
])

export const BenchmarkSourceRunsSchema = z.object({
  latency: z.string().optional(),
  eventCoverage: z.string().optional(),
  freshQaStatic: z.string().optional(),
})

export const BenchmarkResultsSchema = z.object({
  schemaVersion: z.literal(RESULTS_SCHEMA_VERSION),
  benchmarkProductVersion: z.enum(['v1', 'v2']),
  sourceRuns: BenchmarkSourceRunsSchema.optional(),
  generatedAt: z.string(),
  harnessGitSha: z.string(),
  region: z.string(),
  suites: z.array(SuiteResultSchema),
})

export type BenchmarkResults = z.infer<typeof BenchmarkResultsSchema>
export type LatencyMetrics = z.infer<typeof LatencyMetricsSchema>
export type EventCoverageMetrics = z.infer<typeof EventCoverageMetricsSchema>
export type SuiteResult = z.infer<typeof SuiteResultSchema>
