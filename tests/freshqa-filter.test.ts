import { describe, expect, test } from 'bun:test'

import { filterFreshQaStaticQuestions } from '../src/qa/freshqa-dataset.ts'
import type { FreshQaStaticQuestion } from '../src/schema/freshqa-static.ts'

const sample: FreshQaStaticQuestion[] = [
  {
    id: 'a',
    question: 'Q1',
    goldAnswers: ['A'],
    factType: 'fast-changing',
    numHops: 'one-hop',
    falsePremise: 'FALSE',
    split: 'TEST',
  },
  {
    id: 'b',
    question: 'Q2',
    goldAnswers: ['B'],
    factType: 'slow-changing',
    numHops: 'one-hop',
    falsePremise: 'FALSE',
    split: 'TEST',
  },
  {
    id: 'c',
    question: 'Q3',
    goldAnswers: ['C'],
    factType: 'fast-changing',
    numHops: 'one-hop',
    falsePremise: 'TRUE',
    split: 'TEST',
  },
]

describe('filterFreshQaStaticQuestions', () => {
  test('filters fact type and false premise', () => {
    const out = filterFreshQaStaticQuestions(sample, {
      factTypes: ['fast-changing'],
      includeFalsePremise: false,
    })
    expect(out.map((q) => q.id)).toEqual(['a'])
  })
})
