import type { NormalizedCyberIncident } from '../schema/cyber-breach.ts'

export type DiscoveryPollStatus = 'ok' | 'skipped_missing_key' | 'skipped_error'

export interface DiscoveryPollResult {
  status: DiscoveryPollStatus
  incidents: NormalizedCyberIncident[]
  responseMs: number
  raw: unknown
  error?: string
}

export interface DiscoveryAdapter {
  id: string
  displayName: string
  requiredEnv: readonly string[]
  isConfigured(): boolean
  poll(sinceIso: string): Promise<DiscoveryPollResult>
}
