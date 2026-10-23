import { describe, expect, test } from 'bun:test'

import { providerIntervalMs } from '../src/prober/run-loop.ts'
import { createPerigonAdapter } from '../src/providers/perigon.ts'
import { loadLatencyConfig } from '../src/lib/load-config.ts'
import type { ProviderAdapter } from '../src/providers/types.ts'

function slowFakeAdapter(minPollIntervalMs: number): ProviderAdapter {
  const base = createPerigonAdapter()
  return {
    ...base,
    id: 'slow_fake',
    capabilities: { ...base.capabilities, minPollIntervalMs },
  }
}

describe('providerIntervalMs', () => {
  const config = loadLatencyConfig()

  test('slow providers keep their own cadence instead of the shared one', () => {
    expect(providerIntervalMs(config, slowFakeAdapter(300_000))).toBe(300_000)
  })

  test('fast providers use the configured probe interval', () => {
    expect(providerIntervalMs(config, createPerigonAdapter())).toBe(config.providerProbeIntervalMs)
  })
})
