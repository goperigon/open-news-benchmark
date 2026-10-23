# Cyber-breach suite — live incident detection vs general-purpose LLMs

## Question

Prospects ask: **“Why don’t I just use ChatGPT for this?”** This suite measures whether a **user-configured Perigon Monitor** detects verified cyber incidents faster and with richer impact detail than **general-purpose LLMs with web search**, Google News RSS, and Perigon’s raw search API.

## Participants

| ID | Role |
| --- | --- |
| `perigon_monitor` | Flagship: benchmark-owned copy of production **Global Cyber Breach Reports** ([perigon-monitor.json](perigon-monitor.json), source signal `58372171-8797-476b-af48-e5f9ac3209a5`) |
| `perigon_search` | Ablation: same news index, keyword search only |
| `google_news_rss` | Free baseline: fixed RSS query |
| `openai_websearch` | ChatGPT-class model + native web search |
| `anthropic_websearch` | Claude + native web search |
| `gemini_grounded` | Gemini + Google Search grounding |

LLMs are labeled **general-purpose LLMs with web search**, not monitoring products.

## Ground truth

- Pre-registered **global panel** in [panel.json](panel.json), polled every 30s (same RSS machinery as the latency suite).
- **Time zero** = first time the panel sees a qualifying incident article (`first_seen_at`).
- **Pooled incidents:** verified incidents first found by any participant join the denominator (blind adjudication for disputes).
- **Unit = incident**, not article or monitor event. First sighting wins within the tracking window.

## Same task

- Shared definition and output shape: [prompt.md](prompt.md), [incident-schema.json](incident-schema.json). Aligned with the Global Cyber Breach monitor (major breaches/leaks, named victims).
- The frozen monitor query matches production: **English articles**, `excludeLabel: Low`, boolean keyword query — not the full multilingual ground-truth panel filter.
- **Discovery poll:** every 15 minutes for all participants.
- **Tracking window:** 4 hours per incident (`trackingWindowMs` in [config.json](config.json)); smoke uses 1 hour.
- Monitor events are **read on the poll schedule**, not credited at raw push time (raw timestamps disclosed separately).

## Metrics (primary first)

1. **Coverage within window** — share of verified incidents found before tracking ends.
2. **Speed** — found within 15m, 1h, 4h; first-found share between pairs.
3. **Enrichment (correctness-graded)** — organizations (including vendor/downstream roles when schema supports it), people affected, data types, countries.
4. **Precision** — unsupported or false claims per 100 surfaced.
5. **Common-article extraction** — same URLs given to every system; extraction accuracy only (`bench cyber extract-test`).
6. **Cost and latency** — reported separately.

## Fairness

- Pre-register panel, prompts, monitor config, and windows; publish hashes in results JSON.
- LLM prompts: tuning period documented in [prompts/README.md](prompts/README.md); frozen before official series.
- Blind adjudication CSV: `bench cyber adjudicate export|import`.
- Publish raw claims, citations, and adjudications.

## Run modes

- **Smoke (~2h):** `./scripts/run-cyber-smoke.sh` — validates plumbing, not headline comparisons.
- **Full:** `./scripts/run-cyber.sh` — collect until `targetIncidentCount` (default 100) + tracking window.

## Monitor lifecycle

1. Create or verify monitor config in [perigon-monitor.json](perigon-monitor.json).
2. Set `PERIGON_MONITOR_ID` and activate the monitor in Perigon before production runs.
3. Freeze config; do not edit mid-series.
