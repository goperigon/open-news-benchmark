import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { allProviderAdapters } from '../src/providers/registry.ts'
import { publishableConfigPath } from '../src/lib/paths.ts'
import { isOutOfScopeProviderId } from '../src/lib/scope.ts'

describe('benchmark scope', () => {
  test('registry has no AI search / answer provider ids', () => {
    for (const adapter of allProviderAdapters()) {
      expect(isOutOfScopeProviderId(adapter.id)).toBe(false)
    }
  })

  test('publishable allowlist has no out-of-scope provider ids', () => {
    const raw = JSON.parse(readFileSync(publishableConfigPath(), 'utf8')) as {
      allowedProviderIds?: string[]
    }
    for (const id of raw.allowedProviderIds ?? []) {
      expect(isOutOfScopeProviderId(id)).toBe(false)
    }
  })
})
