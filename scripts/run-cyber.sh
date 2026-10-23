#!/usr/bin/env bash
# Full cyber-breach run: collect until target incidents + 4h tracking window.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_ID="cyber-${STAMP}"
DB="${BENCH_DB:-data/benchmark.db}"
COLLECTION_MS="${COLLECTION_MS:-172800000}"
echo "[run-cyber] run-id=${RUN_ID} db=${DB} collectionCeilingMs=${COLLECTION_MS}"
bun run bench cyber run --duration "${COLLECTION_MS}" --run-id "${RUN_ID}" --db "${DB}"
bun run bench cyber report --run-id "${RUN_ID}" --db "${DB}" --publish
echo "[run-cyber] done ${RUN_ID}"
