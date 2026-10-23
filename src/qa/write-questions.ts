import type { Database } from 'bun:sqlite'

import type { BenchEventRow } from '../store/event-db.ts'
import { insertQaItem } from '../store/event-db.ts'
import { fetchExhibitText, fetchFilingIndexHtml, findEx991DocumentUrl } from './edgar-exhibit.ts'
import { openAiJson, qaWriterModel, openAiConfigured } from '../llm/openai.ts'
import type { FreshQaConfig } from '../schema/fresh-qa.ts'
import type { ArticleRow } from '../store/db.ts'
import { fetchArticleText } from './article-text.ts'
import { rewriteQuery } from './rewrite-query.ts'

interface WriterItem {
  question: string
  goldAnswer: string
  evidenceQuote: string
}

interface WriterResponse {
  items: WriterItem[]
}

export async function writeQaItemsFromText(
  db: Database,
  input: {
    runId: string
    eventId: string
    sourceText: string
    systemPrompt: string
    maxItems: number
    sourceKind: 'filing' | 'article'
    anchorAt: string
    sourceType?: string | null
  }
): Promise<number> {
  if (!openAiConfigured()) {
    return 0
  }
  const response = await openAiJson<WriterResponse>(
    qaWriterModel(),
    [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.sourceText.slice(0, 120_000) },
    ],
    'qa-writer'
  )

  let inserted = 0
  for (const item of (response.items ?? []).slice(0, input.maxItems)) {
    if (!item.evidenceQuote || !input.sourceText.includes(item.evidenceQuote)) {
      continue
    }
    const query = await rewriteQuery(db, item.question)
    const id = insertQaItem(db, {
      runId: input.runId,
      eventId: input.eventId,
      question: item.question,
      goldAnswer: item.goldAnswer,
      evidenceQuote: item.evidenceQuote,
      sourceKind: input.sourceKind,
      anchorAt: input.anchorAt,
      query,
      sourceType: input.sourceType ?? null,
    })
    if (id !== null) {
      inserted += 1
    }
  }
  return inserted
}

export async function writeQaItemsForEvent(
  db: Database,
  runId: string,
  event: BenchEventRow,
  config: FreshQaConfig
): Promise<number> {
  const itemTypes = JSON.parse(event.item_types) as string[]
  if (!itemTypes.includes('2.02') || !event.cik || !event.accession_number) {
    return 0
  }

  const indexHtml = await fetchFilingIndexHtml(event.cik, event.accession_number)
  if (!indexHtml) {
    return 0
  }
  const exhibitUrl = findEx991DocumentUrl(indexHtml, event.cik, event.accession_number)
  if (!exhibitUrl) {
    return 0
  }
  const exhibitText = await fetchExhibitText(exhibitUrl)
  if (!exhibitText || exhibitText.length < 200) {
    return 0
  }

  return writeQaItemsFromText(db, {
    runId,
    eventId: event.id,
    sourceText: exhibitText,
    systemPrompt: `Extract up to ${config.maxQuestionsPerEvent} short factual Q&A pairs about earnings results from the press release. Each item must include an evidenceQuote copied verbatim from the document. Return JSON: {"items":[{"question","goldAnswer","evidenceQuote"}]}`,
    maxItems: config.maxQuestionsPerEvent,
    sourceKind: 'filing',
    anchorAt: event.anchor_at,
    sourceType: 'filing',
  })
}

export async function writeQaItemsForArticle(
  db: Database,
  runId: string,
  article: ArticleRow,
  config: FreshQaConfig
): Promise<number> {
  const text = await fetchArticleText(article.url, config.article.minTextChars)
  if (!text) {
    return 0
  }
  return writeQaItemsFromText(db, {
    runId,
    eventId: `article:${article.id}`,
    sourceText: text,
    systemPrompt: `Extract up to ${config.article.maxQuestionsPerArticle} factual Q&A pairs about NEW information in this news article.
Do NOT restate the headline. Questions must be answerable from any outlet covering the same story (not URL-specific).
Each item needs evidenceQuote copied verbatim from the article body.
Return JSON: {"items":[{"question","goldAnswer","evidenceQuote"}]}`,
    maxItems: config.article.maxQuestionsPerArticle,
    sourceKind: 'article',
    anchorAt: article.first_seen_at,
    sourceType: article.source_type,
  })
}
