# Local migration validation — 2026-10-13

This is an unfinished local migration, not a release or a feature-parity claim.
The user clarified that the previous Electron UI must remain the visual target.
The existing renderer layout and CSS are retained. Desktop API calls use the
new Tauri bridge; the renderer reports native service failures and sends print
PDFs directly to Rust instead of collecting every page as a PNG.

## Passed on Windows

`./scripts/native.ps1 test`: **19 tests passed**, none failed or ignored.

The final Tauri configuration additionally passed:

- `npm run build:ui`: TypeScript and production renderer build.
- Latest `npm test`: **113 passed, 1 skipped**, across 22 test files.
- `cargo test --locked -p re-edit-pdf-desktop -p re-edit-pdf-native
  --no-default-features`: **25 passed**, none failed or ignored.
- The Windows WebView2 harness: **13 runtime checks passed**. PDF rendering,
  previous workspace layout, binary PDF/font transport, system font discovery,
  Find results and highlight cleanup, sidebar click, pinch event and unchanged
  WebView page zoom, print dialog/preview/Escape, and 12 open/close cycles.
- Certificate signing round trip: the signature verifies, wrong passwords
  fail, and changing signed content invalidates the signature. Test certificates
  are generated in memory; this does not establish publisher trust.

The WebView2 screenshots, result and process-tree samples are saved under
`release/native-validation/tauri/`. In 12 cycles on the three-page fixture,
JavaScript heap samples ranged from 10.3–14.2 MB and ended at 10.8 MB. After
startup, total private memory across the app and WebView2 children plateaued
around 439–442 MB and ended at 435 MB; handles settled at 4,357. These are debug
build measurements with font discovery and print preview included. They show
no sustained growth in this scenario, not a universal memory-leak guarantee.

- Text removal and replacement, repeated replacement editing, actual font
  metrics, color and size, undo/redo and save/reopen.
- Unsupported glyphs leave the original document unchanged.
- Atomic-save failure preserves the original file and unsaved changes.
- Accurate selection endpoints over ten lines; double-click word boundaries.
- Shortcut mapping respects text-input focus and tab direction.
- Size, Poster, Multiple and Booklet output produces the expected sheets and
  retains searchable text. Page-range validation and property-based fit tests.
- 68 bundled WOFF faces decoded into actual font programs; invalid imports rejected.
- Offline OCR preserves visible page pixels and existing native text while
  adding searchable scan text. This test uses the fast English model.
- Removal of a selected word from a real multi-line fixture; normalized geometry
  and invalid inputs validated.
- Twelve open/render/close iterations at the bounded maximum render resolution.
  This checks lifecycle functionality, **not** a quantitative memory-leak result.

The experimental Rust executable launched and rendered the reader and print
preview on Windows. Screenshots and its result are under
`release/native-validation/windows/`. These screenshots demonstrate the
prototype, not the UI the user requested to retain. Native decorations are
requested by configuration; physical titlebar and keyboard behavior still need
desktop validation.

## Not yet passed / stable promotion remains blocked

- Full native feature parity, including Office import, signing-dialog behavior, WOFF2
  font import, encrypted-PDF handling, and complete form/annotation workflows.
- Full pointer/keyboard/trackpad integration tests in the final UI shell.
- Production-build and large-document memory/performance measurements and
  invalid/corrupt-PDF stress tests.
- Actual printer output and duplex/collate behavior across printer drivers.
- Windows production installer, file-association and Finish-launch checks.
- Windows production runtime dependency packaging. Tauri's forced static CRT
  conflicted with MuPDF's DLL runtime; the shell uses dynamic CRT. The debug
  linker still warns about mixing debug/release CRT libraries; shipping builds
  need a clean release link and runtime validation on a clean machine.
- Local Linux builds, DEB/RPM/tar/AppImage packages, X11/Wayland desktop tests,
  and stock Ubuntu checks. The old lab VM did not complete SSH startup in this
  attempt; it is not evidence of a Linux test pass.

## Latest font, spacing and dialog checks

Seven additional open-source families (28 regular/italic/bold/bold italic faces)
are bundled with their OFL notices. The font test embeds and renders all 76
WOFF/OTF assets and verifies searchable text and visible glyph outlines.
Saved-PDF geometry tests check word and character spacing with both standard
and embedded fonts, and confirm that changing fonts resets inherited spacing.

The `fonts-dialog` WebView2 suite passed 11 checks in the actual desktop shell:
save/discard/cancel dialogs are centered in the window, all three answers work,
new font choices and alternative labels appear, offline font assets load,
replacement spacing resets, and canceling the editor removes its controls.
This suite does not replace the pending full gesture, print, or installer tests.

OCR image edits now reconstruct nearby paper instead of leaving pure-white
image-redaction rectangles. Tests cover white/grey/warm textured paper, all
four page rotations, adjacent scanned content, a repeated repair, and secure
redaction remaining black. The actual app's OCR edit/save/re-edit flow passed;
the saved warm-paper PDF had zero white pixels in the edited area, preserved
the next line and contained searchable replacement text without the old OCR
text. Native core/desktop test total is now 25.

Alpha package publication is authorized. Full production and distribution
validation is recorded by the build workflow; stable promotion remains gated
by the outstanding checks above.
