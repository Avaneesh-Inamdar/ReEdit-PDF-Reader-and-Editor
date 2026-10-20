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

## Package validation

- Windows package job: 147 frontend tests passed, one optional Office test was
  skipped; Linux passed all 148, including LibreOffice conversion. Both passed
  seven desktop and 21 native core Rust tests. A later publication-only test
  also passed, preventing experimental tags from replacing the stable feed.
- Windows WebView2: all 88 checks passed across selection, editing, fonts,
  OCR editing/recognition, fit stability, updates, input/printing and lifecycle.
- Ubuntu 22.04 WebKitGTK: all 42 desktop checks passed, including the same
  12 document/input/menu Select All checks. Linux keyboard tests dispatch DOM
  events; Windows selection tests use trusted native keyboard delivery.
- Debian 12, Ubuntu 24.04 and Fedora 43 each passed nine reader smoke checks,
  installed DEB/RPM launch/dependency checks and actual AppImage extraction-mode
  launches, in containers/Xvfb.
- Two clean Windows workers passed the exact production setup EXE lifecycle:
  assisted installation, Finish launch, document icon/default-app registration,
  runtime DLLs, normal close and uninstall. Finish dismissed in 0.231–0.245 s.
  MSI lifecycle checks also passed; MSI is not a published download.
- Each worker passed production startup close at 0, 100 and 500 ms after the
  named app window appeared. Close took approximately 0.058–0.113 s.
- All four app packages and the corresponding MuPDF source archive have
  version-bound signatures verified with the existing updater identity. Their
  hashes/signatures appear in `latest.json`; `SHA256SUMS` also covers the manifest.

The initial combined build stopped at its installer close test after all app
checks had passed. That test reused a WebView profile and a cached window probe.
Isolating profiles and explicitly targeting the live app window passed on two
clean workers with the **unchanged production packages**. The separate installer
and distro runs supply the final lifecycle evidence; the initial run is not
reported as wholly successful.

Raw checks are in [TEST-REPORTS.json](TEST-REPORTS.json). Exact application
commit, workflow runs, artifact digests and published asset hashes are in
[BUILD-PROVENANCE.json](BUILD-PROVENANCE.json). Later commits change release-feed
publication, validation scripts and documentation, not application binaries.

## Resource cleanup

Twelve Windows open/close cycles passed. JS heap samples ranged from 11.9 to
15.8 MiB and ended at 13.4 MiB. Combined app/WebView private memory after four
seconds and before shutdown ranged from 176.9 to 218.1 MiB, ending at 204.0 MiB.
Repeated edit/cancel checks kept preview fonts bounded, and print sessions were
released. These short measured scenarios did not show sustained growth; they
do not establish that every document or driver is leak-free.

## Coverage limits

Linux distribution checks run in containers/Xvfb. They do not validate physical
trackpads/printers, Wayland sessions or stock Linux desktop security/FUSE setup.
Large-document and memory checks cover the measured scenarios only. Paragraph
reflow, advanced shaping and scanned-background reconstruction remain limited;
OCR is English. Proprietary fonts are not redistributed.

Windows publisher signing is not configured. The project's existing updater
identity signs packages, independently of Windows publisher trust. AppImage
supports in-app installation; DEB/RPM updates use the package manager.
