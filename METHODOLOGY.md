# Open News Benchmark — Methodology (repo-wide)

Open News Benchmark measures how quickly **news data providers** surface stories from a pre-registered panel of publishers, and what share of those stories they surface within a fixed window.

## Scope

The **latency** suite compares **news data APIs** (article search). News API adapters for web-search / RAG answer engines remain out of scope for that suite.

The **cyber-breach** suite is a separate, pre-registered protocol that compares **live incident detection** by a user-configured **Perigon Monitor** against **general-purpose LLMs with web search** (plus Google News RSS and Perigon search as baselines). See [suites/cyber-breach/METHODOLOGY.md](suites/cyber-breach/METHODOLOGY.md).

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
| `cyber-breach` | Active (optional) | [suites/cyber-breach/METHODOLOGY.md](suites/cyber-breach/METHODOLOGY.md) |

Publish output includes the suites listed in [config/publishable.json](config/publishable.json).

## Legal / publishing

Review competitor terms of service before publishing comparisons. The publish step respects [config/publishable.json](config/publishable.json).

## Citation

If you use this harness in research or marketing, link to the repository and cite the run ID, panel hash, and config hash from `results/latest.json`.
