#!/usr/bin/env bash
# Smoke test: verify provider queries work before committing to a full run.
#
# Shape: collect up to 200 articles (45 min ceiling), then drain 60 min so the
# last article gets a full latency window. Typical wall time ~90 min.
# This validates LATENCY (found within 60m) only — coverage (2h window) is
# not meaningful on a 60m drain.
#
# Usage:
#   caffeinate -i ./scripts/run-smoke.sh
#   TARGET_ARTICLES=150 COLLECTION_MS=1800000 ./scripts/run-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_ID="smoke-${STAMP}"
DB="${BENCH_DB:-data/smoke-${STAMP}.db}"
TARGET_ARTICLES="${TARGET_ARTICLES:-200}"
COLLECTION_MS="${COLLECTION_MS:-2700000}"
DRAIN_MS="${DRAIN_MS:-3600000}"
OUT="results/smoke-${RUN_ID}.json"

echo "[smoke] run-id=${RUN_ID} db=${DB} target=${TARGET_ARTICLES} collectionCeilingMs=${COLLECTION_MS} drainMs=${DRAIN_MS}"

# caffeinate is macOS-only; on Linux (CI/VM) it is skipped.
CAFFEINATE=""
if command -v caffeinate >/dev/null 2>&1; then
  CAFFEINATE="caffeinate -i"
fi

$CAFFEINATE bun run bench run \
  --duration "${COLLECTION_MS}" \
  --run-id "${RUN_ID}" \
  --db "${DB}" \
  --target-articles "${TARGET_ARTICLES}" \
  --drain-ms "${DRAIN_MS}"

bun run bench report --run-id "${RUN_ID}" --db "${DB}" > "${OUT}"
echo "[smoke] report written to ${OUT} (not published)"

RUN_ID="${RUN_ID}" DB="${DB}" python3 - << 'PY'
import json, os, sqlite3, statistics
from datetime import datetime

report = json.load(open(f"results/smoke-{os.environ['RUN_ID']}.json"))
suite = next(s for s in report['suites'] if s['id'] == 'latency')
print("\n[smoke] latency results (found within, per-article 60m window):")
for p in suite['providers']:
    if p['status'] != 'ran':
        continue
    m = p['metrics']
    fw = m['foundWithinMinutes']
    print(f"  {p['id']}: n={m['articleCount']} m5={fw['m5']:.1%} m15={fw['m15']:.1%} m60={fw['m60']:.1%}")

def parse(ts):
    return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp() if ts else None

db = sqlite3.connect(f"file:{os.environ['DB']}?mode=ro", uri=True)
run = os.environ['RUN_ID']
for prov in ['perigon', 'google_news_rss']:
    rows = db.execute(
        """SELECT a.first_seen_at, o.found_at, o.provider_timestamp
           FROM observations o JOIN articles a ON a.id = o.article_id
           WHERE o.run_id=? AND o.provider_id=? AND o.found_at IS NOT NULL""",
        (run, prov),
    ).fetchall()
    if not rows:
        print(f"  {prov}: no finds recorded")
        continue
    found_lag = [(parse(f) - parse(s)) / 60 for s, f, _ in rows]
    prov_lag = [
        (parse(pt) - parse(s)) / 60 for s, _, pt in rows if pt and parse(pt) and parse(pt) >= parse(s)
    ]
    msg = f"  {prov}: found={len(rows)} median found lag={statistics.median(found_lag):.1f}m"
    if prov_lag:
        msg += f", median provider-timestamp lag (e.g. Perigon addDate)={statistics.median(prov_lag):.1f}m"
    print(msg)

print("\n[smoke] reading the result:")
print("  - Perigon m60 near the pilot (~50%) => pilot-shaped query is healthy; proceed to full run.")
print("  - Perigon m60 still <10% but addDate lag is small => our probing still misses articles Perigon has.")
print("  - Perigon m60 still <10% and addDate lag is ~hours => Perigon indexing itself is slow right now.")
PY

echo "[smoke] done ${RUN_ID}"
