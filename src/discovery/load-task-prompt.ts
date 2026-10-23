import { readFileSync } from 'node:fs'

import { cyberBreachPromptPath } from '../lib/paths.ts'

export function loadCyberTaskMarkdown(): string {
  return readFileSync(cyberBreachPromptPath(), 'utf8')
}

export function renderPromptTemplate(template: string, sinceIso: string, taskMarkdown: string): string {
  return template.replace('{{sinceIso}}', sinceIso).replace('{{taskMarkdown}}', taskMarkdown)
}
