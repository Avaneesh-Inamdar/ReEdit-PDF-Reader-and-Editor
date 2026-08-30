# Readit PDF Reader & Editor

A lightweight, local-first PDF reader and editor for Windows. Built with Electron, React, TypeScript, pdf.js, pdf-lib, and offline Tesseract.js OCR.

Developed by **Avaneesh Inamdar**.

## Download

Pre-built Windows binaries (64-bit) are available under [Releases](https://github.com/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor/releases):

- **Setup Installer (`.exe`)**: `Readit PDF Reader and Editor-Setup-1.0.0.exe` — Windows setup wizard with desktop shortcut, Start Menu shortcut, uninstaller, and automatic `.pdf` file association.
- **Portable Executable (`.exe`)**: `Readit PDF Reader and Editor-1.0.0-portable.exe` — Standalone executable, runs immediately without installation.

## Features

### Viewing & Navigation
- High-resolution rendering via `pdf.js` with continuous and single-page display modes.
- Zoom from 50% to 500%, Fit Width, and Fit Page options.
- Thumbnail sidebar with drag-and-drop page jumping.
- Hand pan tool (click-drag or hold `Space` to pan).
- In-document search (`Ctrl+F`) with match navigation and keyword highlighting.
- Metadata and document properties viewer.

### Text Selection Actions
- Selecting text in the document opens a quick action bar with:
  - **Highlight**, **Underline**, and **Strikethrough**
  - **Text Color**: change selected text color non-destructively
  - **Copy** and **Redact**

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
- AcroForm detection and fillable form support (text fields, checkboxes).
- Inline non-destructive text editing (whiteout overlay preserving background graphics and image resolution).

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
- Node.js >= 18
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

## Tech Stack
- Electron 33 & electron-vite
- React 19 & TypeScript 5.9
- Tailwind CSS 4
- pdf.js (`pdfjs-dist`)
- pdf-lib
- Tesseract.js (offline bundle)
- Zustand

## License

Copyright © 2026 Avaneesh Inamdar. All rights reserved.
