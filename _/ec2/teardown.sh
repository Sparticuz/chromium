#!/bin/bash
# teardown.sh — Sourced by build-chromium.sh
# Uploads shared artifacts, notifies GitHub of success, and shuts down.
#
# Expects from orchestrator/setup: CHROMIUM_REVISION, CHROME_VERSION, S3_BUCKET,
#   GITHUB_PAT, GITHUB_REPO, PR_NUMBER, LOG, notify_failure, ERR trap

echo "=== Teardown: Finalize ==="
report_progress "teardown" "Uploading logs and notifying GitHub"

# Scrub secrets from build log before upload
sed -i "s/${GITHUB_PAT}/[REDACTED]/g" "$LOG" 2>/dev/null || true

# Upload build log
aws s3 cp "$LOG" "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/build.log" || true

# Finalize build.json with success status
S3_BUILD="s3://${S3_BUCKET}/${CHROMIUM_REVISION}/build.json"
TMP_BUILD="/tmp/build.json"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NOW_EPOCH=$(date +%s)
ELAPSED=$(( NOW_EPOCH - BUILD_START_EPOCH ))
HOURS=$(( ELAPSED / 3600 ))
MINS=$(( (ELAPSED % 3600) / 60 ))

aws s3 cp "$S3_BUILD" "$TMP_BUILD" 2>/dev/null || echo '{}' > "$TMP_BUILD"

jq \
  --arg rev "$CHROMIUM_REVISION" \
  --argjson pr "$PR_NUMBER" \
  --arg ts "$TIMESTAMP" \
  --arg cv "$CHROME_VERSION" \
  --arg elapsed "${HOURS}h${MINS}m" \
  '
  .revision //= $rev |
  .pr_number //= $pr |
  .started_at //= $ts |
  .status = "success" |
  .chrome_version = $cv |
  .events //= [] |
  .events += [{
    phase: "completed",
    detail: "Build successful",
    timestamp: $ts,
    elapsed: $elapsed,
    status: "success",
    chrome_version: $cv
  }]
  ' "$TMP_BUILD" > "${TMP_BUILD}.tmp" && mv "${TMP_BUILD}.tmp" "$TMP_BUILD" \
  && aws s3 cp "$TMP_BUILD" "$S3_BUILD"

# Assemble manifest.json with artifact checksums
S3_MANIFEST="s3://${S3_BUCKET}/${CHROMIUM_REVISION}/manifest.json"
MANIFEST_TMP="/tmp/manifest.json"

# Download fonts to compute checksum
aws s3 cp "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/fonts.tar.br" /tmp/fonts.tar.br || true

# Download existing manifest (arm64-libs instance may have contributed)
aws s3 cp "$S3_MANIFEST" "$MANIFEST_TMP" 2>/dev/null || echo '{}' > "$MANIFEST_TMP"

# Merge per-arch binaries into manifest
for arch in x64 arm64; do
  arch_file="/tmp/manifest-${arch}.json"
  if [ -f "$arch_file" ]; then
    jq \
      --arg arch "$arch" \
      --slurpfile bins "$arch_file" \
      '.[$arch].binaries = ((.[$arch].binaries // {}) + $bins[0])' \
      "$MANIFEST_TMP" > "${MANIFEST_TMP}.tmp" && mv "${MANIFEST_TMP}.tmp" "$MANIFEST_TMP"
  fi
done

# Compute fonts checksum and add to manifest
fonts_path="/tmp/fonts.tar.br"
if [ -f "$fonts_path" ]; then
  fonts_size=$(stat -c%s "$fonts_path")
  fonts_sha=$(sha256sum "$fonts_path" | cut -d' ' -f1)
  jq \
    --argjson size "$fonts_size" \
    --arg sha "$fonts_sha" \
    '.fonts = {"fonts.tar.br": {size: $size, sha256: $sha}}' \
    "$MANIFEST_TMP" > "${MANIFEST_TMP}.tmp" && mv "${MANIFEST_TMP}.tmp" "$MANIFEST_TMP"
fi

# Set top-level metadata
jq \
  --arg rev "$CHROMIUM_REVISION" \
  --arg cv "$CHROME_VERSION" \
  --arg ts "$TIMESTAMP" \
  '.revision = $rev | .chrome_version = $cv | .built_at = $ts' \
  "$MANIFEST_TMP" > "${MANIFEST_TMP}.tmp" && mv "${MANIFEST_TMP}.tmp" "$MANIFEST_TMP" \
  && aws s3 cp "$MANIFEST_TMP" "$S3_MANIFEST"

# Remove pending marker
aws s3 rm "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/pending.json" || true

# Notify GitHub via repository_dispatch
echo "Notifying GitHub..."
curl -sf -X POST \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_REPO}/dispatches" \
  -d "{
    \"event_type\": \"build-complete\",
    \"client_payload\": {
      \"revision\": \"${CHROMIUM_REVISION}\",
      \"pr_number\": \"${PR_NUMBER}\",
      \"status\": \"success\"
    }
  }"

echo "=== Build Complete at $(date -u) ==="

# Cancel the 6-hour safety timer; shut down now
shutdown -c || true
shutdown -h now
