# Deploy — continuous benchmark runs

## Recommended topology

- **One small always-on VM** (DigitalOcean droplet or similar) running the harness via Docker.
- **Object storage** for public `latest.json` (DigitalOcean Spaces or any S3-compatible bucket).

## GitHub Actions (no server)

For ad-hoc runs with live logs and downloadable artifacts, use the
**Benchmark** workflow (`.github/workflows/benchmark.yml`):

1. Add the `PERIGON_API_KEY` Actions secret (Settings → Secrets and variables → Actions).
   Optional Actions variables: `BENCH_REGION` (default `us-east`), `PERIGON_PLAN_TIER` (default `real-time`).
2. Actions → **Benchmark** → **Run workflow** → choose `smoke` (~90 min) or `full` (~5h; collection ceiling defaults to 3.5h so collection + 2h drain fits the 6h job limit).
3. Watch live logs in the job view. The run summary shows the metrics table
   (`scripts/summarize-report.py`); the SQLite DB and report JSON are attached
   as the `benchmark-<mode>-<run_id>` artifact (30-day retention).

Hosted runners cap jobs at 6 hours, so Actions suits the smoke test and
typical full runs. For a flagship published series, prefer the always-on VM
below (consistent region and clock).

## Docker

```bash
docker build -t open-news-benchmark -f deploy/Dockerfile .

docker run --env-file .env -v $(pwd)/data:/app/data -v $(pwd)/results:/app/results \
  open-news-benchmark run
```

## Runbook

1. **Latency pilot:** `bun run bench run --duration 604800000` — prune sparse feeds per latency methodology.
2. **Report each run:** `bun run bench report --run-id <id> --publish` → `results/latest.json`
3. **Upload:** `./scripts/upload-results.sh` or copy to your public bucket.

## Environment

- `PERIGON_API_KEY` on real-time tier (recommended)
- `BENCH_REGION` — deployment region recorded in results
- Optional competitor keys (BYOK) and `*_DAILY_BUDGET` caps
