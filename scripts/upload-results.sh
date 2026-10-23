#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-$ROOT/results/latest.json}"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" || -z "${S3_PUBLIC_BASE_URL:-}" ]]; then
  echo "Set S3_BUCKET and S3_PUBLIC_BASE_URL (and AWS/Spaces credentials) to upload." >&2
  exit 1
fi

KEY="${S3_RESULTS_KEY:-latest.json}"

if command -v aws >/dev/null 2>&1; then
  EXTRA=()
  if [[ -n "${S3_ENDPOINT:-}" ]]; then
    EXTRA+=(--endpoint-url "$S3_ENDPOINT")
  fi
  aws s3 cp "$FILE" "s3://${S3_BUCKET}/${KEY}" "${EXTRA[@]}" --acl public-read
  echo "Uploaded to ${S3_PUBLIC_BASE_URL%/}/${KEY}"
else
  echo "aws CLI not found; copy $FILE to your bucket manually." >&2
  exit 1
fi
