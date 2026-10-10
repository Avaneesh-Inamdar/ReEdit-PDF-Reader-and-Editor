# Re-Edit PDF 1.4.1 validation

Validated on 2026-10-10. Runtime changes end at `c6911516df56cb6e56e7e68b12bbe2dec5adbab5`; `fc3db0fd954176320b600e304e2ba4fba1b3957c` fixes only the installer test's filename discovery. Release tag `v1.4.1` targets `fc3db0f`. Subsequent commits add validation workflows/documentation only.

## Automated checks

- Unit tests: 67 passed, 1 skipped on Windows (LibreOffice absent); 68 passed on Ubuntu 22.04, including real LibreOffice conversion. Type checks and production builds pass.
- Desktop suite: 24 checks for rendering, native text editing/selection/save, undo/redo, annotations, forms, signature placement, file sessions, preferences, printing preparation, and bounded 300-page rendering.
- Release feature suite: 5 checks for update dialog, Word export, P12 certificate signing, password clearing, and genuine redaction. Passed locally on Windows and in every Linux installation test.
- New regression suite: 11 checks for first/middle/reverse line selection, blank-space selection beside a longer neighboring line, filled stars/Starred view, persistence across reload, history removal without deleting the PDF, responsive tool grid, real offline OCR, saved text extraction, and reopening the searchable copy.

## Package provenance and Windows

Windows installer and portable EXE come from [build 38030194148](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38030194148), at `fc3db0f`. Its unit and both packaged GUI suites passed. The installer process in that build job returned `0xC0000005` during silent installation; that failure was not diagnosed or claimed fixed.

The **same installer file**, downloaded from that build's artifacts, subsequently passed on two independent fresh Windows runners:

- [Installer validation 38030586702](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38030586702)
- [Installer validation 38030650060](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38030650060)

Each verifies silent install exit 0, installed version 1.4.1, separate document.ico and its registry path, Windows default-app capabilities, app resources, and silent uninstall removing the executable and PDF registration. These are silent installer checks; the interactive Finish button was not automated. Windows publisher signing remains skipped as authorized.

## Linux

All four Linux formats come from the successful Ubuntu 22.04 job of [build 38030150460](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38030150460), at `c691151`. The obsolete Windows job in that run was cancelled after the Linux artifact completed. Linux package tests include actual DEB installation, desktop/MIME/default-app registration, 24 desktop + 5 feature + 11 regression checks, and installed executable file-URI launch/rendering.

[Distribution validation 38030369342](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38030369342) passed all jobs:

- Debian 12: installed DEB, all 40 GUI checks, default-app registration, installed executable launch, extracted AppImage executable launch, and tar.gz executable launch.
- Ubuntu 24.04: installed DEB, all 40 GUI checks, default-app registration, installed executable launch.
- Fedora 43: installed RPM, all 40 GUI checks, default-app registration, installed executable launch.

Linux validation uses containers/Xvfb/software rendering. FUSE-mounted AppImage, native Wayland/GPU sessions, physical printer output, ARM64, and macOS were not tested.

## Release integrity

Downloads are staged in `release/publish-1.4.1`. `SHA256-1.4.1.txt` covers the six binaries, source manifest, corresponding MuPDF source archive, and this report. GitHub asset SHA-256 digests are compared with local files before publishing. `SOURCE-1.4.1.txt` identifies application source and the exact unmodified MuPDF source/submodules. All binaries are unsigned x64 builds.

See [release scope](release-1.4.1.md) for text-order, English OCR, font, Office conversion, and Acrobat parity limitations.
