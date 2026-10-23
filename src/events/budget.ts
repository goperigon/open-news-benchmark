import type { ProviderAdapter } from '../providers/types.ts'
import { readDailyBudget } from '../providers/types.ts'

export class ProviderBudgetTracker {
  private readonly counts = new Map<string, number>()
  private readonly exhausted = new Set<string>()

  budgetFor(adapter: ProviderAdapter): number | null {
    return readDailyBudget(adapter.id)
  }

  canSpend(adapter: ProviderAdapter): boolean {
    if (this.exhausted.has(adapter.id)) {
      return false
    }
    const budget = this.budgetFor(adapter)
    if (budget === null) {
      return true
    }
    return (this.counts.get(adapter.id) ?? 0) < budget
  }

  spend(adapter: ProviderAdapter): void {
    const budget = this.budgetFor(adapter)
    const next = (this.counts.get(adapter.id) ?? 0) + 1
    this.counts.set(adapter.id, next)
    if (budget !== null && next >= budget) {
      this.exhausted.add(adapter.id)
    }
  }

  isExhausted(providerId: string): boolean {
    return this.exhausted.has(providerId)
  }
}
