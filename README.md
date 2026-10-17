<p align="center">
  <img src="docs/images/brand.svg" width="76" alt="Re-Edit PDF">
</p>
<h1 align="center">Re-Edit PDF</h1>
<p align="center">Read, edit, annotate and recognize text in PDFs on Windows and Linux.</p>
<p align="center">
  <a href="https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor?color=1473e6"></a>
  <a href="https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases"><img alt="Total release downloads" src="https://img.shields.io/github/downloads/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/total?label=release%20downloads&color=1473e6"></a>
  <a href="https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/workflows/build-desktop.yml"><img alt="Desktop build" src="https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/workflows/build-desktop.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-343434"></a>
</p>

<p align="center">
  <a href="#download"><img alt="Download" src="https://img.shields.io/badge/Download-1473e6?style=for-the-badge&logo=download&logoColor=white"></a>
  <a href="#features"><img alt="Features" src="https://img.shields.io/badge/Features-24292f?style=for-the-badge"></a>
  <a href="#getting-started"><img alt="Getting started" src="https://img.shields.io/badge/Getting_started-24292f?style=for-the-badge"></a>
  <a href="#development"><img alt="Build from source" src="https://img.shields.io/badge/Build_from_source-24292f?style=for-the-badge&logo=github&logoColor=white"></a>
</p>

![Re-Edit PDF document workspace](docs/images/workspace.png)

## Download

Download the [Rust/Tauri preview, v2.0.0-alpha.2](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/tag/v2.0.0-alpha.2). It uses a Rust desktop backend and the existing React workspace in the system webview, without the Electron runtime.

The [1.4.4 Electron release](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/latest) remains the stable download while native desktop validation continues. Starting with alpha.2, native previews check their own update channel shortly after launch and show an update notification. **Help → Check for Updates** also offers verified download and installation when supported. The Electron stable channel remains separate; older previews need a manual upgrade.

The download badge counts release-asset downloads across all versions. Repeat downloads and supporting files count separately; it is not a count of unique users.

| Platform | Package | Installation |
| --- | --- | --- |
| Windows x64 | Setup EXE | Run the installer; Finish can launch the app. |
| Debian / Ubuntu x64 | DEB | `sudo apt install ./Re-Edit-PDF-*.deb` |
| Fedora / RPM x64 | RPM | `sudo dnf install ./Re-Edit-PDF-*.rpm` |
| Linux x64 | AppImage | Make executable, then run. Use `--appimage-extract-and-run` if FUSE is unavailable. |

The setup EXE installs WebView2 when needed. Windows publisher signing is not configured; Windows may show a publisher warning. Updater signatures authenticate downloads; they are separate from Windows publisher signing.

Release assets contain these four app packages, `SHA256SUMS`, the updater manifest (`latest.json`, with embedded package signatures), and the corresponding native MuPDF source archive. Build logs, screenshots and test reports stay in Actions or [release documentation](docs/releases/v2.0.0-alpha.2/VALIDATION.md), rather than appearing as extra downloads.

The manifest's `downloads` entries include the hashes and version-bound signatures for all four packages and the MuPDF source archive. The app uses its configured public key to verify supported automatic updates.

Native previews check the [preview update feed](updates/native-preview.json) without uploading PDF content. Updates require confirmation before downloading and installing; unsaved documents must be resolved first. AppImage builds support in-app updating. DEB/RPM users should download and install the matching package through their package manager.

The **Publish native update feed** workflow refreshes that feed when a native GitHub release is published or edited. It checks release versions and asset URLs, requires matching signature-version metadata, and keeps older release edits from replacing a newer feed. The app verifies the downloaded package's cryptographic signature before installation.

Linux native packages require a glibc desktop environment and GTK/WebKitGTK support. Alpine/musl, ARM64 and macOS are not validated.

The installer registers PDF **Open With** support and a separate document icon. Choose Re-Edit PDF in Windows **Settings → Apps → Default apps**. Linux Preferences can set the PDF default through `xdg-mime`.

## Features

- **Document workspace:** tabs, thumbnails, bookmarks, attachments, page navigation, fit/zoom controls, light/dark themes and a compact tool layout.
- **Text editing:** select text and use Edit, Ctrl+E or the context menu. Supported embedded fonts retain size, color and transforms. Fragmented text is grouped into compatible lines. Editing a selected word keeps its connected line together so following words move with it; replacements can be edited again.
- **Fonts:** the native preview includes 68 offline faces in seventeen families, including Adobe's Source Sans 3, Source Serif 4 and Source Code Pro. Full Source Sans/Serif fonts supplement the bundled subsets. Open-source alternatives include Arimo (Arial), Tinos (Times New Roman), Cousine (Courier New), Carlito (Calibri) and Caladea (Cambria). Installed TTF/OTF fonts and supported font imports are available. Unavailable or incomplete original fonts are matched to installed or bundled alternatives, with a substitution notice. Missing glyphs are checked before applying or saving edits.
- **Annotations:** highlight, underline, strikeout, text, shapes, drawing, images and signatures, with selection, removal and undo/redo. Existing annotation/field objects can be removed; a region eraser also handles flattened marks, with limited background reconstruction for scans.
- **OCR:** offline English recognition with accurate and fast models, automatic/column/block layouts, page ranges, searchable output and explicit save-copy/overwrite actions. Accurate automatic recognition uses adaptive thresholding and a second pass for sparse text.
- **Find:** result list, matching text excerpts, case/whole-word filters, F3 navigation and searchable edited/placed text.
- **Printing:** application print dialog with printer selection, copies, grayscale, duplex, ranges, odd/even pages, reverse order, paper size, scaling and preview.
- **Page tools:** combine, reorder, rotate, extract and delete pages.
- **Forms and security:** supported AcroForm fields, P12 certificate signing, genuine content redaction, password clearing and document permission details. Printing, copying, annotations, forms and assembly permissions are shown separately; this does not validate certificate trust.
- **Conversion:** editable Word text export and Office-to-PDF import through an optional LibreOffice installation.
- **Desktop integration:** native window controls, recent-file favorites/removal, file associations and Help → Check for Updates.

This project is independent of Adobe. It does not claim complete Acrobat Premium compatibility.

## Getting started

### Changes in alpha.2

- Stable Fit Width sizing for landscape certificates and mixed-size PDFs; scrolling no longer repeatedly changes zoom.
- Automatic font matching and connected-line editing, improved faint/sparse OCR text detection, and an opaque Convert menu.
- Existing annotation/signature-field removal, a region eraser for flattened marks, and clearer document permissions.
- Startup update notifications and a dedicated signed native-preview update feed.
- Tool and dialog buttons wrap long labels instead of spilling text outside their borders.

### Native desktop integration

- Native Open dialogs and the previous React workspace in a system webview.
- Inline text editing, corrected replacement spacing, additional open-source font alternatives, and centered save/discard/cancel dialogs.
- OCR text replacement reconstructs the surrounding paper to avoid white patches; saved replacements remain searchable and can be edited again.
- The Windows setup launches the app from Finish, registers a distinct PDF document icon, and appears in Windows Default Apps.
- Installer, WebView regression and Linux package checks are documented in the [validation report](docs/releases/v2.0.0-alpha.2/VALIDATION.md). Container/Xvfb checks do not replace stock desktop testing.
- Alpha.2 validation passed 142 local frontend tests, 27 native Rust tests, 76 Windows WebView checks, Windows installer lifecycle checks, and Debian/Ubuntu/Fedora package launches. Preview font and open/close cleanup checks passed in the measured scenarios.

### Basic workflow

1. Open a PDF from Home, the file menu or the operating system.
2. Choose **Edit** to edit existing text, or select words and press **Ctrl+E**.
3. Use **All tools** for annotations, forms, OCR and document operations.
4. Save with **Ctrl+S**. OCR offers separate copy and overwrite buttons.
5. For additional fonts, choose an installed face or import a font in Format.

| Shortcut                       | Action                                 |
| ------------------------------ | -------------------------------------- |
| Ctrl+O / Ctrl+S / Ctrl+Shift+S | Open / Save / Save as                  |
| Ctrl+F / F3 / Shift+F3         | Find / Next match / Previous match     |
| Ctrl+E                         | Edit selected text                     |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Undo / Redo                            |
| Ctrl+P                         | Print dialog                           |
| Ctrl+Tab / Ctrl+Shift+Tab      | Next / Previous document tab           |
| Ctrl+W / Ctrl+F4               | Close document                         |
| Alt+F4 / Ctrl+Q                | Close application                      |
| Ctrl+0 / Ctrl+1 / Ctrl+2       | Fit page / Actual size / Fit width     |
| Ctrl++ / Ctrl+-                | Zoom in / out                          |
| F4 / Shift+F4                  | Navigation / Tool pane                 |
| H / V / hold Space             | Hand / Text selection / Temporary hand |
| F11 / Ctrl+L                   | Full screen                            |

Precision-trackpad pinch uses PDF zoom; ordinary two-finger scrolling stays native. Hardware behavior depends on the OS and device driver.

## Development

Native development requires Rust, Node.js 22, a C/C++ toolchain and libclang,
plus the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for
your platform. LibreOffice is optional for Office import.

```sh
git clone https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor.git
cd ReEdit-PDF-Reader-and-Editor
npm ci --ignore-scripts
npm run dev:desktop
```

The repository includes offline OCR models, PDF assets, fonts and license notices. `npm run setup:ocr` can restore OCR assets when needed.

### Checks

```sh
npm run typecheck:web
npx vitest run
npm run build:ui
cargo test --locked -p re-edit-pdf-desktop -p re-edit-pdf-native --no-default-features
```

The native WebView regression scripts use isolated profiles and generated PDFs.
Distribution and installer workflows run on disposable environments; they do
not install or uninstall the app on the development machine. The older
Electron regression scripts remain available for comparisons.

### Packaging

The **Build desktop packages** workflow builds native Windows EXE/MSI/portable
ZIP and Linux DEB/RPM/AppImage/tar.gz packages, stages the Windows C++ runtime,
and runs installer and desktop checks. **Validate Linux distributions** checks
the selected packages on Debian, Ubuntu and Fedora. Outputs are retained as
workflow artifacts; publication and signing are separate steps.

Build Linux packages on Linux. See [native development](src-tauri/README.md)
and [.github/workflows](.github/workflows) for prerequisites and commands.
The `package:win` and `build:linux` npm scripts still target the legacy
Electron reference; use the native workflow for this preview.

## Limitations

The [Tauri/Rust preview](src-tauri/README.md) retains this app's React UI in the
system webview. Physical printer/trackpad, stock desktop/Wayland and broader
large-document checks remain outstanding. Native WOFF2 import is not supported
yet. Very early close requests can arrive before the WebView close handler is ready; immediate startup shutdown responsiveness still needs investigation. [Release validation](docs/releases/v2.0.0-alpha.2/VALIDATION.md) and [stable promotion gates](native/LOCAL-VALIDATION.md) are
documented separately. Container/Xvfb results are not stock-desktop validation.

- Text editing currently reflows a compatible connected line, not arbitrary paragraphs across text boxes or pages.
- Scanned text has estimated typography. Replacing recognized text removes image pixels in the edited region; background reconstruction and automatic paragraph reflow are limited.
- OCR currently recognizes English. Accuracy depends on scan quality and layout; review the output.
- A subset font cannot supply omitted glyphs. Use a full installed/imported font when needed. Proprietary Adobe Fonts are not redistributed.
- Installed-font discovery covers supported TTF/OTF files. Font collections, advanced shaping and mixed-direction/vertical editing remain limited.
- Unsupported XFA forms and complex Office layout conversion do not have full parity.
- Printer hardware and driver behavior, physical trackpads, native Wayland/GPU sessions, FUSE mounting and physical certificate tokens need testing in their real environments.
- Memory checks describe measured scenarios and resource cleanup; they cannot establish that every document or driver is leak-free.

Report reproducible issues with the app version, OS, steps and a sample PDF you are permitted to share. Remove private information before attaching documents.

## License and acknowledgments

Created by **Avaneesh Inamdar**. Released under [AGPL-3.0-only](LICENSE).

The native preview uses Rust, Tauri, React, TypeScript, PDF.js, pdf-lib, MuPDF and Tesseract.js. The previous Electron app is retained as a development reference. Icons use Lucide; the application and PDF document marks are custom vectors.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for software, font and model notices. The preview release includes the application source tag, corresponding MuPDF source archive and checksums. [Build provenance and validation reports](docs/releases/v2.0.0-alpha.2/VALIDATION.md) are available in the repository.
