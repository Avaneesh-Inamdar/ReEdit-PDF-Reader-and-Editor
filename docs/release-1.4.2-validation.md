# Re-Edit PDF 1.4.2 validation

Validated on 2026-10-10. The shared application runtime is built from `c51241e017e718de76f5ae2bd188af0ee85b161f`. Later changes affect Windows installer code, license packaging, test scripts and documentation only.

## Application checks

- Type checks and production builds pass. Unit tests: 76 passed on Windows with one LibreOffice test skipped; 77 passed on Ubuntu 22.04, including real Office conversion.
- The desktop suite checks 24 workflows including text selection/edit/save, undo/redo, annotations, forms, signatures, preferences, file sessions and bounded rendering of a 300-page PDF.
- The preceding regression suite checks 11 workflows including forward/reverse/middle-line selection, history removal, filled favorites, persistent preferences, responsive tools and real offline OCR saved and reopened as searchable text.
- The new regression suite checks 11 workflows: original embedded font/style detection; retaining size/color/weight/slant; actual source removal and searchable replacement saved with the original font; genuine bundled font embedding; importing a font and saving its outlines; sidebar/thumbnail controls; pinch zoom and ordinary scrolling; exact Find occurrences and all three close paths; case/whole-word/navigation; canceled queued searches; and associated document window maximization. Actual window maximization is asserted on Windows; Xvfb has no window manager.
- Four font unit tests include embedding all 32 bundled faces, text extraction with Unicode/glyph remapping, affine placement/color/outline preservation, and explicit rejection of unsupported subset glyphs.

## Package provenance and Windows installer

The four Linux binaries come from the successful Linux job in [build 38035070739](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38035070739), at `c51241e`. Windows installer and portable EXE come from successful [build 38037231905](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38037231905), at `612a329420d6ebc5508e43682f0057b3273bd1e8`. Its unit tests, 46 packaged GUI checks, silent installer/uninstaller and assisted Finish test all passed.

Earlier installer candidates intermittently crashed in System.dll with access violation `0xC0000005` at offset `0x1581`. Updating the shell notification prototype alone did not fix the crash. The final installer backports [electron-builder's bounded shell-path copy](https://github.com/electron-userland/electron-builder/commit/a356198ec7c54c7795659342bff36d9a5162cd93), replacing a fixed-length read of a shorter shell allocation and preserving registers explicitly. Prior passing candidates are not being published.

Windows validation passed both silent install/uninstall and the assisted wizard: correct installed version, separate PDF icon/registry entry, Windows default-app capabilities and installed resources; then reaching Finish, prompt dismissal, automatic application launch, a visible application window, clean application close and successful uninstall. All installation tests run on disposable GitHub-hosted Windows runners.

The same installer downloaded from that build also passed both checks on **two independent fresh runners** in [installer validation 38037569767](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38037569767). This independently verifies the exact installer being published after the buffer fix.

## Linux distributions

[Distribution validation 38035333864](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/38035333864) passed every job against the exact Linux packages:

- Debian 12: installed DEB, 51 GUI checks, desktop/MIME/default-app registration, installed executable file-URI launch/rendering, extracted AppImage executable launch/rendering and tar.gz executable launch/rendering.
- Ubuntu 24.04: installed DEB, 51 GUI checks, desktop/MIME/default-app registration and installed executable file-URI launch/rendering.
- Fedora 43: installed RPM, 51 GUI checks, desktop/MIME/default-app registration and installed executable file-URI launch/rendering.

The 51 GUI checks comprise 24 desktop, five release features, 11 preceding regressions and 11 new regressions. The five feature checks exercise the update dialog, Word export, P12 certificate signing, password clearing and genuine redaction. Installed font notices were verified in each distribution.

Linux tests use containers/Xvfb/software rendering. Physical trackpad hardware, native Wayland/GPU sessions, FUSE-mounted AppImage, physical printer output, ARM64 and macOS are not verified. These results do not establish full Acrobat Premium parity.

## Source and release integrity

`SOURCE-1.4.2.txt` records the build commits and corresponding source. GitHub's release tag supplies the application source under AGPL-3.0-only. The corresponding MuPDF 1.28.1 archive includes its exact upstream checkout and 19 submodules; the engine is unmodified. Bundled font/Fontkit license notices are installed in `resources/font-licenses`; Windows additionally includes the installer code's MIT notice.

`SHA256-1.4.2.txt` covers all six binaries, the source manifest, the corresponding MuPDF source archive and this report. Uploaded asset sizes and GitHub SHA-256 digests must match the local staged files before publishing. All binaries are unsigned x64 builds, as authorized.

See [release scope](release-1.4.2.md) for font subset, reflow, shaping and platform limitations.
