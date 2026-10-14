# Re-Edit PDF 2.0.0-alpha.1 validation

This is an x64 Rust/Tauri preview retaining the React UI. Stable v1.4.4 remains
the stable download. This preview is not a claim of complete Acrobat parity.

## Automated checks

- Renderer: 113 tests passed on Windows, one optional Office test skipped;
  Linux runs the Office test with LibreOffice installed.
- Rust native core and desktop: 25 tests passed.
- Windows system WebView: 11 font, spacing, editor cleanup and centered
  save/discard/cancel checks passed.
- Windows MSI on a clean runner: installation, bundled runtime DLLs, app launch,
  normal shutdown and uninstall passed.
- Windows setup EXE: Finish dismissed in 0.21–0.42 seconds on two isolated
  runners, launched the installed app, and normal app close/uninstall passed.
- Windows OCR: invisible OCR detection, repeat inline editing and save passed.
  The saved PDF was rendered and inspected: no pure-white patch pixels in the
  edited off-white area, replacement text searchable, adjacent line preserved.
- OCR repair unit tests cover textured paper, rotations, neighboring ink,
  repeated repair and secure redaction remaining black.
- Linux system WebView: nine checks passed on Ubuntu 22.04, including render,
  search, fonts, dialogs and print preview orientation/session cleanup.
- Debian 12, Ubuntu 24.04 and Fedora 43: package installation, dependency
  resolution and installed production binary launch passed in containers/Xvfb.
  The same app code's test-enabled WebView harness passed nine checks per distro.
- Eight package/source archives have version-bound download signatures verified
  locally. Verification rejects a wrong version or changed file.

Raw automated reports are in [TEST-REPORTS.json](TEST-REPORTS.json). [BUILD-PROVENANCE.json](BUILD-PROVENANCE.json) and the
individual build-info files identify the binary build commits and workflow runs.
Later installer-only changes reuse the validated Windows executable.

## Remaining coverage

Physical trackpad pinch and multiple clicks, physical printer output and device
reconnection, stock Linux desktops/Wayland, AppImage FUSE/AppArmor behavior on
stock installations, and broader large-PDF performance still require testing.
Container launch checks do not establish real desktop input compatibility.

An earlier local debug lifecycle test completed 12 cycles without sustained
memory/handle growth. This is limited evidence, not proof of no memory leaks.
The complete native interaction suite has not passed all gesture paths.
Native WOFF2 font import remains unsupported; use supported TTF/OTF files.
Very early shutdown requests can arrive before the WebView close handler mounts;
one MSI lifecycle run needed startup-aware close retries. Immediate startup
shutdown responsiveness needs further investigation before a stable release.

Windows publisher/Authenticode signing is not configured. The release retains
signed updater metadata and checksums. Detached signature files were removed
from the download list during release cleanup; the local signature checks above
describe verification performed before publication. Updater signatures do not
suppress Windows warnings.
Prereleases are manually downloaded; the stable updater endpoint continues to
resolve the stable release rather than automatically enrolling users in previews.

The Linux portable tar.gz contains the extracted AppDir and does not require a
FUSE mount. All formats target x64; ARM64, macOS and Alpine/musl are unvalidated.
