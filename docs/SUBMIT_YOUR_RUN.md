# Submit your run

Open News Benchmark is designed for independent reproduction.

**Scope:** Submit adapters and runs for **news data providers** only (article APIs). AI search / answer products are out of scope for this repository.

1. Fork or clone this repository.
2. Configure `.env` with your provider keys (see `.env.example`).
3. Run a smoke test: `bun run bench run --duration quick`
4. Generate a report: `bun run bench report --run-id <id> --publish`
5. Share:
   - `results/<run-id>.json`
   - CSV export from `bun run bench export --run-id <id>`
   - Your declared plan tiers and region (`BENCH_REGION`, `*_PLAN` variables)

We welcome pull requests that add adapter fixes (not marketing tweaks). For independent index listings, contact Openbenchmarks and reference this methodology.
