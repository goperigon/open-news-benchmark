# Open News Benchmark — Methodology (repo-wide)

Open News Benchmark measures how quickly **news data providers** surface stories from a pre-registered panel of publishers, and what share of those stories they surface within a fixed window.

## Scope

This project compares **news data APIs** (article search). It does **not** benchmark AI search or answer products that may consume these APIs as a data layer. Adapters for web-search / RAG answer engines are intentionally out of scope; pull requests that add them will be rejected.

## Principles

1. **Pre-registration.** Source panels, suite configs, and metric definitions are committed before a run series begins.
2. **Bring your own keys (BYOK).** Provider adapters activate when environment variables are set. Missing keys are reported as `skipped_missing_key`, never silently omitted from disclosure.
3. **Transparent requests.** Adapters use plain `fetch`; query shapes are visible in source.
4. **Publication vs indexing.** Time zero is **ground-truth discovery** (first time our poller sees the URL in RSS or news sitemap), not the publisher’s `published_at`.
5. **Separate metrics.** API response time is reported separately from time to index.

## Suites

| Suite ID | Status | Doc |
| -------- | ------ | --- |
| `latency` | Active (headline) | [suites/latency/METHODOLOGY.md](suites/latency/METHODOLOGY.md) |

Publish output includes the suites listed in [config/publishable.json](config/publishable.json).

## Legal / publishing

Review competitor terms of service before publishing comparisons. The publish step respects [config/publishable.json](config/publishable.json).

## Citation

If you use this harness in research or marketing, link to the repository and cite the run ID, panel hash, and config hash from `results/latest.json`.
