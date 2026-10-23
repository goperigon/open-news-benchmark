#!/usr/bin/env bash
# Latency + coverage benchmark: collect until 1,000 articles (or COLLECTION_MS
# ceiling), then probe providers for the 2h coverage window, publish results.
# Typical wall time ~5h (collection ~3h + 2h drain). Run in tmux/background.
#
# Usage (from repo root):
#   caffeinate -i ./scripts/run-latency.sh
#   BENCH_DB=data/my.db COLLECTION_MS=21600000 ./scripts/run-latency.sh
#
# Requires .env with PERIGON_API_KEY (and BENCH_REGION). Google News RSS needs no key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_ID="latency-${STAMP}"
DB="${BENCH_DB:-data/benchmark.db}"
COLLECTION_MS="${COLLECTION_MS:-28800000}"

echo "[run-latency] run-id=${RUN_ID} db=${DB} collectionCeilingMs=${COLLECTION_MS} (stops at 1000 articles + 2h coverage drain)"

# caffeinate is macOS-only; on Linux (CI/VM) it is skipped.
CAFFEINATE=""
if command -v caffeinate >/dev/null 2>&1; then
  CAFFEINATE="caffeinate -i"
fi

$CAFFEINATE bun run bench run --duration "${COLLECTION_MS}" --run-id "${RUN_ID}" --db "${DB}"

bun run bench report --run-id "${RUN_ID}" --db "${DB}" --publish

echo "[run-latency] done ${RUN_ID}"
