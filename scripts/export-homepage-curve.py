#!/usr/bin/env python3
"""Export a run's per-minute time-to-index curve as a TypeScript constant.

Usage:
  python3 scripts/export-homepage-curve.py --run-id <id> [--db data/benchmark.db]

Prints `HOME_BENCHMARK_CURVE` to stdout: for minutes 0..60, the cumulative share of
the run's ground-truth articles each provider had returned, with finds after the
60-minute latency window counted as not found (same clamp as the published report).
"""
from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timezone

LATENCY_WINDOW_MINUTES = 60
PROVIDERS = {'perigon': 'perigon', 'googleNews': 'google_news_rss'}


def parse_ts(ts: str) -> float:
    return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--db', default='data/benchmark.db')
    args = parser.parse_args()

    db_path = os.path.abspath(args.db)
    db = sqlite3.connect(f'file:{db_path}?immutable=1', uri=True)

    articles = {
        article_id: parse_ts(first_seen)
        for article_id, first_seen in db.execute(
            'SELECT id, first_seen_at FROM articles WHERE run_id = ?', (args.run_id,)
        )
    }
    if not articles:
        raise SystemExit(f'no articles for run {args.run_id}')

    window = db.execute(
        'SELECT MIN(first_seen_at) FROM articles WHERE run_id = ?', (args.run_id,)
    ).fetchone()[0]
    run_date = datetime.fromtimestamp(parse_ts(window), tz=timezone.utc).strftime('%Y-%m-%d')

    series: dict[str, list[float]] = {}
    for key, provider_id in PROVIDERS.items():
        lag_minutes = []
        for article_id, found_at in db.execute(
            'SELECT article_id, found_at FROM observations '
            'WHERE run_id = ? AND provider_id = ? AND found_at IS NOT NULL',
            (args.run_id, provider_id),
        ):
            first_seen = articles.get(article_id)
            if first_seen is None:
                continue
            lag = (parse_ts(found_at) - first_seen) / 60
            if lag <= LATENCY_WINDOW_MINUTES:
                lag_minutes.append(max(lag, 0))
        series[key] = [
            round(sum(1 for lag in lag_minutes if lag <= minute) / len(articles), 4)
            for minute in range(LATENCY_WINDOW_MINUTES + 1)
        ]

    print('export const HOME_BENCHMARK_CURVE = {')
    print(f"  runId: '{args.run_id}',")
    print(f"  runDate: '{run_date}',")
    print(f'  articleCount: {len(articles)},')
    for key, values in series.items():
        print(f'  {key}: [{", ".join(str(v) for v in values)}],')
    print('} as const')


if __name__ == '__main__':
    main()
