#!/bin/bash
# setup.sh — Sourced by build-chromium.sh
# Prepares the EC2 instance: NVMe, swap, packages, depot_tools, Chromium source, patches.
#
# Expects from orchestrator: CHROMIUM_REVISION, SCRIPT_DIR, notify_failure, ERR trap

echo "=== Setup: Mount NVMe ==="
report_progress "setup" "Mounting NVMe and creating swap"
# c8id.8xlarge has an NVMe instance store at /dev/nvme1n1
if [ -b /dev/nvme1n1 ]; then
  mkfs -t ext4 -m 0 /dev/nvme1n1
  echo "/dev/nvme1n1 /srv ext4 defaults,noatime,nofail 0 2" >> /etc/fstab
  mount -a
  echo "NVMe mounted at /srv"
else
  echo "No NVMe device found, using root volume"
  mkdir -p /srv
fi

# Create 16GB swap file on NVMe — safety net for linker OOM during ThinLTO
echo "Creating 16GB swap file..."
fallocate -l 16G /srv/swapfile
chmod 600 /srv/swapfile
mkswap /srv/swapfile
swapon /srv/swapfile
echo "Swap enabled: $(swapon --show)"

echo "=== Setup: Install dependencies ==="
report_progress "setup:packages" "Installing system packages"

# Critical for ThinLTO/official builds — linker will crash without this
sysctl -w vm.max_map_count=262144

dnf update -y
dnf install -y \
  "@Development Tools" \
  alsa-lib-devel atk-devel bc bluez-libs-devel brotli bzip2-devel \
  cairo-devel cmake cups-devel dbus-devel dbus-glib-devel dbus-x11 \
  expat-devel glibc glibc-langpack-en gperf gtk3-devel httpd \
  java-17-amazon-corretto libatomic libcap-devel libjpeg-devel \
  libstdc++ libXScrnSaver-devel libxkbcommon-x11-devel mod_ssl \
  ncurses-compat-libs nspr-devel nss-devel pam-devel pciutils-devel \
  perl php php-cli pulseaudio-libs-devel python python-psutil \
  python-setuptools ruby xorg-x11-server-Xvfb zlib

echo "=== Setup: Create directories ==="
mkdir -p /srv/{build/chromium,source/chromium,lib}

echo "=== Setup: Sync Chromium source ==="
report_progress "setup:sync" "Syncing Chromium source (gclient sync)"

# Prepend depot_tools to PATH so it takes priority
export PATH="/srv/source/depot_tools:$PATH"

git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git \
  /srv/source/depot_tools

# Copy .gclient from the repo
cp "$SCRIPT_DIR/.gclient" /srv/source/chromium/.gclient

# Resolve git SHA from revision number
echo "Resolving git SHA for revision ${CHROMIUM_REVISION}..."
REVISION_JSON=$(curl -sf "https://cr-rev.appspot.com/_ah/api/crrev/v1/redirect/${CHROMIUM_REVISION}")
GIT_SHA=$(echo "$REVISION_JSON" | jq -r '.git_sha')
echo "Git SHA: ${GIT_SHA}"

cd /srv/source/chromium || exit 1
gclient sync --force --reset --delete_unversioned_trees \
  --revision "${GIT_SHA}" --with_branch_heads
gclient runhooks

echo "=== Setup: Apply patches ==="
report_progress "setup:patches" "Applying source patches"
cd /srv/source/chromium/src || exit 1

sed -i -f "$SCRIPT_DIR/patches/sandbox-ipc-failed-polls.sed" \
  content/browser/sandbox_ipc_linux.cc

sed -i -f "$SCRIPT_DIR/patches/render-process-host-check.sed" \
  content/browser/renderer_host/render_process_host_impl.cc

# Verify patches took effect
grep -q 'failed_polls = 0' content/browser/sandbox_ipc_linux.cc \
  || notify_failure "Patch verification failed: sandbox_ipc_linux.cc — expected 'failed_polls = 0'"

grep -q '// .*CHECK(render_process_host->InSameStoragePartition(' \
  content/browser/renderer_host/render_process_host_impl.cc \
  || notify_failure "Patch verification failed: render_process_host_impl.cc — CHECK line not commented out"

echo "Patches applied and verified"

# Extract Chrome version (available to subsequent scripts via sourcing)
CHROME_VERSION=$(sed --regexp-extended 's~[^0-9]+~~g' chrome/VERSION | tr '\n' '.' | sed 's~[.]$~~')
echo "Chrome version: ${CHROME_VERSION}"
report_progress "setup:complete" "Setup finished, Chrome ${CHROME_VERSION}"
