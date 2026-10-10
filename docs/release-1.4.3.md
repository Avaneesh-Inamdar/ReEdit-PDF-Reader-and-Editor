# Re-Edit PDF 1.4.3

Fixes long text selection, repeated editing, placed-text selection and the white boxes left by text replacement.

- Selection follows geometric lines and columns instead of PDF painting order. Forward, reverse and middle-block drags stay together; double-click selects a word. Active drags no longer trigger fit-to-page resizing.
- Replacement text can be selected and edited again, including appended text outside its original bounds. Copying uses Unicode rather than private font glyph codes. Placed multiline text grows its selectable area; double-click opens its editor. Object selection also works inside unfilled shapes.
- Saved FreeText annotations are detected on reopening. Editing replaces their original annotation instead of leaving duplicate text beneath the replacement.
- Text-edit previews render real content removal. Colored, vector and image backgrounds remain visible, with no white masking rectangles in previews or saved replacements.
- Page and sidebar rendering use at least double display resolution, bounded to 24 megapixels per page canvas. Thumbnails have a fixed readable size; the size slider is removed.
- Font import accepts TTF, OTF, WOFF and WOFF2. WOFF2 is decoded into valid font tables before embedding. Original embedded font outlines and supported formatting remain available; unknown custom fonts no longer silently fall back to a standard face. Text detection retains vertical runs and continues when operator-style extraction fails.

## Downloads

Windows x64: setup and portable EXE. Linux x64: DEB, RPM, AppImage and tar.gz. Source is AGPL-3.0-only. Corresponding MuPDF source, validation details and SHA-256 checksums accompany the packages. Help > Check for Updates finds this release.

## Limits

Image-only text requires OCR; OCR cannot reconstruct pixels covered by scanned letters when replacing them. Fonts missing from the PDF must be supplied, and embedded subsets cannot supply omitted glyphs. Advanced shaping, mixed-direction/vertical editing and heterogeneous paragraph reflow remain limited. This release does not claim complete Acrobat Premium parity.

Windows binaries remain unsigned, as agreed. Linux tests use containers/Xvfb; physical trackpad hardware, native Wayland/GPU sessions, FUSE-mounted AppImage, physical printing, ARM64 and macOS are not verified.
