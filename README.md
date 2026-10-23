# Open News Benchmark

Reproducible, open measurements of how quickly **news data APIs** index stories from a pre-registered panel of publishers (**latency**) and what share of those stories they surface at all (**coverage**).

This benchmark compares news data providers only—not AI search or answer products built on top of them.

## Quickstart (< 10 minutes)

```bash
git clone https://github.com/goperigon/open-news-benchmark.git
cd open-news-benchmark
cp .env.example .env
# Optional: PERIGON_API_KEY and competitor BYOK keys (Google News RSS needs no key)

bun install
bun run bench doctor --skip-probe

# 2h smoke run
bun run bench run --duration quick
bun run bench report --run-id <uuid-from-log> --publish
```

For a full run (1,000 articles plus a 2-hour coverage window, typically ~5h wall time):

```bash
./scripts/run-latency.sh
```

For a ~90-minute query sanity check before a full run, use `./scripts/run-smoke.sh`.

Results land in `results/latest.json` (schema in `src/schema/results.ts`).

## Commands

| Command | Purpose |
| ------- | ------- |
| `bench doctor` | List adapters, keys, optional live probe |
| `bench doctor --skip-probe` | Key check only (CI-friendly) |
| `bench panel-check [--apply]` | Verify panel feeds and sitemaps |
| `bench run` | Latency run (default 7-day collection ceiling) |
| `bench run --duration quick` | 2-hour latency smoke |
| `bench report --run-id <id> --publish` | Build summary JSON |
| `bench export --run-id <id>` | Raw CSV export |
| `bench audit-misses --run-id <id> --provider <id>` | Sample never-found articles for manual review |
| `bench db merge-run --from-db <path> --run-id <id>` | Copy a run between databases |

## Methodology

Read [METHODOLOGY.md](METHODOLOGY.md) and the latency suite doc: [suites/latency/METHODOLOGY.md](suites/latency/METHODOLOGY.md).

## Hosting a continuous run

See [deploy/README.md](deploy/README.md).

## Submit your run

Third parties can reproduce and share results. See [docs/SUBMIT_YOUR_RUN.md](docs/SUBMIT_YOUR_RUN.md).

## License

MIT — see [LICENSE](LICENSE).
