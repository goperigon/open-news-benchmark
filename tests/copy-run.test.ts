import { describe, expect, test } from 'bun:test'

import { openDatabase, insertRun } from '../src/store/db.ts'
import { copyRunBetweenDatabases } from '../src/store/copy-run.ts'

describe('copyRunBetweenDatabases', () => {
  test('copies a latency run row into an empty target db', () => {
    const fromPath = `/tmp/bench-copy-from-${Date.now()}.db`
    const toPath = `/tmp/bench-copy-to-${Date.now()}.db`
    const from = openDatabase(fromPath)
    insertRun(from, {
      id: 'lat-copy',
      suite_id: 'latency',
      started_at: new Date().toISOString(),
      panel_hash: 'p',
      config_hash: 'c',
      harness_git_sha: 'sha',
      region: 'test',
    })
    from.close()

    copyRunBetweenDatabases(fromPath, toPath, 'lat-copy')
    const to = openDatabase(toPath)
    const row = to.prepare(`SELECT id, suite_id FROM runs WHERE id = ?`).get('lat-copy') as {
      id: string
      suite_id: string
    }
    expect(row.suite_id).toBe('latency')
    to.close()
  })
})
