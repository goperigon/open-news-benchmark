#!/usr/bin/env bash
# Cyber-breach smoke (~2h): 1h collection + 1h tracking window, 5 incident target.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_ID="cyber-smoke-${STAMP}"
DB="${BENCH_DB:-data/cyber-smoke-${STAMP}.db}"
echo "[run-cyber-smoke] run-id=${RUN_ID} db=${DB}"
bun run bench cyber run --duration quick --run-id "${RUN_ID}" --db "${DB}"
bun run bench cyber report --run-id "${RUN_ID}" --db "${DB}" --publish
echo "[run-cyber-smoke] done ${RUN_ID}"
