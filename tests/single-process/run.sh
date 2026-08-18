#!/usr/bin/env bash
#
# Reproduction for the removal of `--single-process` from `Chromium.args`.
#
#   ./run.sh               runs both modes, one container at a time, then prints the table
#   MODE=with ./run.sh     runs a single mode ("with" or "without")
#
# The package under test is built from this checkout and mounted over the layer's
# copy, so the result reflects `source/index.ts` rather than a published build.
# The Chromium binaries are not in the repository, so they come from a published
# layer release; only the JavaScript is replaced.
#
# Requires docker. On a non-arm64 host, docker must be able to run linux/arm64.
set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

LAYER_VERSION="${LAYER_VERSION:-v149.0.0}"
LAYER_URL="https://github.com/Sparticuz/chromium/releases/download/${LAYER_VERSION}/chromium-${LAYER_VERSION}-layer.arm64.zip"
IMAGE="chromium-single-process-repro"
PACKAGE_DIR="/opt/nodejs/node_modules/@sparticuz/chromium"

echo "==> building the package from source"
npm --prefix "$REPO_ROOT" run build

if [ ! -d layer ]; then
  echo "==> fetching the published layer ${LAYER_VERSION} (for the Chromium binaries)"
  curl -sSL -o chromium-layer.arm64.zip "$LAYER_URL"
  mkdir -p layer
  unzip -q -o chromium-layer.arm64.zip -d layer
fi

echo "==> building $IMAGE"
docker build --platform linux/arm64 -t "$IMAGE" . > /dev/null

# Each mode overwrites its own out/result-<mode>.json.
mkdir -p out

run_mode() {
  local mode="$1"
  echo "==> running mode: $mode"
  # Lambda-like shape. AWS_EXECUTION_ENV is what makes @sparticuz/chromium
  # extract al2023.tar.br and set LD_LIBRARY_PATH; without it the binary
  # extracts and then dies on a missing libnspr4.so, unrelated to the flag.
  #
  # The two read-only mounts put the local build in front of the layer's, so the
  # args under test are the ones this checkout produces. bin/ is left alone: it
  # holds the compressed binaries, which are not in the repository.
  docker run --rm \
    --platform linux/arm64 \
    --cpus=2.31 --memory=4096m \
    -e AWS_EXECUTION_ENV=AWS_Lambda_nodejs24.x \
    -e MODE="$mode" \
    -v "$REPO_ROOT/build:${PACKAGE_DIR}/build:ro" \
    -v "$REPO_ROOT/package.json:${PACKAGE_DIR}/package.json:ro" \
    -v "$PWD/out:/out" \
    "$IMAGE"
}

if [ -n "${MODE:-}" ]; then
  run_mode "$MODE"
  exit 0
fi

# One at a time. Containers launched back to back in parallel fail at
# `Target.setDiscoverTargets: Target closed` in both modes, unrelated to the flag.
run_mode without
run_mode with

echo "==> comparison"
docker run --rm --platform linux/arm64 -v "$PWD/out:/out" --entrypoint node "$IMAGE" /var/task/report.mjs /out
