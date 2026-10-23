import type { ProviderArticle } from '../providers/types.ts'
import type { EntityQueryCompany } from '../providers/types.ts'
import { eventTypeKeywords } from '../providers/entity-keyword.ts'
import { openAiConfigured, openAiJson, graderModel } from '../llm/openai.ts'

export function shouldUseRelevanceJudge(relevanceJudgeEnabled: boolean): boolean {
  return relevanceJudgeEnabled && openAiConfigured()
}

export function keywordPrefilterRelevant(
  article: ProviderArticle,
  company: EntityQueryCompany,
  itemTypes: string[]
): boolean {
  const hay = `${article.title} ${article.snippet ?? ''}`.toLowerCase()
  const companyTerms = [company.name, ...company.aliases, company.ticker].map((t) => t.toLowerCase())
  const hasCompany = companyTerms.some((t) => t.length > 1 && hay.includes(t))
  if (!hasCompany) {
    return false
  }
  const eventKws = eventTypeKeywords(itemTypes)
  if (eventKws.length === 0) {
    return true
  }
  return eventKws.some((kw) => hay.includes(kw))
}

export interface RelevanceVerdict {
  relevant: boolean
  reason: string
}

export async function judgeRelevance(input: {
  companyName: string
  ticker: string
  itemTypes: string[]
  article: ProviderArticle
}): Promise<RelevanceVerdict> {
  const prompt = `You judge whether a news article is about a specific SEC filing event for ${input.companyName} (${input.ticker}), item types: ${input.itemTypes.join(', ')}.
Return JSON: {"relevant": boolean, "reason": string}`

  const user = `Title: ${input.article.title}
Snippet: ${input.article.snippet ?? '(none)'}
URL: ${input.article.url}`

  return openAiJson<RelevanceVerdict>(
    graderModel(),
    [
      { role: 'system', content: prompt },
      { role: 'user', content: user },
    ],
    'relevance'
  )
}

export function relevanceCacheKey(eventId: string, url: string): string {
  return `${eventId}|${url}`
}
