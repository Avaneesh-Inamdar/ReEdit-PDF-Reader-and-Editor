# Re-Edit PDF

A desktop PDF reader and editor for Windows and Linux. Built with Electron, React, TypeScript, pdf.js, pdf-lib, and offline Tesseract.js OCR.

Developed by **Avaneesh Inamdar**.

## Download

Build outputs are written to `release/`. This local build is not automatically published to GitHub:

- **Setup Installer (`.exe`)**: `Re-Edit PDF-Setup-1.3.0.exe` — Windows setup wizard with desktop shortcut, Start Menu shortcut, uninstaller, and PDF Open With registration (Windows controls the default PDF app).
- **Windows portable**: `Re-Edit PDF-1.3.0-portable.exe`.
- **Debian/Ubuntu**: `re-edit-pdf-1.4.0-amd64.deb`.
- **Fedora/RPM**: `re-edit-pdf-1.4.0-x86_64.rpm`.
- **Linux portable**: `re-edit-pdf-1.3.0-x86_64.AppImage` and `re-edit-pdf-1.3.0-x64.tar.gz`.

These packages are x64. They are unsigned local builds. Linux packages need a glibc desktop environment; native Alpine/musl and ARM64 are not verified.

## Version 1.3.0 selection and performance update

- Uses pdf.js's native text layer with font metrics and width transforms, replacing guessed selectable spans.
- Select PDF text, then use **Edit Text** on the floating toolbar, **Ctrl+E**, the context menu, or **Edit selected text** in the Format panel. Partial selections and multiple lines retain source positions and line spacing.
- The text dialog grows in height and width with its content; Ctrl+Enter applies changes. Text-input undo stays in the input.
- Page canvases and thumbnails render near the viewport. Canvas work is limited to three concurrent jobs, and parsed text uses a bounded cache. Search updates do not repaint PDF canvases, and superseded searches stop early.
- Corrects high-DPI rendering using the PDF renderer's output transform, with a 12-megapixel cap per canvas. Bundles standard PDF fonts and CMaps locally.
- Document analysis samples at most three pages, shares the existing PDF worker, and skips pdf-lib form parsing for documents without fields.
- Uses consistent Lucide icons throughout the toolbar, panels, tabs, and navigation. The logo is a manually drawn vector.
- Linux DEB/RPM packages register `application/pdf`, a desktop launcher, and an icon. Preferences can explicitly set the PDF default through `xdg-mime`. File paths and local file URIs open through the installed executable.

## Desktop integration

- Renamed to **Re-Edit PDF**, with a manually drawn vector mark and matching Windows/installer icons. Emoji and symbol-only tool icons were replaced with vector icons.
- Native Windows title bar provides system minimize, maximize, close, snap and theme behavior.
- Preferences now contain effective controls, persist across restarts, and open from both native and in-app menus. Theme, display, zoom, units, toolbar, startup and full-screen preferences are connected to application behavior.
- Home, Tools and sidebar shortcuts open the selected tool directly. Repeated tool selection leaves it open; cancelling the file picker leaves the current view intact. Misleading samples and duplicate Fit Visible controls were removed.
- Typed, drawn and uploaded signatures preview on the page, can be moved/resized, and save as PDF image content. Saved signatures can be reused; check/cross/dot/line marks use drawn pixels rather than unsupported font glyphs. These are visual signatures, not certificate signatures.
- Form fields use text inputs, checkboxes and choice controls; existing dropdown/radio/list selections round-trip correctly. Read-only fields stay read-only and invalid choices report a save error.
- Combine Files supports selecting, arranging and saving multiple PDFs. It copies pages in the requested order; document-level bookmarks and form structures are not merged.
- Embedded PDF attachments are listed and can be saved. Security information no longer claims unverified permissions or advertises an encryption tool.
- Text annotations save a font-aware appearance stream, including bold/italic. Existing indirect annotation arrays and form widgets are preserved.
- Assisted setup supports destination selection, shortcuts and uninstall. Finish closes the installer without auto-launching the app. Association-change notifications are asynchronous.
- Setup registers PDF Open With entries and Windows Default apps capabilities; it leaves the user's current default intact. In Preferences, use **Open Windows Default apps**, then select Re-Edit PDF for `.pdf`.

### How to edit existing text

Select text and choose **Edit Text**, or choose **Edit PDF** and click a text run. Enter the replacement and apply it. Use the Format panel to adjust font, size or color, then **Ctrl+S**. Scanned pages need OCR before they have selectable text. Text edits are visual replacements with a white background; original selected text is removed when saving and the editor does not reflow paragraphs.

### Verification

- Production build and TypeScript checks passed.
- 49 automated tests passed, including original-text placement, form values, signature image export, preservation of existing form widgets, ordered combining, document sessions and undo/redo.
- Source and packaged Electron smoke checks verify text editing/save/reopen, external PDF drop handling, internal drag suppression, hand panning, tab isolation, repeated saves, print preparation, signature placement/movement, form input/checkbox save, Preferences routing, persisted theme and PDF combining order.
- Physical printing and installation/uninstallation/Finish timing on a clean Windows machine require manual verification. The installer is unsigned.

## Version 1.1.1 interaction fixes

- Choose **Edit PDF**, then click existing text directly on the page. Replacements use the PDF text's baseline, size, rotation and bounding box; the previous guessed-position list is removed.
- Existing-text replacements support undo/redo, tab switching, Save, and reopening. They are visual white-background replacements with standard fonts: original selected text is removed when saving, and paragraph reflow, vertical text, exact font matching, and colored-background reconstruction are not supported.
- Internal document and thumbnail dragging cannot trigger the external file-drop overlay. Hand mode (`H`, or hold Space) suppresses native dragging and text selection while panning.
- Regression smoke checks now cover existing text edits, save/reopen, internal drag cancellation and actual hand panning.

## Version 1.1.0 reliability fixes

- Independent document sessions preserve annotations, form values, zoom, and undo history across tabs.
- Save uses the selected document's path. Save As updates its tab name and destination. Repeated saves do not duplicate annotations.
- Native Save / Don't Save / Cancel dialogs protect unsaved changes on tab and window close.
- Text, note, and custom zoom entry use in-app dialogs supported by Electron.
- Print prepares PDF pages with current edits before opening the system print dialog; it does not print the application chrome.
- Fit modes respond to window resizing; page rotation includes the rotation stored in the PDF.
- PDF files opened through Windows are passed to the running application.
- Assisted Windows setup includes installation directory selection, shortcuts, and an uninstaller.

### Current limits

This is not a complete Acrobat replacement. Text edits use overlays rather than font-aware paragraph reflow. MuPDF removes edited text and marked redaction content during saving. Certificate signing supports one P12/PFX signature without timestamping or incremental co-signing. Word export creates editable text paragraphs without images or exact page layout. Office-to-PDF conversion requires a separately installed LibreOffice. PDF-to-Excel/PowerPoint conversion, form creation, XFA editing, and collaboration are not implemented. Printing rasterizes pages at up to 144 DPI. The installer is unsigned; a publisher certificate is needed for a signed distribution. Physical printer output and installation/uninstallation on a clean Windows machine still need manual verification.

## Features

### Viewing & Navigation
- High-resolution rendering via `pdf.js` with continuous and single-page display modes.
- Zoom from 50% to 500%, Fit Width, and Fit Page options.
- Thumbnail sidebar with page previews and click-to-jump navigation.
- Hand pan tool (click-drag or hold `Space` to pan).
- In-document search (`Ctrl+F`) with match navigation and keyword highlighting.
- Metadata and document properties viewer.

### Text Selection Actions
- Selecting text in the document opens a quick action bar with:
  - **Highlight**, **Underline**, and **Strikethrough**
  - **Text Color**: change selected text color non-destructively
  - **Copy** and a visual mask (underlying text is retained)

### Annotations & Markup
- Freehand pen and highlighter with adjustable color palette, stroke width, and opacity.
- Geometric shapes: Rectangle, Circle, Line, and Arrow.
- Text boxes and sticky notes.
- Annotations can be saved as standard PDF annotation objects (editable across PDF viewers) or burned in as flattened exports.

### Page Management & Undo
- Organize Pages modal: reorder pages by dragging, rotate 90° clockwise/counter-clockwise, delete pages, or insert blank pages.
- Full multi-step Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) that coordinates between page restructuring and annotation changes.

### Local OCR (Scan Recognition)
- Bundled offline Tesseract.js engine (no network requests or cloud services).
- Automatic detection for scanned documents based on character density.
- Preprocessing filter (grayscale + contrast stretching + thresholding) at 300 DPI for cleaner character recognition.
- Flexible scope: run OCR on the current page, all pages, or a custom page range (`1-3, 5`).
- Option to stop OCR processing at any time without losing completed pages.
- Prompts to save the resulting searchable PDF as `<filename>_ocr.pdf`.
- Convert OCR results into editable text boxes.

### Forms & Editing
- AcroForm detection and filling for text fields, checkboxes, dropdowns, radio groups and option lists.
- Visible text replacement using a precise white-background overlay. It preserves unrelated image objects, but cannot reconstruct colored backgrounds or remove the original text.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + O` | Open PDF |
| `Ctrl + S` | Save |
| `Ctrl + Shift + S` | Save As |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + F` | Search in Document |
| `Ctrl + 0` | Fit Page |
| `Ctrl + 1` | Actual Size (100%) |
| `Ctrl + 2` | Fit Width |
| `Ctrl + +` / `Ctrl + -` | Zoom In / Zoom Out |
| `Space` (hold) | Temporary Hand Pan |
| `Delete` | Remove selected annotation |
| `Ctrl + D` | Document Properties |
| `Ctrl + W` | Close Document |

## Building from Source

### Requirements
- Node.js >= 22
- npm

### Setup
```bash
git clone https://github.com/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor.git
cd Readit-Pdf-Reader-and-Editor
npm install
```

### Development
```bash
npm run dev
```

### Running Tests
```bash
npm test

# Built Electron smoke test: opens fixtures, edits, saves, switches tabs, prepares print
npm run build
npx electron scripts/smoke-electron.cjs
```

### Packaging Windows Binaries
```bash
# Build NSIS Setup Installer (.exe)
npm run build:win:nsis

# Build Portable Executable (.exe)
npm run build:win:portable

# Build both
npm run package:win
```
Outputs are generated in the `release/` directory.

## Linux builds and verification

Build on Linux with Node.js 22, npm, `binutils`, `rpm`, and `fakeroot` installed:

```sh
npm ci
npm test
ELECTRON_BUILDER_COMPRESSION_LEVEL=5 npm run build:linux
sudo apt-get install ./release/re-edit-pdf-1.4.0-amd64.deb
# Fedora: sudo dnf install ./release/re-edit-pdf-1.4.0-x86_64.rpm
```

For AppImage, mark it executable. Hosts without FUSE can extract it with `--appimage-extract` and run `squashfs-root/AppRun`. Portable packages do not install a desktop entry; use DEB/RPM for automatic desktop and PDF association integration.

The manual GitHub workflow builds Windows and Linux packages. It is not published or triggered automatically. The Linux test script is intended for isolated environments after installing the package:

```sh
sh scripts/test-linux-package.sh '/opt/Re-Edit PDF/re-edit-pdf' linux
xvfb-run -a node scripts/test-linux-launch.cjs
```

The workflow harness uses the matching development Electron runtime to load the **installed app.asar**, and checks the resulting report. The separate launch check starts the installed executable and verifies a PDF supplied as a file URI through its actual renderer. Root container tests pass `--no-sandbox` only in the test command. Container/Xvfb testing does not verify Wayland, physical GPU/display combinations, or every Linux distribution.

## Tech Stack
- Electron 44 & electron-vite
- React 19 & TypeScript 5.9
- Tailwind CSS 4
- pdf.js (`pdfjs-dist`)
- pdf-lib
- Tesseract.js (offline bundle)
- Zustand
## License and source

Re-Edit PDF is licensed under AGPL-3.0-only. See LICENSE and THIRD-PARTY-NOTICES.md. Corresponding source for published binaries is available in each tagged GitHub release.

## Version 1.4.0

See docs/release-1.4.0.md for content removal, redaction, certificate signing, Word export, Office import, update checking and current limitations.
