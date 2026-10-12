# Re-Edit PDF 1.4.4 validation

Validated on October 12, 2026. All six packages were built from `72f94612fb7cb35481b5d3d85d923ac978c73134`. Subsequent release-documentation commits do not change application code or packages.

## Reproducible runs

- [Windows and Linux package build](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38222480144): passed on Windows and Ubuntu 22.04.
- [Exact Linux distribution packages](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38223216671): passed on Debian 12, Ubuntu 24.04 and Fedora 43.
- [Exact Windows installer, two fresh runners](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38223220131): passed both attempts.

Windows runs the core desktop suite and 1.4.1–1.4.4 regression suites: 66 workflow checks. Each Linux environment also runs five release-feature checks: 71 total. Unit tests pass on both build runners; Linux includes real LibreOffice conversion, while Windows skips that optional integration.

## Installer and distribution checks

The Windows installer installs version 1.4.4, includes the separate PDF document icon and font notices, registers Windows default-app capabilities, and uninstalls the app and its registrations. In two additional fresh environments, the assisted wizard reaches Finish, dismisses in approximately 2.15 and 2.17 seconds, launches the installed app and displays its window. The app then closes and uninstalls successfully.

DEB and RPM packages install on the listed distributions. Checks cover font notices, valid desktop entries, PDF MIME registration, the default PDF application, file-URI opening and rendered PDF content. Debian 12 additionally launches the extracted AppImage binary and extracted tar.gz binary. Containers do not verify FUSE mounting or the AppRun wrapper.

## Document workflows

- Forward, reverse and middle selection across 13–18 fragmented lines follows reading order. Real double-click selects a native word; placed text and unfilled shapes support selection.
- Existing font, fractional size, color, weight and slant are detected and retained in supported edits. Replacement tails remain editable. WOFF2 imports preserve real outlines; all 48 bundled WOFF/full OTF assets produce searchable text and actual rendered ink. WOFF reconstruction validates the whole-font checksum.
- Missing subset glyphs are rejected before the edit preview. Choosing full Source Sans 3 saves searchable Greek/Cyrillic text. Repeated font choices reuse preview faces. Installed font enumeration and restricted byte access work on Windows and Linux.
- Native edits remove source text without white masking rectangles and preserve unrelated text and backgrounds. OCR edits remove target image pixels; direct pixel checks verify that neighboring image content survives.
- Accurate offline English OCR recognizes a faint mixed image/text page without duplicating its digital heading. Overwrite writes the searchable result to the current file. Clicking an OCR word edits a compatible line, preserving the neighboring line.
- Find searches replacements, excludes removed source text and clears highlights on close, Escape and Ctrl+F. Tests cover pending-search cancellation, F3, case/whole-word options, whitespace, ligatures and geometric reading order.
- The custom print dialog forwards copies, grayscale, the selected printer and silent printing. Printer callbacks are simulated; physical printers are not validated.
- Synthetic precision-trackpad pinch zooms the PDF, ordinary scrolling remains native, and real Alt+F4 input closes the application window. Physical trackpad hardware is not validated.

## Resource cleanup and memory

Fixes cover PDF loading-task cancellation, document-owned text-style caches, reusable/pruned preview font faces, OCR worker termination, lean recognition caches, UI timers and resize listeners. Model-switch and termination tests verify OCR progress-observer cleanup.

The 1.4.4 desktop test warms three cycles, then repeats 12 open/Find/print-preview/close cycles. Chromium garbage collection runs before measurement. The table records renderer JavaScript heap bytes.

| Environment  |     Before |      After |   Change |
| ------------ | ---------: | ---------: | -------: |
| Windows CI   | 12,327,736 | 12,599,936 | +272,200 |
| Ubuntu 22.04 | 12,198,756 | 12,410,636 | +211,880 |
| Debian 12    | 12,182,496 | 12,405,192 | +222,696 |
| Fedora 43    | 12,181,484 | 12,403,072 | +221,588 |
| Ubuntu 24.04 | 12,181,420 | 12,410,532 | +229,112 |

Each CI environment retains three documents, 48 declared font faces, 198 listeners and four processes before and after. Backing-storage size stays unchanged. These results show bounded behavior in the measured workflows; they do not establish that every PDF, OCR job, large print job or driver is leak-free.

## Visual review and updates

Local Electron captures cover Home, Tools, the document workspace, OCR, editing, forms, signatures, redaction, security, preferences and certificate/update dialogs in light/dark themes. Checks verify the 42px workspace header, 48px toolbar, pane placement, shared primary-button color and toolbar fit at 950px. The README uses a captured workspace image.

Help → Check for Updates reads published stable GitHub releases. Version comparison is unit-tested. The live feed is checked after publication because draft releases are excluded from that endpoint.

## Limits

All packages are unsigned x64 builds. Proprietary Adobe Fonts are not redistributed. Linux GUI checks use containers/Xvfb. Physical printers, trackpads, certificate tokens, native Wayland/GPU sessions, FUSE mounting, ARM64 and macOS are not verified. OCR is English-only; complex typography, scan-background reconstruction and full Acrobat Premium compatibility remain limited.
