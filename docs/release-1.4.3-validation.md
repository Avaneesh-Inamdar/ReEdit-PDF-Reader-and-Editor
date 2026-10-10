# Re-Edit PDF 1.4.3 validation

Validated on 2026-10-10. All six packages were built from `678bddeb8c5ff02a6866aa14aeb5b0054c2ecbdb` in [build 38049989031](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38049989031). Later commits affect release documentation only.

## Application checks

- Type checks and production builds pass. Unit tests: 81 passed on Windows with one LibreOffice test skipped; 82 passed on Ubuntu 22.04, including real Office conversion.
- The desktop suite covers 24 workflows, including edit/save, undo/redo, annotations, forms, signatures, preferences, sessions and bounded rendering of a 300-page PDF.
- Eleven preceding selection/OCR checks cover forward/reverse/middle selections, history removal, filled favorites, persistence, responsive tools and real offline OCR saved and reopened as searchable text.
- Eleven font/navigation/Find checks verify embedded outlines, fractional size/color/weight/slant, actual source removal, bundled/imported fonts, sidebar controls, pinch events, ordinary scrolling, exact Find matches and close paths, filters/navigation, canceled searches and associated PDF window maximization.
- Eleven new checks verify all 41 fragments in a word-major/reverse-painted fixture; forward, reverse and middle selections over 13–18 lines without jumping blocks; native word double-click; repeated editing outside the original bounds; source removal while preserving a colored background in both preview and saved output; selecting and copying edited text as Unicode; actual WOFF2 import through IPC and searchable font embedding; multiline placed-text selection and double-click editing; selection inside an unfilled rectangle; double-resolution pages/thumbnails with no size slider; and detection/editing of saved FreeText after reopening without duplicating the old annotation.
- Font unit tests also embed all 32 bundled faces, check Unicode mapping, preserve affine placement/color/outlines and reject unavailable subset glyphs explicitly.

## Windows installer

The Windows build passed 57 packaged GUI checks, silent install/uninstall and the assisted Finish launch test. Validation checks the installed version, separate PDF document icon, default-app registry capabilities and installed resources. Finish dismisses the wizard, launches a visible application window and permits a clean close/uninstall. Installation tests use disposable GitHub-hosted runners.

The exact downloaded installer also passed silent install/uninstall and assisted Finish launch on **two independent fresh runners** in [run 38050364374](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38050364374).

The installer retains the bounded shell-path copy fix documented in the preceding release.

## Linux distributions

[Distribution validation 38050210025](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38050210025) passed against the exact packages:

- Debian 12: installed DEB, 62 GUI checks, desktop/MIME/default-app registration, installed file-URI launch/rendering, extracted AppImage executable launch/rendering and tar.gz executable launch/rendering.
- Ubuntu 24.04: installed DEB, 62 GUI checks, desktop/MIME/default-app registration and installed file-URI launch/rendering.
- Fedora 43: installed RPM, 62 GUI checks, desktop/MIME/default-app registration and installed file-URI launch/rendering.
- Ubuntu 22.04 in the build job: installed DEB and the same 62 GUI checks, default-app registration and installed file-URI launch/rendering.

The 62 GUI checks comprise 24 desktop, five release features and three sets of 11 regressions. Release features exercise the update dialog, Word export, P12 signing, password clearing and genuine redaction. Installed font license notices are checked in each distribution.

Linux validation uses containers/Xvfb/software rendering. Physical trackpads, native Wayland/GPU sessions, FUSE-mounted AppImage, printer hardware, ARM64 and macOS are not verified.

## Source and release integrity

`SOURCE-1.4.3.txt` records the build commit and corresponding source. GitHub's release tag supplies application source under AGPL-3.0-only. The unmodified MuPDF 1.28.1 source archive includes its exact upstream checkout and all 19 submodules. Bundled font and Fontkit notices are installed; dependency notices include the WOFF2 decoder's MIT license. Windows additionally installs the installer code's MIT notice.

`SHA256-1.4.3.txt` covers all six binaries, the source manifest, MuPDF source archive and this report. Asset sizes and GitHub SHA-256 digests are checked against the local staged files before publishing. All binaries are unsigned x64 builds, as authorized.

See [release scope](release-1.4.3.md) for OCR, font subset, shaping and platform limitations. The attached screenshot was not accompanied by its PDF; tests reproduce white-mask artifacts on native text over a colored background, rather than validating that specific document.
