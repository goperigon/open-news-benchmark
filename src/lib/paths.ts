import { join } from 'node:path'

export const REPO_ROOT = join(import.meta.dir, '..', '..')

export function panelPath(): string {
  return join(REPO_ROOT, 'suites', 'latency', 'panel.json')
}

export function panelExclusionsPath(): string {
  return join(REPO_ROOT, 'suites', 'latency', 'panel-exclusions.json')
}

export function panelCheckReportPath(): string {
  return join(REPO_ROOT, 'data', 'panel-check.json')
}

export function latencyConfigPath(): string {
  return join(REPO_ROOT, 'suites', 'latency', 'config.json')
}

export function universePath(): string {
  return join(REPO_ROOT, 'suites', 'event-coverage', 'universe.json')
}

export function eventCoverageConfigPath(): string {
  return join(REPO_ROOT, 'suites', 'event-coverage', 'config.json')
}

export function freshQaConfigPath(): string {
  return join(REPO_ROOT, 'suites', 'fresh-qa', 'config.json')
}

export function freshQaStaticConfigPath(): string {
  return join(REPO_ROOT, 'suites', 'freshqa-static', 'config.json')
}

export function freshQaStaticDataPath(): string {
  return join(REPO_ROOT, 'suites', 'freshqa-static', 'data')
}

export function freshQaStaticDatasetPath(fileName: string): string {
  return join(freshQaStaticDataPath(), fileName)
}

export function scheduledEventsPath(): string {
  return join(REPO_ROOT, 'suites', 'event-coverage', 'scheduled-events.json')
}

export function publishableConfigPath(): string {
  return join(REPO_ROOT, 'config', 'publishable.json')
}

export function cyberBreachConfigPath(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'config.json')
}

export function cyberBreachPanelPath(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'panel.json')
}

export function cyberBreachPromptPath(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'prompt.md')
}

export function cyberBreachIncidentSchemaPath(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'incident-schema.json')
}

export function cyberBreachPerigonMonitorPath(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'perigon-monitor.json')
}

export function cyberBreachPromptsDir(): string {
  return join(REPO_ROOT, 'suites', 'cyber-breach', 'prompts')
}

export function defaultDbPath(): string {
  return join(REPO_ROOT, 'data', 'benchmark.db')
}

export function resultsDir(): string {
  return join(REPO_ROOT, 'results')
}
