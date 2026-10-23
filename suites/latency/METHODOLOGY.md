# Latency suite — time to index

## Source panel

- Pre-registered in [panel.json](panel.json). Every source has a verified RSS/Atom feed, a Google News sitemap, or both.
- Tags: `sourceType` (wire, press_release_wire, business, regional, non_english), `language`, `country`.
- Verify with `bun run bench panel-check`. A channel is usable when it returns 2xx, contains items on the source's own domain, and its newest item is at most 72 hours old. `--apply` rewrites the panel with verified URLs and records every removed source and the reason in [panel-exclusions.json](panel-exclusions.json).
- The harness identifies itself with an `OpenNewsBenchmark` User-Agent. Publishers that block it are excluded, not worked around.
- Do not change the panel mid-run. Start a new run series after panel updates.
- **Excluded: `reuters.com` (2026-10-16, all providers).** This benchmark only credits a find on the publisher's own domain. For the benchmark API key, Perigon's `reuters.com` source ingests only a sparse subset (~2 articles/day) while Reuters stories are carried via syndicated reprints on other domains, which the matcher cannot credit; Google News returns `reuters.com` directly. Keeping the source would measure source-carriage differences rather than indexing latency/coverage, so it is removed from ground truth for every provider. Recorded in [panel-exclusions.json](panel-exclusions.json).

## Run shape

1. **Collection:** poll publisher feeds every 30s until **1,000** ground-truth articles (`targetArticleCount`) or `--duration` (collection ceiling) is reached. At most **50** articles per panel domain (`maxArticlesPerDomain`).
2. **Drain:** Perigon and Google News RSS keep probing for **2 hours** (`coverageWindowMs`) after collection stops so the last-collected article gets a full coverage window.
3. **Report:** `bun run bench report --run-id <id> --publish`.

Use `./scripts/run-latency.sh` (collection ceiling 8h by default; run ends at 1,000 articles + 2h drain, typically ~5h wall time). For a short query sanity check first, use `./scripts/run-smoke.sh` (~90 min, 200 articles, latency window only).

## Ground truth

- Poll every source's **RSS/Atom feed** and **Google News sitemap** concurrently every 30s (`groundTruthPollIntervalMs`). For a sitemap index, the first three child sitemaps are read.
- **Baseline sweep:** each source channel's first successful poll is a baseline. URLs already present then were published before the run and are never measured. Only URLs that appear afterwards count. A failed first poll does not set the baseline.
- **Resurfaced backlog:** some feeds return a different subset of items on each request, so old URLs reappear after the baseline. A new URL whose publisher date is more than 2 hours (`maxPublisherAgeMs`) before we first see it is skipped. Items without a parseable publisher date are kept.
- **Time zero (`first_seen_at`)**: when the poll that first returned the normalized URL completed.
- Store publisher `published_at` for reference only.
- After insert, fetch each article page once (concurrency-limited) and store normalized `<link rel="canonical">` and `og:url` values as URL aliases.

## Provider probing

- Track each article for **24 hours** (`trackingWindowMs`).
- **Perigon** and **Google News RSS** are both probed every **60s** (`providerProbeIntervalMs`; neither provider overrides this minimum).
- Domain batches default to **5** sites. Any domain with **20+** still-unfound articles is queried alone so high-volume sites do not consume the 100-result cap for batch-mates.
- **Perigon:** `showReprints=false`, single 100-result page sorted by `addDate`. Search window is a sliding `now − trackingWindowMs` (24h). Each matched article stores Perigon's `addDate` as `provider_timestamp` so index-time can be separated from probe-time.
- **Google News RSS:** `when:1h`, 100-item cap, no paging. Because the query only returns items published in the last hour, Google cannot earn coverage credit for an article it indexes more than ~1h after publication; disclose this when comparing coverage. Syndicated/clustered stories may appear once under Google.
- Providers with **zero successful requests** in a run are published as `skipped_error` (unmeasured), not 0% recall.
- Match provider results to ground-truth articles (first hit wins):
  1. Normalized URL (https, strip `www.`/`amp.`/`m.`, AMP path suffixes, tracking params including `utm_*`, `ref`, `cmpid`, …)
  2. Stored canonical / `og:url` alias
  3. Same site, same last path segment (≥20 chars) or same numeric id (≥6 digits)
  4. Exact normalized title within the same site (Google News uses `<source url>` + stripped ` - Publisher` suffix)
  5. Fuzzy title: same site, ≥5 tokens each, Jaccard ≥0.9, provider timestamp within 6h of `first_seen_at` when present
- Record `found_at`, `match_method`, `time_to_index_ms = found_at - first_seen_at`, and the provider's self-reported timestamp (`provider_timestamp`, e.g. Perigon `addDate`) when available. Published latency metrics may include `matchMethodShares` per provider.

## Miss audit

- `bun run bench audit-misses --run-id <id> --provider perigon [--n 50]` writes `results/audit-<run>-<provider>.csv` with a random sample of never-found articles (`actually_present`, `notes` for manual verification).

## Headline metrics

The benchmark reports **two** per-article windows, both measured from each article’s own `first_seen_at` so every article gets an identical window:

- **Latency (`metrics`, 60 minutes, `latencyWindowMs`):** a find after 60 minutes counts as not found for found-within, curves, medians, first-found pairs, and `matchMethodShares`.
- **Coverage (`coverageMetrics`, 2 hours, `coverageWindowMs`):** a find after 2 hours counts as not covered. `1 − neverFoundShare` on `coverageMetrics` is the coverage rate.

- **Time-to-index curve:** share of articles found within *t* minutes of `first_seen_at` (60-minute cap applies at every point on the curve).
- **Found within** 5, 15, and 60 minutes (relative to `first_seen_at`).
- **Median and p90** time to index among articles found within the respective window.
- **First-found share** between provider pairs on articles both indexed.
- Breakdowns by `sourceType` and `language`.

## Secondary metrics

- Median API response time per provider (client-measured round trip).

## Disclosure (every published run)

- Ground-truth poll interval and each provider's effective probe interval (timing resolution).
- Declared plan tier per provider (`*_PLAN` env vars).
- Harness git SHA, panel hash, config hash, region, window start/end.

## Perigon-specific notes

- Use a **real-time** API key (not a tier with intentional delay).
- Perigon’s public crawl cadence varies by source tier; the panel includes regular outlets, not only top sites.
