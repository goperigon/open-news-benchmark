import type { ArticleRow } from '../store/db.ts'
import type { FreshQaConfig } from '../schema/fresh-qa.ts'

export class ArticleQaSampler {
  private hourKey = ''
  private sampledThisHour = 0
  private nextTypeIndex = 0
  private readonly seenArticleIds = new Set<number>()

  pick(candidates: ArticleRow[], config: FreshQaConfig): ArticleRow | null {
    if (!config.article.enabled) {
      return null
    }
    const hourKey = new Date().toISOString().slice(0, 13)
    if (hourKey !== this.hourKey) {
      this.hourKey = hourKey
      this.sampledThisHour = 0
    }
    if (this.sampledThisHour >= config.article.samplesPerHour) {
      return null
    }

    const langSet = new Set(config.article.languages.map((l) => l.toLowerCase()))
    const fresh = candidates.filter(
      (a) =>
        !this.seenArticleIds.has(a.id) &&
        langSet.has(a.language.toLowerCase()) &&
        !this.seenArticleIds.has(a.id)
    )
    if (fresh.length === 0) {
      return null
    }

    const byType = new Map<string, ArticleRow[]>()
    for (const row of fresh) {
      const list = byType.get(row.source_type) ?? []
      list.push(row)
      byType.set(row.source_type, list)
    }
    const types = [...byType.keys()].sort()
    if (types.length === 0) {
      return null
    }

    for (let attempt = 0; attempt < types.length; attempt += 1) {
      const type = types[(this.nextTypeIndex + attempt) % types.length]
      if (!type) {
        continue
      }
      const bucket = byType.get(type)
      const article = bucket?.shift()
      if (!article) {
        continue
      }
      this.nextTypeIndex = (this.nextTypeIndex + attempt + 1) % types.length
      this.sampledThisHour += 1
      this.seenArticleIds.add(article.id)
      return article
    }
    return null
  }
}
