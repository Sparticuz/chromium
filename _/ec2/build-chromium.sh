#!/bin/bash
# build-chromium.sh — Orchestrator that runs on EC2 via user-data.
# Sets up logging, error handling, and self-destruct, then sources
# sub-scripts for each phase of the Chromium build.
#
# Required environment variables (set by user-data wrapper):
#   CHROMIUM_REVISION  — Chromium revision number (e.g., 1596535)
#   S3_BUCKET          — S3 bucket for artifact upload
#   GITHUB_PAT         — GitHub PAT for repository_dispatch
#   GITHUB_REPO        — GitHub repo (e.g., owner/repo)
#   PR_NUMBER          — PR number to notify
#   AWS_DEFAULT_REGION — AWS region (e.g., us-east-1)

set -euo pipefail

# Ensure HOME is set — user-data runs via cloud-init where HOME may be unset,
# causing depot_tools auth and metrics warnings.
export HOME="${HOME:-/root}"

# Resolve the directory containing this script and its companions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# === Self-destruct timer ===
# Schedule shutdown in 6 hours as the VERY FIRST action.
# instance_initiated_shutdown_behavior=terminate ensures the instance is terminated.
shutdown -h +360 "Build safety timeout reached (6 hours)"

LOG="/var/log/chromium-build.log"
BUILD_START_EPOCH=$(date +%s)
exec > >(tee -a "$LOG") 2>&1
echo "=== Chromium Build Started at $(date -u) ==="
echo "Revision: ${CHROMIUM_REVISION-}"
echo "S3 Bucket: ${S3_BUCKET-}"
echo "PR: ${PR_NUMBER-}"

# Validate required environment variables
for VAR in CHROMIUM_REVISION S3_BUCKET GITHUB_PAT GITHUB_REPO PR_NUMBER AWS_DEFAULT_REGION; do
  if [[ -z "${!VAR-}" ]]; then
    echo "FATAL: Required environment variable ${VAR} is empty or unset"
    exit 1
  fi
done
[[ "${PR_NUMBER}" =~ ^[0-9]+$ ]] || { echo "FATAL: PR_NUMBER must be a number, got: ${PR_NUMBER}"; exit 1; }

# Helper: append a progress event to build.json on S3.
# First call creates the file with top-level metadata; subsequent calls append.
report_progress() {
  local PHASE="$1"
  local DETAIL="${2:-}"
  local NOW_EPOCH
  NOW_EPOCH=$(date +%s)
  local ELAPSED=$(( NOW_EPOCH - BUILD_START_EPOCH ))
  local HOURS=$(( ELAPSED / 3600 ))
  local MINS=$(( (ELAPSED % 3600) / 60 ))

  echo ">>> Progress: ${PHASE} (${HOURS}h${MINS}m elapsed)"

  local S3_PATH="s3://${S3_BUCKET}/${CHROMIUM_REVISION}/build.json"
  local TMP="/tmp/build.json"
  local TIMESTAMP
  TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Download existing build.json, or start with empty structure
  aws s3 cp "$S3_PATH" "$TMP" 2>/dev/null || echo '{}' > "$TMP"

  # Append event and ensure top-level metadata via jq
  jq \
    --arg rev "${CHROMIUM_REVISION}" \
    --argjson pr "${PR_NUMBER}" \
    --arg started "$TIMESTAMP" \
    --arg phase "$PHASE" \
    --arg detail "$DETAIL" \
    --arg ts "$TIMESTAMP" \
    --arg elapsed "${HOURS}h${MINS}m" \
    '
    .revision //= $rev |
    .pr_number //= $pr |
    .started_at //= $started |
    .status = "in_progress" |
    .events //= [] |
    .events += [{phase: $phase, detail: $detail, timestamp: $ts, elapsed: $elapsed}]
    ' "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP" && aws s3 cp "$TMP" "$S3_PATH" 2>/dev/null || true
}

# Helper: notify GitHub of failure and exit
notify_failure() {
  local MESSAGE="${1:-Build failed}"
  # Escape for JSON: backslashes, double quotes, tabs
  MESSAGE=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
  echo "FAILURE: ${MESSAGE}"

  # Upload failure marker to build.json
  local S3_PATH="s3://${S3_BUCKET}/${CHROMIUM_REVISION}/build.json"
  local TMP="/tmp/build.json"
  local TIMESTAMP
  TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local NOW_EPOCH
  NOW_EPOCH=$(date +%s)
  local ELAPSED=$(( NOW_EPOCH - BUILD_START_EPOCH ))
  local HOURS=$(( ELAPSED / 3600 ))
  local MINS=$(( (ELAPSED % 3600) / 60 ))

  aws s3 cp "$S3_PATH" "$TMP" 2>/dev/null || echo '{}' > "$TMP"
  printf '%s' "$MESSAGE" > /tmp/build_error_msg.txt

  jq \
    --arg rev "${CHROMIUM_REVISION}" \
    --argjson pr "${PR_NUMBER}" \
    --arg started "$TIMESTAMP" \
    --arg ts "$TIMESTAMP" \
    --arg elapsed "${HOURS}h${MINS}m" \
    --rawfile msg /tmp/build_error_msg.txt \
    '
    .revision //= $rev |
    .pr_number //= $pr |
    .started_at //= $started |
    .status = "failed" |
    .events //= [] |
    .events += [{phase: "failed", detail: ($msg | rtrimstr("\n")), timestamp: $ts, elapsed: $elapsed, status: "failed", error: ($msg | rtrimstr("\n"))}]
    ' "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP" && aws s3 cp "$TMP" "$S3_PATH" || true

  # Remove pending marker
  aws s3 rm "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/pending.json" || true

  # Scrub secrets from build log before upload
  sed -i "s/${GITHUB_PAT}/[REDACTED]/g" "$LOG" 2>/dev/null || true

  # Upload build log
  aws s3 cp "$LOG" "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/build.log" || true

  # Notify GitHub
  curl -sf -X POST \
    -H "Authorization: token ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/dispatches" \
    -d "{
      \"event_type\": \"build-complete\",
      \"client_payload\": {
        \"revision\": \"${CHROMIUM_REVISION}\",
        \"pr_number\": \"${PR_NUMBER}\",
        \"status\": \"failed\",
        \"error\": \"${MESSAGE}\"
      }
    }" || true

  # Cancel the 6-hour shutdown timer; shut down now
  shutdown -c || true
  shutdown -h now
  exit 1
}

# Trap any unexpected failure
trap 'notify_failure "Unexpected error on line $LINENO"' ERR

# === Run build phases ===
source "$SCRIPT_DIR/setup.sh"
source "$SCRIPT_DIR/build-x64.sh"
source "$SCRIPT_DIR/build-arm64.sh"
source "$SCRIPT_DIR/teardown.sh"
