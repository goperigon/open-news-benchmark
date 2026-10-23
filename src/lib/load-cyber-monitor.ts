import { readFileSync } from 'node:fs'

import { cyberBreachPerigonMonitorPath } from './paths.ts'

export interface CyberMonitorQuery {
  q: string
  language?: string[]
  excludeLabel?: string[]
  searchTranslation?: boolean
}

export interface CyberMonitorFile {
  uuid?: string
  query?: CyberMonitorQuery
}

export function loadCyberMonitorFile(): CyberMonitorFile {
  return JSON.parse(readFileSync(cyberBreachPerigonMonitorPath(), 'utf8')) as CyberMonitorFile
}

export function loadCyberMonitorQuery(): CyberMonitorQuery {
  const file = loadCyberMonitorFile()
  return {
    q: file.query?.q ?? 'breach OR ransomware OR "data breach"',
    language: file.query?.language,
    excludeLabel: file.query?.excludeLabel,
    searchTranslation: file.query?.searchTranslation,
  }
}
