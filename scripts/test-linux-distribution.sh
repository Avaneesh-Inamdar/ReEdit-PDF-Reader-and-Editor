#!/bin/sh
set -eu
case "$READIT_DISTRO" in
  fedora-43)
    dnf --setopt=install_weak_deps=False install -y gtk3 nss alsa-lib libXScrnSaver mesa-libgbm libnotify libXtst libX11-xcb xorg-x11-server-Xvfb xorg-x11-xauth xdg-utils desktop-file-utils dbus liberation-fonts tar gzip findutils
    dnf install -y /work/release/ci/re-edit-pdf-Linux/*.rpm
    ;;
  *)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends libgtk-3-0 libglib2.0-bin libnss3 libxss1 libgbm1 libnotify4 libxtst6 libx11-xcb1 xvfb xauth xdg-utils desktop-file-utils dbus-x11 fonts-liberation ca-certificates libasound2${READIT_ALSA_SUFFIX:-}
    apt-get install -y /work/release/ci/re-edit-pdf-Linux/*.deb
    ;;
esac
# The host prepares the matching Linux x64 runtime and portable JS test dependencies.
test -x node_modules/electron/dist/electron
sh scripts/test-linux-package.sh '/opt/Re-Edit PDF/re-edit-pdf' "$READIT_DISTRO"
xvfb-run -a node scripts/test-linux-launch.cjs '/opt/Re-Edit PDF/re-edit-pdf' "release/linux-tests/$READIT_DISTRO/launch.json"
if [ "$READIT_DISTRO" = debian-12 ]; then
  image=$(find /work/release/ci/re-edit-pdf-Linux -maxdepth 1 -name '*.AppImage' | head -1)
  test -n "$image"
  chmod +x "$image"
  "$image" --appimage-extract >/dev/null
  # Test the extracted AppImage payload via its binary directly (same as the
  # local lab). The AppRun wrapper is not used here: FUSE mounting is not
  # available in containers and AppRun's mount-relative lookup fails once
  # extracted to an absolute path.
  appimage_binary=$(find /work/squashfs-root -maxdepth 1 -type f -name 're-edit-pdf' | head -1)
  test -n "$appimage_binary"
  test -x "$appimage_binary"
  xvfb-run -a node scripts/test-linux-launch.cjs "$appimage_binary" release/linux-tests/debian-12/appimage-launch.json
  mkdir -p /work/release/tar-test
  tar -xzf /work/release/ci/re-edit-pdf-Linux/*.tar.gz -C /work/release/tar-test
  binary=$(find /work/release/tar-test -type f -name re-edit-pdf | head -1)
  test -n "$binary"
  xvfb-run -a node scripts/test-linux-launch.cjs "$binary" release/linux-tests/debian-12/tar-launch.json
fi
