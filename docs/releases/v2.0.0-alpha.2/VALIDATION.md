# v2.0.0-alpha.2 validation

This native preview retains the React workspace in Tauri with a Rust backend.
It does not claim full Acrobat compatibility. The stable Electron release stays
on its separate update channel.

## Scope

- Font fallback, connected-line text editing, repeated-edit cleanup, OCR faint
  text and sparse footer recognition, Convert menu styling, existing annotation
  and field removal, form undo, permissions and flattened-mark removal.
- Certificate Fit Width stability, mixed page sizes/crops/rotation and stable
  zoom during continuous scrolling.
- Startup update notifications, semantic prerelease comparisons, signature
  verification and rejection of tampered downloads. No test installs an update
  on the development machine.

## Validation status

Local frontend and native checks and isolated Windows WebView tests are being
rerun for this release. Windows installer and Linux distribution results will
be recorded here before publication. See [implementation notes](../../EDITOR-FIXES-2026-10-17.md)
for targeted test coverage and known limitations.

## Limits

Physical printers, physical trackpads, stock Linux desktop/Wayland sessions,
complex multilingual layouts and broad large-document workloads still need
real-device coverage. Container/Xvfb results are not stock desktop validation.
The scanned-mark eraser estimates paper pixels; it cannot recover pixels hidden
by an original mark. Review the result. Paragraph reflow, advanced shaping and
exact reconstruction on complex backgrounds remain limited.

Windows publisher signing is not configured. Updater signatures use the existing
project identity and protect package authenticity independently of Windows trust.
Linux automatic installation is intended for AppImage; install DEB/RPM updates
with the matching package manager.
