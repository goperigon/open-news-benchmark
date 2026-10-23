import type { LatencyMetrics } from '../schema/results.ts'
import { buildTimeToIndexCurve, shareFoundWithin } from './curve.ts'
import { median, percentile } from './percentiles.ts'

export interface ArticleObservation {
  articleId: number
  sourceType: string
  language: string
  timeToIndexMs: number | null
}

/** Finds after the per-article window count as not found for published latency metrics. */
export function timeToIndexForEqualWindow(
  timeToIndexMs: number | null | undefined,
  equalWindowMs: number
): number | null {
  if (timeToIndexMs === null || timeToIndexMs === undefined) {
    return null
  }
  return timeToIndexMs <= equalWindowMs ? timeToIndexMs : null
}

export function computeLatencyMetrics(
  articles: ArticleObservation[],
  responseMsSamples: number[]
): LatencyMetrics {
  const articleCount = articles.length
  const times = articles.map((a) => a.timeToIndexMs)
  const foundTimes = times.filter((t): t is number => t !== null)
  const neverFoundShare =
    articleCount === 0 ? 0 : (articleCount - foundTimes.length) / articleCount

  return {
    articleCount,
    foundWithinMinutes: {
      m5: shareFoundWithin(times, articleCount, 5),
      m15: shareFoundWithin(times, articleCount, 15),
      m60: shareFoundWithin(times, articleCount, 60),
    },
    medianTimeToIndexMs: median(foundTimes),
    p90TimeToIndexMs: percentile(foundTimes, 90),
    neverFoundShare,
    timeToIndexCurve: buildTimeToIndexCurve(times, articleCount),
    medianApiResponseMs: median(responseMsSamples),
  }
}
