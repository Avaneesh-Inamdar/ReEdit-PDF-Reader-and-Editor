# Re-Edit PDF 1.4.4

A compact Acrobat-style workspace, consistent controls, a custom print dialog and improved text editing and offline recognition.

- Compact document tabs and header, a left workflow pane, quick tools and a right page rail. Home shows common tools and a recent-file table with working favorites and removal.
- Shared light/dark button, input, selected and disabled styles across OCR, editing, forms, signatures and dialogs. Colored selection buttons and form badges are replaced with neutral controls.
- Structured application print dialog with preview, printer selection, copies, color/grayscale, duplex, ranges, odd/even pages, reverse order, paper size and scaling. The print job bypasses the native print-options dialog.
- Full Adobe Source Sans 3 and Source Serif 4 fonts, more offline faces, and installed TTF/OTF font selection. Missing glyphs are checked before applying edits. CFF and WOFF font embedding is corrected to avoid invalid outlines and black marks.
- Compatible PDF and OCR fragments can be edited as a line. Existing font outlines and supported formatting are retained; replacements remain editable.
- Accurate offline English OCR uses the best model at up to 300 DPI. Mixed text/image pages are recognized without duplicating their digital text. Save a searchable copy or overwrite the current file. Editing recognized text removes old scan pixels in the selected region.
- Find includes excerpts, results, case/whole-word options and F3 navigation. It searches edited/placed text, handles ligatures and reading order, and clears highlights and pending searches on close.
- Alt+F4 closes the app; Ctrl+F4 and Ctrl+Tab handle document tabs. Native pinch fallback controls PDF zoom.
- Cleanup covers PDF loading tasks, font preview faces, text-style caches, OCR workers and UI timers. Repeated open/Find/print-preview/close cycles check heap growth and retained resources.
- The README includes the application icon, workspace screenshot, download guidance, development commands and current limits.

## Downloads and validation

Windows x64: setup and portable EXE. Linux x64: DEB, RPM, AppImage and tar.gz. Packages, SHA-256 checksums, corresponding MuPDF source and a validation report accompany the release. Help → Check for Updates finds published versions.

## Limits

Packages remain unsigned, as agreed. Proprietary Adobe Fonts are not redistributed. OCR currently recognizes English and estimates typography; complex layouts, advanced shaping and background reconstruction remain limited. This release does not claim complete Acrobat Premium parity.

Linux GUI validation uses containers/Xvfb. Physical printers, trackpads, native Wayland/GPU sessions, FUSE mounting, ARM64 and macOS are not verified. Memory checks establish behavior in the measured scenarios, not that every PDF and driver is leak-free.
