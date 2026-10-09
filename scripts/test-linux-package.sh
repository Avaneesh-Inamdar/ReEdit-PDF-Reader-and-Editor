#!/bin/sh
# Run inside an isolated Linux test environment after installing its DEB/RPM package.
set -eu
binary=${1:-/opt/Re-Edit PDF/re-edit-pdf}
label=${2:-${READIT_TEST_LABEL:-linux}}
test -x "$binary"
runtime=${READIT_TEST_ELECTRON:-node_modules/electron/dist/electron}
test -x "$runtime"
desktop-file-validate /usr/share/applications/re-edit-pdf.desktop
grep -q 'MimeType=.*application/pdf' /usr/share/applications/re-edit-pdf.desktop
grep -q '%F' /usr/share/applications/re-edit-pdf.desktop
export READIT_SMOKE_PACKAGED=1
export READIT_SMOKE_APP="$(dirname "$binary")/resources/app.asar"
export READIT_SMOKE_OUTPUT="release/linux-tests/$label"
export XDG_CURRENT_DESKTOP=GNOME
mkdir -p "$READIT_SMOKE_OUTPUT"
# Root containers cannot use Chromium's sandbox; installed desktop launches retain it.
# Containers also lack a GPU, so the Electron test harness disables GPU
# compositing and shared-memory rendering paths (the installed application
# launch checks keep the normal flags).
if [ "$(id -u)" = 0 ]; then
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" --no-sandbox --disable-gpu --disable-dev-shm-usage scripts/smoke-electron.cjs
else
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" --disable-gpu --disable-dev-shm-usage scripts/smoke-electron.cjs
fi
grep -q '"passed": true' "$READIT_SMOKE_OUTPUT/result.json"
export READIT_FEATURE_APP="$READIT_SMOKE_APP"
export READIT_FEATURE_OUTPUT="$READIT_SMOKE_OUTPUT/release-features"
if [ "$(id -u)" = 0 ]; then
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" --no-sandbox --disable-gpu --disable-dev-shm-usage scripts/smoke-release-features.cjs
else
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" --disable-gpu --disable-dev-shm-usage scripts/smoke-release-features.cjs
fi
grep -q '"passed": true' "$READIT_FEATURE_OUTPUT/result.json"
if command -v gio >/dev/null 2>&1; then
  default_pdf=$(gio mime application/pdf | head -1 | sed 's/.*: //')
else
  default_pdf=$(xvfb-run -a xdg-mime query default application/pdf)
fi
printf '%s\n' "Default PDF application: $default_pdf"
if [ "$default_pdf" != re-edit-pdf.desktop ]; then
  for defaults_file in "${XDG_CONFIG_HOME:-$HOME/.config}/mimeapps.list" "$HOME/.local/share/applications/mimeapps.list"; do
    if [ -f "$defaults_file" ]; then grep 'application/pdf=' "$defaults_file" || true; fi
  done
  exit 1
fi
printf '%s\n' "Installed package, PDF default, desktop entry, and GUI workflows passed: $label"
