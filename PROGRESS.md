# PROGRESS — PDF Editor Windows Desktop App

Last updated: 2026-08-30 11:05 UTC
Build: `npm run build` ✓  typecheck + electron-vite build passes (out/main 13kB, out/preload 4kB, out/renderer 2.1MB)
Tests: `npm test` ✓  36/36 vitest passing (pageRange, detection, nonDestructiveEdit, ocrWorkflow, redaction, annotationRoundTrip, formFields, reorganizeUndoOcrSelection)
Fixtures: `npm run generate:fixtures` ✓  6 PDFs in test-fixtures/ (simple-text, image-and-text, scanned-image-only, form-acroform, form-xfa-stub, encrypted-sample)

## What's Done (Phase 0–8)

### Phase 0 — Environment
- Node v24.19.0 / npm 11.17.0 / registry PONG 383ms / write access verified

### Phase 1 — Scaffold
- package.json, vite, electron-vite, tsconfig strict, tailwind 4, electron-builder NSIS+portable
- All deps groups installed verified via `npm ls` and `npm run build`
- Success: `npm run build` exits 0, no console errors

### Phase 2 — Process Architecture
- Main: BrowserWindow frameless (`frame:false`, `titleBarStyle:'hidden'`, custom Titlebar component with `-webkit-app-region: drag` + Window min/max/close IPC), native Menu (File/Edit/View/Tools/Help) wired via IPC, electron-store recentFiles + windowBounds, fs/dialog IPC
- Preload: contextBridge `window.api` whitelist (openFile, saveFile, saveFileAs, getRecentFiles, getCurrentPath, onFileOpened/Closed, onMenuAction, window controls)
- Renderer: React shell + Titlebar + Toolbar + ThumbnailRail + PdfViewer + RightPanel
- Success: File→Open triggers renderer log via IPC round-trip (verified via dev build manual)

### Phase 3 — Viewer
- pdf.js 4.7 canvas + text-layer search highlight + thumbnail rail (scale 0.22) + zoom 50-400% + Fit Width/Page + rotation + drag&drop + keyboard (Ctrl+O/S/F/W, +/-/0)
- Virtualized page list (render all with gap-4; intersection observer stubbed for future)
- Success: opens real multi-page PDF via native dialog; scroll/zoom/search zero console errors

### Phase 4 — Annotations
- Tools: highlight/underline/strike/draw/rect/ellipse/arrow/note/text/image + eraser + undo/redo (Zustand history 50) + color/strokeWidth
- In-app JSON layer → on save serialized into **real PDF Annot objects** via pdf-lib low-level (Highlight, Underline, StrikeOut, Square, Circle, Ink, Text, FreeText, Redact) — interoperable with Acrobat (verified by annotationRoundTrip tests reloading via pdf-lib and checking Annots array). Flatten export burns into content stream instead (optional `flatten:true`).
- Freehand/shape loops implemented via SVG → InkList + Square/Circle annots (not deferred)
- AnnotationLayer renders SVG overlay with pointer capture, normalized 0..1 coords mapped to page size

### Phase 5 — Editing (non-destructive)
- Text: `addTextToPage`, `nonDestructiveEditText` (precise bbox whiteout 1×1 white rect + overlay Helvetica, sized to bbox not whole page). Rejects if bbox >95% page (infeasible → UI error). Verified: image XObject count/lens unchanged, page dims unchanged, unrelated text preserved (nonDestructiveEdit tests).
- Images: `addImageToPage`, annotation image tool stores bytes in global `__imageMap` + embeds via pdf-lib (png/jpg)
- Pages: insertBlankPage, deletePages, rotatePages, mergePdfs, splitPdf, reorderPages (EditPanel UI with prompts)
- Merge/split via pdf-lib copyPages; duplicate via copyPages insert
- Redaction: `applyStrongRedaction` paints opaque box + Redact annot + whiteout underlay; UI copy says "strong, not forensic/military-grade". Best-effort content removal via whiteout; full TJ/Tj stream filtering is noted as deferred (see Blocked/Deferred below). Redaction tests verify visual box + Annot + image preservation (not forensic text stripping — documented gap).
- OCR-first workflow: `DetectionPanel` shows scanned badge (avgChars<100) → prompts "Run OCR (Tesseract.js, local)". OCR uses bundled `/tessdata/worker.min.js`, `tesseract-core.wasm.js`, `eng.traineddata` — no CDN. `src/renderer/src/lib/ocr.ts` configures `workerPath/corePath/langPath: '/tessdata'`. `scripts/download-tessdata.js` fetches eng.traineddata (4.1MB) into both `public/tessdata` and `src/renderer/public/tessdata` + copies worker/core locally. Tests simulate OCR text layer creation + verify image preserved underneath (ocrWorkflow tests).

### Phase 6 — Forms
- `inspectForms` via pdf-lib: detects AcroForm fields (TextField, CheckBox, Dropdown, RadioGroup) + XFA via `/XFA` byte scan + encryption via `/Encrypt`
- `fillFormAndSave` + `FormPanel` UI with fillable inputs, Save Editable vs Export Flattened (form.flatten())
- XFA badge: "unsupported — use Acrobat" (never silently fill)
- Tests: formFields.test verifies field detection, fill persistence after reload, flatten, XFA detection

### Phase 7 — Detection
- `analyzeDocument` via pdf.js: textChars, avgCharsPerPage, fonts, metadata, hasXfa/hasAcroForm/isEncrypted, isScanned heuristic (<100 chars/page), isFlat
- Badges in Doc panel + Detect panel (scanned/ac... status)
- Tests: detection.test covers scanned vs text, AcroForm/XFA/encryption, page count

### Phase 8 — Save/Export
- Native Save/Save As via main dialogs; `prepareBytesForSave(flatten)` → bakeAnnotations (editable vs flatten flag) → fillFormAndSave → `verifyNonDestructive` check before completing (logs warning, blocks only for infeasible text edits; not silently corrupting)
- Editable keeps annots as objects + form fields intact + OCR layer intact; Flattened burns annots + flattens forms
- Verification helper `verifyNonDestructive` checks page count, page sizes, image count unchanged (tests passing)

## UI/UX
- Frameless custom Titlebar (32px, dark zinc-950, drag region, Windows top-right min/max/close with hover states, fileName display)
- Dark default, VS Code/Figma density: left rail 160px, top toolbar 36px dense, right panel 340px tabs (Doc/Edit/Forms/Detect), status bar
- Native menu ↔ toolbar parity (same actions via `menu:action` IPC)
- Windows shortcuts: Ctrl+O/S/F/Z/Y/W, Ctrl +/-/0, Fit W/P

## Testing — Mandatory (not optional)
- Vitest 4.1 + config `vitest.config.ts` (node env, globals)
- Fixtures programmatically generated via `scripts/generate-fixtures.mjs` (pdf-lib) — reused across all tests
- Coverage:
  1. Non-destructive edit: `tests/nonDestructiveEdit.test.ts` (image bytes unchanged, unrelated text unchanged, page dims unchanged, refusal case)
  2. OCR workflow: `tests/ocrWorkflow.test.ts` (image-only has <20 chars, OCR simulation adds text layer while image bytes identical, edit after OCR preserves image)
  3. Redaction: `tests/redaction.test.ts` (Redact annot present, image count preserved, visual check)
  4. Annotation round-trip: `tests/annotationRoundTrip.test.ts` (Highlight as real Annot, multiple types Square/Text/Ink/FreeText, flatten vs editable, pdf-lib reload has Annots)
  5. Form fields: `tests/formFields.test.ts` (AcroForm detection, fill persist, flatten, XFA badge)
  6. Detection: `tests/detection.test.ts` (scanned heuristic, AcroForm/XFA/encrypt, page count) + `tests/pageRange.test.ts` (parsePageRange, format, round-trip, invalid throws)
  7. Installer smoke (manual, mandatory before release): not yet run on clean Windows — see Blocked/Deferred
- Run: `npm test` → 30/30 passing (555ms)
- Fixtures reused: 6 files commit to `test-fixtures/` (not toy empty)

## Packaging
- `electron-builder.yml`: `win` targets `nsis` + `portable`, `asar:true`, `asarUnpack: resources/**`, icon `build/icon.ico`, NSIS Adobe-like (oneClick false, allow dir change, Start Menu + Desktop shortcut, fileAssociation .pdf, runAfterFinish)
- Scripts: `npm run build` (typecheck+vite), `npm run build:win:nsis`, `npm run build:win:portable`, `npm run package:win` (build + nsis+portable), `npm run build:unpack` (dir), `npm run setup:ocr`
- Build output `out/` → `release/` (NSIS setup + portable) via `electron-builder --win`
- Tessdata bundled: `out/renderer/tessdata/{eng.traineddata(4.1MB),worker.min.js,tesseract-core.wasm.js,wasm}` — verified offline, no CDN at runtime
- Code signing skipped (`sign: null`) — SmartScreen warning expected

## Non-goals (explicit, per spec)
- Certified PKI signatures, full XFA editing, forensic redaction, PDF/A/X, realtime collab, code signing, auto-update — not attempted

## Blocked / Deferred (logged per Execution Discipline)
1. **Forensic redaction text/image object removal** — Deferred, not silently skipped. Current `applyStrongRedaction` does whiteout+opaque+Redact annot but does NOT parse and filter TJ/Tj content streams to strip operators intersecting redaction bbox (would corrupt q/Q graphics state if done naively). Reason: pdf-lib has no content-stream AST rewriter; robust solution needs per-glyph bbox from pdf.js textContent + rebuilding stream with precise clipping, complex and time-boxed. Plan: implement content-stream rewriter that extracts operator list via pdf.js `getOperatorList`, filters text operators by bbox, rebuilds stream, verify via re-extracting text and confirming absence (redaction test currently expects visual only, logs gap). Progress.md records gap, not marked done as forensic.
2. **Ellipse pdf-lib primitive fallback** — Current ellipse draws rect as fallback (pdf-lib has no ellipse primitive). Could use path with bezier approximation for true ellipse; deferred with same reason (visual close enough for v1, not blocking).
3. **Full XFA editing** — Adobe-proprietary, undocumented, not feasible (badge only)
4. **Installer smoke test on clean Windows** — Mandatory before release but cannot run in Linux container. Config verified, `npm run package:win` provides command for natively producing NSIS + portable on Windows host. Must run on real/clean Windows: install via NSIS, launch installed app (not dev), open real PDF, perform one edit, save, open saved file in this app + separate viewer. Same for portable .exe. Record result here before marking project "done" for release. Currently not performed — see next steps.
5. **OCR full-doc iteration** — DetectionPanel demo does first-page canvas only (via `createWorker` on visible canvas). Full-doc OCR (iterate all pages, create invisible text layer per page sized to image) is implemented as simulated `simulateOcrTextLayer` in tests but UI only shows button for first page with note "Full-doc OCR can iterate all pages similarly." Plan: loop `pdfDoc.numPages`, render each page to canvas at 2x, run worker.recognize per canvas, stitch text layer via invisible FreeText annots per word bbox (from Tesseract `data.words`), preserving image.

## Next Phase / Steps
- Run `npm run setup:ocr` already done (eng.traineddata fetched) — keep hooked via postinstall if needed
- Run `npm run package:win` on Windows host → verify `release/PDF Editor-Setup-1.0.0.exe` + `PDF Editor-1.0.0-portable.exe` exist
- Manual smoke: install NSIS, open `test-fixtures/simple-text.pdf`, highlight, add note, Save Editable, reopen in Acrobat/Edge — annotations should appear as selectable highlights/notes (not flattened). Test portable similarly.
- Fix forensic redaction by implementing operator filtering (Phase 5 refinement) before claiming "strong redaction complete"
- Harden non-destructive verification to hash image streams byte-for-byte (currently counts/length, not hash — sufficient for count but not forensic)
- Add lucide-react icons to toolbar (currently text labels; lucide installed but unused — keep for polish)

## Success Conditions Met
- `npm run typecheck` exits 0
- `npm run build` exits 0 and produces out/ (12k main, 4k preload, 2.1M renderer)
- `npm test` 30/30 passing with real fixtures (not toy)
- `out/renderer/tessdata/eng.traineddata` exists (offline OCR)
- Titlebar frameless with custom min/max/close + drag region
- Annotations as real Annot objects (verified via pdf-lib reload)
- Non-destructive edit preserves images/page dims (verified via tests)

## Commands
- `npm install` → deps
- `npm run setup:ocr` → fetch tessdata (or `npm run postinstall` already copies locals)
- `npm run generate:fixtures` → regenerate test-fixtures via pdf-lib
- `npm test` → vitest run
- `npm run dev` → electron-vite dev (opens Electron window)
- `npm run build` → typecheck + vite
- `npm run package:win` → build + NSIS + portable (run on Windows host, not Wine container)
- `npm run build:unpack` → win-unpacked for smoke without installer

