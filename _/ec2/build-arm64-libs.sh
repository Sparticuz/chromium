#!/bin/bash
# build-arm64-libs.sh — Standalone script for arm64 AL2023 system library packaging.
# Runs on a small arm64 AL2023 EC2 instance launched by build-chromium.yml.
# Packages the same NSS/NSPR/expat libs as build-x64.sh for arm64 Lambda.
#
# Required environment variables (set by user-data wrapper):
#   CHROMIUM_REVISION   — Chromium revision number
#   S3_BUCKET           — S3 bucket for artifact upload
#   AWS_DEFAULT_REGION  — AWS region

set -euo pipefail
export HOME="${HOME:-/root}"

LOG="/var/log/arm64-libs.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== arm64 AL2023 Libs Build Started at $(date -u) ==="
echo "Revision: ${CHROMIUM_REVISION}"

# Self-destruct in 1 hour (this should take < 5 minutes)
shutdown -h +60 "arm64 libs safety timeout (1 hour)"

# Install required packages
dnf install -y nss nspr expat brotli

# Create working directory
mkdir -p /srv/lib

# Package AL2023 arm64 system libraries (same set as x64 in build-x64.sh)
echo "Packaging arm64 AL2023 system libraries..."

# Find the actual expat version (may vary across AL2023 updates)
EXPAT_SO=$(ls /usr/lib64/libexpat.so.1.* 2>/dev/null | head -1)
EXPAT_BASENAME=$(basename "$EXPAT_SO")

tar --directory /usr/lib64 --create --file /srv/lib/al2023.tar \
  --transform="s,^${EXPAT_BASENAME}$,libexpat.so.1," \
  --transform='s,^,lib/,' \
  "$EXPAT_BASENAME" libfreebl3.so libfreeblpriv3.so libnspr4.so libnss3.so \
  libnssutil3.so libplc4.so libplds4.so libsoftokn3.so libfreebl3.chk \
  libfreeblpriv3.chk libsoftokn3.chk

brotli --best --force /srv/lib/al2023.tar

# Upload to S3
echo "Uploading arm64 al2023.tar.br to S3..."
aws s3 cp /srv/lib/al2023.tar.br \
  "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/arm64/al2023.tar.br"

# Update manifest.json with arm64 al2023 checksum
MANIFEST_S3="s3://${S3_BUCKET}/${CHROMIUM_REVISION}/manifest.json"
MANIFEST_TMP="/tmp/manifest.json"
aws s3 cp "$MANIFEST_S3" "$MANIFEST_TMP" 2>/dev/null || echo '{}' > "$MANIFEST_TMP"

AL2023_PATH="/srv/lib/al2023.tar.br"
AL2023_SIZE=$(stat -c%s "$AL2023_PATH")
AL2023_SHA=$(sha256sum "$AL2023_PATH" | cut -d' ' -f1)

jq --arg size "$AL2023_SIZE" --arg sha "$AL2023_SHA" \
  '(.arm64 //= {}) | (.arm64.binaries //= {}) | .arm64.binaries["al2023.tar.br"] = {size: ($size | tonumber), sha256: $sha}' \
  "$MANIFEST_TMP" > "${MANIFEST_TMP}.tmp" && mv "${MANIFEST_TMP}.tmp" "$MANIFEST_TMP" && aws s3 cp "$MANIFEST_TMP" "$MANIFEST_S3"

# Upload a small completion marker for debugging
cat <<EOF | aws s3 cp - "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/arm64-libs-complete.json"
{
  "revision": "${CHROMIUM_REVISION}",
  "completed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "success"
}
EOF

echo "=== arm64 libs complete at $(date -u) ==="

# Upload log and shut down
aws s3 cp "$LOG" "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/arm64-libs.log" || true
shutdown -c || true
shutdown -h now
