import { readFileSync } from 'node:fs'

import { LatencyConfigSchema, PanelFileSchema } from '../schema/panel.ts'
import { EventCoverageConfigSchema } from '../schema/event-coverage.ts'
import { FreshQaConfigSchema } from '../schema/fresh-qa.ts'
import { FreshQaStaticConfigSchema } from '../schema/freshqa-static.ts'
import { UniverseFileSchema } from '../schema/universe.ts'
import {
  eventCoverageConfigPath,
  freshQaConfigPath,
  freshQaStaticConfigPath,
  latencyConfigPath,
  panelPath,
  universePath,
} from './paths.ts'

export function loadPanel() {
  const raw = JSON.parse(readFileSync(panelPath(), 'utf8')) as unknown
  return PanelFileSchema.parse(raw)
}

export function loadLatencyConfig() {
  const raw = JSON.parse(readFileSync(latencyConfigPath(), 'utf8')) as unknown
  return LatencyConfigSchema.parse(raw)
}

export function loadUniverse() {
  const raw = JSON.parse(readFileSync(universePath(), 'utf8')) as unknown
  return UniverseFileSchema.parse(raw)
}

export function loadEventCoverageConfig() {
  const raw = JSON.parse(readFileSync(eventCoverageConfigPath(), 'utf8')) as unknown
  return EventCoverageConfigSchema.parse(raw)
}

export function loadFreshQaConfig() {
  const raw = JSON.parse(readFileSync(freshQaConfigPath(), 'utf8')) as unknown
  return FreshQaConfigSchema.parse(raw)
}

export function loadFreshQaStaticConfig() {
  const raw = JSON.parse(readFileSync(freshQaStaticConfigPath(), 'utf8')) as unknown
  return FreshQaStaticConfigSchema.parse(raw)
}
