#!/bin/sh
set -eu
label=$(printf '%s' "$1" | tr ':' '-')
case "$1" in
  fedora:*)
    dnf install -y webkit2gtk4.1 gtk3 fontconfig xdg-desktop-portal-gtk cups-client xorg-x11-server-Xvfb xorg-x11-xauth dbus-daemon python3 which tar gzip
    rpm -Uvh release/downloaded/native-packages/*.rpm
    package=$(rpm -qp --queryformat '%{NAME}' release/downloaded/native-packages/*.rpm)
    installed=$(rpm -ql "$package" | awk '/\/bin\// {print;exit}')
    ;;
  *)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y libwebkit2gtk-4.1-0 libgtk-3-0 fontconfig xdg-desktop-portal-gtk cups-client xvfb xauth dbus-x11 python3 binutils
    apt-get install -y ./release/downloaded/native-packages/*.deb
    package=$(dpkg-deb -f release/downloaded/native-packages/*.deb Package)
    installed=$(dpkg -L "$package" | awk '/\/bin\// {print;exit}')
    ;;
esac
# Determine the name from package contents; names can be normalized by bundlers.
if [ -z "${installed:-}" ] || [ ! -x "$installed" ]; then
  installed=$(find /usr/bin -maxdepth 1 -iname '*re*edit*pdf*' -type f -print -quit)
fi
test -n "$installed"
ldd "$installed" | tee release/native-validation-installed-libraries.log
if ldd "$installed" | grep -q 'not found'; then exit 1; fi
# The opt-in harness is compiled from the same commit and release profile. The
# production package is also launched below, with no test IPC enabled.
sh scripts/test-native-linux.sh release/validation-tool/Re-Edit-PDF "$label"
output="release/native-validation/distros/$label"
export LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
set +e
timeout 12s dbus-run-session -- xvfb-run -a "$installed" "$PWD/test-fixtures/simple-text.pdf" > "$output/package-launch.log" 2>&1
status=$?
set -e
test "$status" -eq 124
# Exercise the actual AppImage runtime and bundled libraries without requiring
# FUSE inside the container. This does not validate FUSE/AppArmor on a desktop.
appimage=$(realpath release/downloaded/native-packages/*.AppImage)
chmod +x "$appimage"
set +e
APPIMAGE_EXTRACT_AND_RUN=1 timeout 20s dbus-run-session -- xvfb-run -a "$appimage" "$PWD/test-fixtures/simple-text.pdf" > "$output/appimage-launch.log" 2>&1
appimage_status=$?
set -e
if [ "$appimage_status" -ne 124 ]; then cat "$output/appimage-launch.log"; exit 1; fi
python3 - "$output/package-result.json" "$label" <<'PY'
import json,sys
json.dump({'distribution':sys.argv[2],'installedPackageLaunched':True,'appImageExtractAndRunLaunched':True,'environment':'container/Xvfb; FUSE, real desktop gestures and printers not tested'},open(sys.argv[1],'w'),indent=2)
PY
