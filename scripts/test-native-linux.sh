#!/bin/sh
set -eu
binary=$(realpath "$1")
label=${2:-linux}
root=$(pwd)
export REEDIT_TEST_OUTPUT="$root/release/native-validation/distros/$label"
export REEDIT_TEST_SUITE=linux-smoke
export LIBGL_ALWAYS_SOFTWARE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
mkdir -p "$REEDIT_TEST_OUTPUT"
chmod +x "$binary"
# Sandbox disabling is limited to root-owned isolated test containers. Normal
# packages and AppRun retain the WebKit sandbox and the user's display backend.
if [ "$(id -u)" = 0 ]; then export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1; fi
timeout 90s dbus-run-session -- xvfb-run -a "$binary" "$root/test-fixtures/simple-text.pdf" > "$REEDIT_TEST_OUTPUT/launch.log" 2>&1
chmod 644 "$REEDIT_TEST_OUTPUT/result.json"
python3 - "$REEDIT_TEST_OUTPUT/result.json" <<'PY'
import json,sys
result=json.load(open(sys.argv[1]))
assert not result['errors'],result
assert result['checks'] and all(result['checks'].values()),result
print(json.dumps(result))
PY
