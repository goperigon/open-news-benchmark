#!/usr/bin/env python3
"""Render a benchmark report JSON as a Markdown summary.

Usage:
  python3 scripts/summarize-report.py [path-to-report.json]

With no argument, picks the most recently modified of results/latest.json and
results/smoke-*.json. Output is Markdown (suitable for $GITHUB_STEP_SUMMARY).
Always exits 0 — a missing/unreadable report prints a short note instead.
"""
from __future__ import annotations

import glob
import json
import os
import sys


def pick_report() -> str | None:
    if len(sys.argv) > 1:
        return sys.argv[1]
    candidates = glob.glob('results/smoke-*.json') + glob.glob('results/latest.json')
    if not candidates:
        return None
    return max(candidates, key=os.path.getmtime)


def pct(x: float) -> str:
    return f'{x * 100:.1f}%'


def mins(ms) -> str:
    if ms is None:
        return '—'
    return f'{ms / 60000:.1f} min'


def main() -> None:
    path = pick_report()
    if not path or not os.path.exists(path):
        print('## Benchmark summary\n\nNo report file found (run may have been cancelled before reporting).')
        return
    try:
        report = json.load(open(path))
    except Exception as exc:  # noqa: BLE001 - summary must never fail the job
        print(f'## Benchmark summary\n\nCould not parse `{path}`: {exc}')
        return

    suite = next((s for s in report.get('suites', []) if s.get('id') == 'latency'), None)
    if suite is None:
        print(f'## Benchmark summary\n\nNo latency suite in `{path}`.')
        return

    providers = [p for p in suite.get('providers', []) if p.get('status') == 'ran' and p.get('metrics')]
    skipped = [p for p in suite.get('providers', []) if p.get('status') != 'ran']

    print(f"## Benchmark — `{suite.get('runId')}`")
    print()
    print(f"- Window: {suite.get('windowStart')} → {suite.get('windowEnd')}")
    print(f"- Report file: `{path}`")
    lat_win = (suite.get('equalIndexWindowMs') or 0) // 60000
    cov_win = (suite.get('coverageWindowMs') or 0) // 60000
    print(f'- Windows: latency {lat_win} min, coverage {cov_win} min')
    print()

    print(f'### Speed — found within {lat_win} min')
    print('| Provider | n | ≤5m | ≤15m | ≤60m | Median | p90 | API median |')
    print('|---|---:|---:|---:|---:|---:|---:|---:|')
    for p in providers:
        m = p['metrics']
        fw = m['foundWithinMinutes']
        print(
            f"| {p['displayName']} | {m['articleCount']} | {pct(fw['m5'])} | {pct(fw['m15'])} | "
            f"{pct(fw['m60'])} | {mins(m['medianTimeToIndexMs'])} | {mins(m['p90TimeToIndexMs'])} | "
            f"{m['medianApiResponseMs'] if m['medianApiResponseMs'] is not None else '—'} ms |"
        )
    print()

    print(f'### Coverage — found within {cov_win} min')
    print('| Provider | Covered | Median | p90 |')
    print('|---|---:|---:|---:|')
    for p in providers:
        c = p.get('coverageMetrics')
        if not c:
            print(f"| {p['displayName']} | — | — | — |")
            continue
        print(
            f"| {p['displayName']} | {pct(1 - c['neverFoundShare'])} | "
            f"{mins(c['medianTimeToIndexMs'])} | {mins(c['p90TimeToIndexMs'])} |"
        )
    print()

    pairs = suite.get('firstFoundPairs') or []
    if pairs:
        print('### First-found')
        for pair in pairs:
            lead = pair.get('medianLeadMinutesWhenAFirst')
            print(
                f"- {pair['providerA']} first on {pct(pair['aFirstShare'])} of head-to-head finds "
                f"(median lead when first: {lead:.1f} min)" if lead is not None else
                f"- {pair['providerA']} first on {pct(pair['aFirstShare'])} of head-to-head finds"
            )
        print()

    breakdowns = suite.get('breakdowns') or []
    if breakdowns and len(providers) >= 2:
        a, b = providers[0], providers[1]
        print(f'### Found ≤60m by segment ({a["id"]} vs {b["id"]})')
        print('| Segment | n | ' + a['id'] + ' | ' + b['id'] + ' |')
        print('|---|---:|---:|---:|')
        segments: dict[str, dict[str, float]] = {}
        counts: dict[str, int] = {}
        for entry in breakdowns:
            dim, _, value = entry['value'].partition(':')
            if entry['dimension'] not in ('sourceType', 'language'):
                continue
            key = f"{entry['dimension']}={value}"
            segments.setdefault(key, {})[dim] = entry['metrics']['foundWithinMinutes']['m60']
            counts[key] = entry['metrics']['articleCount']
        for key in sorted(segments):
            row = segments[key]
            if a['id'] in row and b['id'] in row:
                print(f'| {key} | {counts[key]} | {pct(row[a["id"]])} | {pct(row[b["id"]])} |')
        print()

    if skipped:
        names = ', '.join(f"{p['id']} ({p['status']})" for p in skipped)
        print(f'_Skipped providers: {names}_')


if __name__ == '__main__':
    main()
