#!/bin/sh
set -eu
binary=$(realpath "$1")
root=$(pwd)
export LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
if [ "$(id -u)" = 0 ]; then export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1; fi
node scripts/generate-selection-fixture.mjs
for suite in editing-regression ocr-recognition layout-stability updates selection; do
  export REEDIT_TEST_SUITE="$suite"
  export REEDIT_TEST_OUTPUT="$root/release/native-validation/regressions/$suite"
  case "$suite" in
    selection) fixture=release/native-validation/selection.pdf ;;
    ocr-recognition) fixture=release/native-validation/tauri/ocr-image-only.pdf ;;
    layout-stability) fixture=release/validation-oct17/layout/mixed-pages.pdf ;;
    *) fixture=test-fixtures/simple-text.pdf ;;
  esac
  mkdir -p "$REEDIT_TEST_OUTPUT"
  timeout 100s dbus-run-session -- xvfb-run -a "$binary" "$root/$fixture" > "$REEDIT_TEST_OUTPUT/launch.log" 2>&1
  python3 - "$REEDIT_TEST_OUTPUT/result.json" <<'PY'
import json,sys
result=json.load(open(sys.argv[1]))
assert not result['errors'],result
assert result['checks'] and all(result['checks'].values()),result
print(json.dumps(result))
PY
done
