# Smoke review log

## cyber-plumbing-test (2026-10-23)

Short run (`--duration 90000`, `--tracking-ms 60000`, `--target-incidents 1`) to validate harness wiring.

| Check | Result |
| --- | --- |
| Ground-truth loop | Ran; 0 panel incidents in window (expected for 90s) |
| `perigon_search` | `ran`, 5 claims |
| `google_news_rss` | `ran`, 25 claims |
| `perigon_monitor` | `skipped_error` (monitor still **DRAFT** — activate before official series) |
| `openai_websearch` | `skipped_error` (API/key or model) |
| Run completion + DB | OK |

**Before publishing:** import adjudication sample, confirm monitor ACTIVE, legal review on LLM raw outputs.

## cyber-smoke-20261023-121827 (in progress)

Started via `./scripts/run-cyber-smoke.sh` on 2026-10-23 (~1h collection + 1h tracking, target 5 incidents). When complete:

```bash
bun run bench cyber report --run-id cyber-smoke-20261023-121827 --db data/cyber-smoke-20261023-121827.db --publish
```

## Full series (pending)

Target ~100 verified panel incidents + 4h window per `config.json`. Run on always-on VM alongside latency suite; not suitable for 6h GitHub Actions cap.
