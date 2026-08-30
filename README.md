# Readit PDF Reader & Editor

A modern, high-performance Windows desktop PDF reader and editor built with Electron, React, TypeScript, pdf.js, pdf-lib, and local Tesseract.js.

Created by **Avaneesh Inamdar**.

---

## Features

### 📄 Advanced PDF Viewing & Navigation
- High-fidelity PDF rendering with bundled offline `pdf.js` worker
- Continuous and single page viewing modes
- Fluid zoom (50% to 500%), Fit Page, Fit Width, and custom scaling
- Thumbnail rail with drag navigation and page preview
- Spacebar temporary pan hand tool & dedicated pan mode
- Full-text search with regex and instant navigation
- Document properties inspection (fonts, security, producer, page dimensions)

### ✏️ Annotation & Text Selection
- **Selected Text Actions**: Select any text on a page to instantly **Highlight**, **Underline**, **Strikethrough**, **Change Text Color**, **Copy**, or **Redact** via the floating context toolbar or top action bar.
- Freehand pencil/highlighter with customizable stroke width, opacity, and color palette.
- Shape annotations: Rectangle, Circle, Line, and Arrow with live geometry controls.
- Sticky notes and centered text annotations.
- Eraser tool and individual annotation deletion.
- Real PDF annotation object export (preserving re-openable annotations) as well as flattened burn-in export.

### 📑 Page Organization & Document Operations
- **Reorganize Pages Modal**: Drag-and-drop page reordering, page deletion, 90° clockwise/counter-clockwise rotation, and external page insertion.
- **Robust Undo / Redo**: Multi-level document undo stack (`Ctrl+Z` / `Ctrl+Y`) for all page reorganization, rotations, deletions, and insertions, coordinated with annotation history.

### 🔍 OCR & Scan Detection
- Offline optical character recognition powered by bundled Tesseract.js (`/tessdata`).
- Automatic scan detection with heuristic analysis of character density.
- **Improved OCR Accuracy**: High-resolution 300 DPI canvas rendering paired with adaptive contrast stretching and thresholding preprocessing.
- **Custom Page Selection**: Run OCR on current page, all pages, or custom page ranges (e.g. `1-3, 5`).
- **Stop in Between**: Responsive stop option to cancel OCR at any point while keeping completed pages intact.
- **Searchable PDF Output**: Automatically prompts to save the searchable PDF with invisible text layer baked in and suggests `<filename>_ocr.pdf`.
- **Convert OCR to Editable Text**: Turn recognized scanned text into editable text boxes with configurable fonts and sizes.

### 📝 Form Filling & Editing
- Interactive AcroForm field detection, text box filling, checkbox toggling, and export.
- Non-destructive inline text editing (whiteout + font overlay preserving background image objects).

---

## Tech Stack

- **Framework**: Electron 33 + electron-vite
- **UI**: React 19, TypeScript 5.9, Tailwind CSS 4, Lucide Icons
- **State Management**: Zustand
- **PDF Engines**:
  - `pdfjs-dist` 4.7 (viewing, rendering, text layer extraction)
  - `pdf-lib` 1.17 (page manipulation, annotation creation, form filling, text baking)
- **OCR**: Tesseract.js 5.1 (bundled local language weights)
- **Packaging**: electron-builder with NSIS wizard installer and portable executable

---

## Development & Build

### Prerequisites
- Node.js >= 18
- npm

### Installation
```bash
npm install
```

### Run in Development
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

### Build Windows Installer (.exe)
```bash
npm run build:win:nsis
```
This produces:
- `release/Readit PDF Reader and Editor-Setup-1.0.0.exe` (NSIS Wizard installer with desktop shortcut, start menu shortcut, and `.pdf` file association)

### Build Portable Executable
```bash
npm run build:win:portable
```
This produces:
- `release/Readit PDF Reader and Editor-1.0.0-portable.exe` (standalone executable without installation)

---

## License

Copyright © 2026 Avaneesh Inamdar. All rights reserved.
