#!/bin/bash
# build-x64.sh — Sourced by build-chromium.sh
# Compiles, strips, compresses, and uploads x64 headless_shell + libs.
#
# Expects from orchestrator/setup: CHROMIUM_REVISION, CHROME_VERSION, S3_BUCKET,
#   SCRIPT_DIR, notify_failure, ERR trap, PATH with depot_tools, cwd=/srv/source/chromium/src

echo "=== Build x64 ==="
report_progress "build-x64:compile" "Compiling x64 headless_shell (autoninja)"
mkdir -p out/Headless/x64

cp "$SCRIPT_DIR/args-x64.gn" out/Headless/x64/args.gn

gn gen out/Headless/x64
autoninja -C out/Headless/x64 headless_shell

# Strip and compress binary
strip -o /srv/build/chromium/chromium-"${CHROME_VERSION}" out/Headless/x64/headless_shell
brotli --best --force /srv/build/chromium/"chromium-${CHROME_VERSION}"

# Archive SwiftShader
tar --directory out/Headless/x64 --create --file /srv/build/chromium/swiftshader.tar \
  libEGL.so libGLESv2.so libvk_swiftshader.so libvulkan.so.1 vk_swiftshader_icd.json
brotli --best --force /srv/build/chromium/swiftshader.tar

# Package AL2023 x64 system libraries
tar --directory /usr/lib64 --create --file /srv/lib/al2023.tar \
  --transform='s,^libexpat\.so\.1\.9\.3$,libexpat.so.1,' \
  --transform='s,^,lib/,' \
  libexpat.so.1.9.3 libfreebl3.so libfreeblpriv3.so libnspr4.so libnss3.so \
  libnssutil3.so libplc4.so libplds4.so libsoftokn3.so libfreebl3.chk \
  libfreeblpriv3.chk libsoftokn3.chk
brotli --best --force /srv/lib/al2023.tar

# Upload x64 artifacts to S3
echo "Uploading x64 artifacts..."
report_progress "build-x64:upload" "Uploading x64 artifacts to S3"
aws s3 cp "/srv/build/chromium/chromium-${CHROME_VERSION}.br" \
  "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/x64/chromium.br"
aws s3 cp /srv/build/chromium/swiftshader.tar.br \
  "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/x64/swiftshader.tar.br"
aws s3 cp /srv/lib/al2023.tar.br \
  "s3://${S3_BUCKET}/${CHROMIUM_REVISION}/x64/al2023.tar.br"

# Compute artifact checksums for manifest
artifact_entry() {
  local FILE="$1"
  local SIZE SHA
  SIZE=$(stat -c%s "$FILE")
  SHA=$(sha256sum "$FILE" | cut -d' ' -f1)
  jq -n --arg size "$SIZE" --arg sha "$SHA" '{size: ($size | tonumber), sha256: $sha}'
}

jq -n \
  --argjson chromium "$(artifact_entry "/srv/build/chromium/chromium-${CHROME_VERSION}.br")" \
  --argjson swiftshader "$(artifact_entry /srv/build/chromium/swiftshader.tar.br)" \
  --argjson al2023 "$(artifact_entry /srv/lib/al2023.tar.br)" \
  '{"chromium.br": $chromium, "swiftshader.tar.br": $swiftshader, "al2023.tar.br": $al2023}' \
  > /tmp/manifest-x64.json

# Clean up x64 build artifacts to avoid filename collisions with arm64
rm -f /srv/build/chromium/chromium-"${CHROME_VERSION}" \
      /srv/build/chromium/chromium-"${CHROME_VERSION}".br \
      /srv/build/chromium/swiftshader.tar \
      /srv/build/chromium/swiftshader.tar.br
rm -f /srv/lib/al2023.tar /srv/lib/al2023.tar.br

echo "x64 build complete"
