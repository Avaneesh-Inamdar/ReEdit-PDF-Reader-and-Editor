# Re-Edit PDF 1.4.2

This patch improves text formatting, trackpad zoom, navigation, Find, and installer startup.

- Eight additional offline families: Lato, Libre Baskerville, Noto Sans, Noto Serif, Open Sans, Roboto, Source Code Pro and Ubuntu. All have regular, bold, italic and bold italic faces, for 32 new faces alongside the standard PDF fonts. Import TTF/OTF/WOFF files for additional fonts.
- Editing detected PDF text keeps its embedded font outlines, fractional size, color, weight, slant and text matrix. Space glyphs removed from PDF.js's browser cmap are restored for saving; Unicode maps keep replacements searchable. Saving removes the original selected text. The Format list includes the document font and its original size.
- Precision-trackpad pinch events zoom around the pointer, with coalesced updates. Native two-finger horizontal and vertical scrolling remains available. Oversized pages remain reachable horizontally.
- The navigation button opens and closes the sidebar. Thumbnail size changes the visible thumbnail, rather than only its resolution, and the slider stays accessible above the page list.
- Find counts every occurrence, including fragmented runs, and marks only matching characters. Case and whole-word filters and F3/Ctrl+G navigation are available. Escape, Ctrl+F and the close button clear marks and cancel queued or in-flight searches.
- The assisted Windows installer has its standard launch checkbox enabled by default. Finish opens the app using an asynchronous shell launch. Opening a PDF through the system's default-app association restores and maximizes its document window.

## Downloads

Windows x64: setup and portable EXE. Linux x64: DEB, RPM, AppImage and tar.gz. Source remains AGPL-3.0-only. Corresponding MuPDF source, validation details and SHA-256 checksums accompany the packages. Help > Check for Updates finds this release.

## Limits

An embedded subset cannot supply glyphs omitted by the PDF's author. Such edits require choosing a bundled font or importing the full font. Vertical text, heterogeneous paragraph reflow, advanced shaping and reconstruction of colored backgrounds are not implemented. Non-embedded custom fonts need to be supplied. Imported font faces retain their supplied outlines; choose or import another face to change their weight/slant.

This is not full Acrobat Premium parity. Linux validation uses containers/Xvfb; physical trackpad hardware, native Wayland/GPU sessions, FUSE-mounted AppImage, physical printing, ARM64 and macOS are not verified. Windows binaries remain unsigned, as previously agreed.
