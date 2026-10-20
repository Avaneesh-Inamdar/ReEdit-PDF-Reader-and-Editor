# v2.0.0 validation

This stable release uses Tauri/Rust and the existing React workspace. It does
not claim complete Adobe Acrobat compatibility.

## Changes and local checks

- Ctrl+A and Edit → Select All select PDF text only. Single-page mode selects
  the current page; continuous mode copies every page, including pages outside
  the render window. Pending edits replace the original Unicode in copied text.
- Find and inline editors retain their native Select All behavior. Modal dialogs
  block background document shortcuts. Escape, input focus, tab/document changes
  and closing clear document selection and cancel unfinished extraction.
- Selection teardown releases pointer capture. Early window-close requests no
  longer wait for a renderer listener that has not registered yet; once ready,
  the normal save/discard/cancel flow still applies.
- Renderer build/typecheck and 147 frontend tests passed locally, with one
  optional LibreOffice test skipped. The existing 21 Rust core tests passed.
- Actual Windows WebView checks passed: 12 new selection checks over a 32-page
  fixture, 28 input/print/save/update interaction checks and eight editing checks.
  The selection checks use trusted keyboard input on Windows.

Package, installer, resource cleanup and distribution results are recorded
below after the release build completes. Publication requires those checks to
pass; local debug checks alone are not package validation.

## Coverage limits

Linux distribution checks run in containers/Xvfb. They do not validate physical
trackpads/printers, Wayland sessions or stock Linux desktop security/FUSE setup.
Large-document and memory checks cover the measured scenarios only. Paragraph
reflow, advanced shaping and scanned-background reconstruction remain limited;
OCR is English. Proprietary fonts are not redistributed.

Windows publisher signing is not configured. The project's existing updater
identity signs packages, independently of Windows publisher trust. AppImage
supports in-app installation; DEB/RPM updates use the package manager.
