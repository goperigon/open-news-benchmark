import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { loadPanel } from '../lib/load-config.ts'
import { panelCheckReportPath, panelExclusionsPath, panelPath } from '../lib/paths.ts'
import { PanelFileSchema } from '../schema/panel.ts'
import { applyPanelCheck, checkPanel, type SourceCheck } from './check.ts'

function describe(result: SourceCheck): string {
  const channels = [
    result.feed ? `feed(${result.feed.onDomainCount})` : null,
    result.sitemap ? `sitemap(${result.sitemap.onDomainCount})` : null,
  ].filter((c): c is string => c !== null)
  return `${result.verdict.padEnd(5)} ${result.domain.padEnd(28)} ${channels.join(' ') || '-'}`
}

export async function runPanelCheck(options: { apply: boolean }): Promise<void> {
  const panel = loadPanel()
  const checkedAt = new Date().toISOString()
  console.log(`[panel-check] checking ${panel.sources.length} sources`)

  const results = await checkPanel(panel.sources, (result) => console.log(describe(result)))

  const counts = { ok: 0, stale: 0, dead: 0 }
  for (const result of results) {
    counts[result.verdict] += 1
  }
  console.log(`[panel-check] ok=${counts.ok} stale=${counts.stale} dead=${counts.dead}`)

  const reportPath = panelCheckReportPath()
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify({ checkedAt, results }, null, 2)}\n`)
  console.log(`[panel-check] report ${reportPath}`)

  if (!options.apply) {
    return
  }

  const { sources, exclusions } = applyPanelCheck(panel.sources, results)
  const nextPanel = PanelFileSchema.parse({ ...panel, registeredAt: checkedAt, sources })
  await writeFile(panelPath(), `${JSON.stringify(nextPanel, null, 2)}\n`)
  await writeFile(
    panelExclusionsPath(),
    `${JSON.stringify({ checkedAt, exclusions }, null, 2)}\n`
  )
  console.log(
    `[panel-check] applied: ${sources.length} sources kept, ${exclusions.length} excluded (${panelExclusionsPath()})`
  )
}
