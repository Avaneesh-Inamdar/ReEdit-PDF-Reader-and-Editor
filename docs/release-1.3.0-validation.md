# Re-Edit PDF 1.3.0 validation

Validated locally on 2026-10-09. Packages and reports are in `release/`; they are not published.

## Results

- TypeScript checks pass for main/preload and renderer.
- 53 automated tests pass on Windows and Linux, including PDF output, forms, signatures, undo, page operations, text baselines, multiline replacements, text caching and render concurrency.
- 24 Electron GUI workflow checks pass against the packaged Windows app and each installed Linux app's `app.asar`: Debian 12 DEB, Ubuntu 24.04 DEB, Fedora 43 RPM, and extracted AppImage on Debian 12. Reports contain no renderer errors.
- DEB and RPM were installed with their distribution package managers. Desktop entries validate, advertise `application/pdf`, and use `%F`. The Preferences action sets the PDF default through `xdg-mime`, and the resulting default was queried and verified.
- The actual installed Debian executable and extracted AppImage executable separately opened and rendered a local PDF supplied as a file URI. This check uses the real executable and renderer, independently of the workflow harness.
- Windows NSIS and portable packages were built. Windows packaged workflows load the built `app.asar` using the matching Electron runtime; a clean Windows installation/uninstallation was not performed.

The selection check sends real mouse-down, mouse-move and mouse-up events over text, confirms the exact selected characters, applies Edit Text, and checks that the saved PDF contains the replacement. Large replacement text enlarges the dialog. A separate PDF output test checks both selected line masks and replacement line spacing.

## Synthetic large-document check

The fixture has 300 text pages. Time measures opening until page-one selectable text is available, not a general performance benchmark or an image-heavy PDF benchmark.

| Environment | Open time | Initial page canvases |
| --- | ---: | ---: |
| Windows | 155 ms | 2 |
| Debian 12 | 310 ms | 2 |
| Ubuntu 24.04 | 262 ms | 2 |
| Fedora 43 | 252 ms | 2 |
| Extracted AppImage | 258 ms | 2 |

Jumping to page 300 renders that page, updates the page counter, and keeps fewer than ten page canvases mounted. Backing canvas resolution is at least 1.49 times its CSS size on the tested display; the renderer uses a 12-megapixel allocation cap.

## Test environment and limits

Linux tests ran in official Debian, Ubuntu and Fedora container userspaces inside an x64 Alpine Linux VM, using Xvfb and software rendering. The harness uses Electron 33.4.11 to load the installed application code. Root test commands explicitly pass `--no-sandbox`; the application's normal launch command was not changed. Containers lack a desktop system bus and hardware GPU, so their native Chromium logs include related warnings.

This does not verify every distribution, Wayland, physical GPU/display combinations, native musl/Alpine execution, macOS, or ARM64. AppImage was tested after extraction; FUSE mounting was not tested.

These are unsigned x64 builds. Text edits remain visual replacements: underlying source text is retained, source fonts may be approximated, and paragraph reflow is not implemented. Secure redaction, Office conversion and certificate signing are not implemented. This release does not claim Acrobat Premium feature parity.

## Local evidence

- `release/smoke-windows/result.json`
- `release/linux-validation/linux-tests/<environment>/result.json`
- `release/linux-validation/linux-tests/<environment>/performance.json`
- `release/linux-validation/linux-launch.json`
- `release/linux-validation/appimage-launch.json`
- `release/SHA256-1.3.0.txt`
- `release/artifacts-1.3.0.json`

Rebuild with the manual `.github/workflows/build-desktop.yml` workflow or the documented npm packaging commands. The Linux validation scripts are `scripts/test-linux-package.sh` and `scripts/test-linux-launch.cjs`; they require an isolated Linux environment, the installed package, matching development Electron dependencies, Xvfb and desktop-file utilities.
