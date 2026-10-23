import type { ProviderAdapter } from '../providers/types.ts'
import { synthesizeAnswer, gradeAnswer, gradeFreshEvalRelaxed, type QaGrade } from './synthesize.ts'

export type ProbeGrader = 'simpleqa' | 'freshqa_relaxed'

export interface ProbeQuestionInput {
  question: string
  goldAnswers: string[]
  searchQuery: string
  sinceIso?: string
  topK: number
  grader: ProbeGrader
}

export interface ProbeQuestionResult {
  answer: string
  grade: QaGrade | 'correct' | 'incorrect' | 'not_attempted'
  responseMs: number
  error: string | null
}

export async function probeQuestion(
  provider: ProviderAdapter,
  input: ProbeQuestionInput
): Promise<ProbeQuestionResult> {
  try {
    const search = await provider.searchText({
      query: input.searchQuery,
      sinceIso: input.sinceIso,
    })
    const answer = await synthesizeAnswer(input.question, search.articles, input.topK)
    let grade: ProbeQuestionResult['grade']
    if (input.grader === 'freshqa_relaxed') {
      grade = await gradeFreshEvalRelaxed(input.question, input.goldAnswers, answer)
    } else {
      grade = await gradeAnswer(input.question, input.goldAnswers, answer)
    }
    return { answer, grade, responseMs: search.responseMs, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { answer: '', grade: 'error', responseMs: 0, error: message }
  }
}
