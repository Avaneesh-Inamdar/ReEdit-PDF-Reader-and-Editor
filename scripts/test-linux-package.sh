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
if [ "$(id -u)" = 0 ]; then
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" --no-sandbox scripts/smoke-electron.cjs
else
  xvfb-run -a -s '-screen 0 1600x1000x24' "$runtime" scripts/smoke-electron.cjs
fi
grep -q '"passed": true' "$READIT_SMOKE_OUTPUT/result.json"
test "$(xdg-mime query default application/pdf)" = re-edit-pdf.desktop
printf '%s\n' "Installed package, PDF default, desktop entry, and GUI workflows passed: $label"
