import type { ProviderArticle } from '../providers/types.ts'
import { openAiJson, synthModel, graderModel } from '../llm/openai.ts'

function contextBlock(articles: ProviderArticle[], topK: number): string {
  return articles
    .slice(0, topK)
    .map((a, i) => {
      const body = a.content ?? a.snippet ?? ''
      return `[${i + 1}] ${a.title}\n${body.slice(0, 2000)}`
    })
    .join('\n\n')
}

export async function synthesizeAnswer(question: string, articles: ProviderArticle[], topK: number): Promise<string> {
  const context = contextBlock(articles, topK)
  const response = await openAiJson<{ answer: string }>(
    synthModel(),
    [
      {
        role: 'system',
        content:
          'Answer the question using ONLY the provided context. If the context is insufficient, respond with {"answer":"unknown"}. Return JSON {"answer": string}.',
      },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
    ],
    'synth'
  )
  return response.answer ?? 'unknown'
}

export type QaGrade = 'correct' | 'incorrect' | 'not_attempted' | 'error'

function normalizeGoldList(gold: string | string[]): string[] {
  const list = Array.isArray(gold) ? gold : [gold]
  return list.map((g) => g.trim()).filter((g) => g.length > 0)
}

export async function gradeAnswer(question: string, gold: string | string[], answer: string): Promise<QaGrade> {
  if (!answer || answer.toLowerCase() === 'unknown') {
    return 'not_attempted'
  }
  const golds = normalizeGoldList(gold)
  const goldBlock = golds.map((g, i) => `[${i + 1}] ${g}`).join('\n')
  const response = await openAiJson<{ grade: QaGrade }>(
    graderModel(),
    [
      {
        role: 'system',
        content:
          'Grade whether the candidate answer matches any acceptable gold answer for the question (SimpleQA-style). Return JSON {"grade":"correct"|"incorrect"|"not_attempted"}.',
      },
      {
        role: 'user',
        content: `Question: ${question}\nAcceptable answers:\n${goldBlock}\nCandidate: ${answer}`,
      },
    ],
    'grade'
  )
  const grade = response.grade ?? 'incorrect'
  if (grade === 'error') {
    return 'incorrect'
  }
  return grade
}

/** FreshEval relaxed grading (FreshQA / FreshLLMs, Apache-2.0). Hallucinations allowed if primary fact is right. */
export async function gradeFreshEvalRelaxed(
  question: string,
  gold: string | string[],
  answer: string
): Promise<'correct' | 'incorrect' | 'not_attempted'> {
  if (!answer || answer.toLowerCase() === 'unknown') {
    return 'not_attempted'
  }
  const golds = normalizeGoldList(gold)
  const goldBlock = golds.map((g, i) => `[${i + 1}] ${g}`).join('\n')
  const response = await openAiJson<{ correct: boolean }>(
    graderModel(),
    [
      {
        role: 'system',
        content: `You grade answers using FreshEval relaxed criteria from the FreshQA benchmark.
Mark correct if the candidate's primary answer matches any acceptable reference answer, even if the response includes minor hallucinations, outdated side details, or poor formatting.
Mark incorrect if the primary answer is wrong or contradicts all references.
Mark not_attempted only if the candidate refuses or says unknown.
Return JSON {"correct": true|false}.`,
      },
      {
        role: 'user',
        content: `Question: ${question}\nReference answers:\n${goldBlock}\nCandidate: ${answer}`,
      },
    ],
    'freshqa-grade'
  )
  if (response.correct) {
    return 'correct'
  }
  return 'incorrect'
}
