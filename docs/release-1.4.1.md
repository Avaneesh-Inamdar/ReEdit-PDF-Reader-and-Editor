# Re-Edit PDF 1.4.1

This release fixes text selection, recent-file controls, OCR, and workspace layout.

- Drag selection resolves endpoints against text glyphs, including trailing whitespace. Single-column upright text is ordered by visible position when PDF paint order differs. Middle-line and reverse selections no longer pull in unrelated lines. Hand and annotation tools retain their own drag behavior.
- PDF documents use a related paper icon with a visible PDF label. The Windows installer registers a separate document icon; the app and shortcuts retain the app mark.
- Recent files can be removed from history without deleting the file. Stars persist, display a filled icon, and appear in the Starred view. File controls support keyboard focus and descriptive accessibility labels.
- Smaller menu, tab, and command bars leave more space for the document. Tools use a responsive grid; open tool panels have a horizontal tool selector.
- Offline English OCR uses a single PDF text layer, fits each word to its recognized bounds, preserves scan images, and saves truly invisible searchable text. OCR skips pages already containing selectable text, normalizes paragraph bounds, releases its PDF document, shares worker initialization, and preserves cancellation across page transitions. OCR changes remain unsaved until explicitly saved.

## Downloads

Windows x64: assisted installer and portable EXE. Linux x64: DEB, RPM, AppImage, and tar.gz. Installers remain unsigned, as agreed. SHA-256 checksums and corresponding MuPDF source accompany the downloads. App source is available under AGPL-3.0-only.

## Scope and limitations

This is not full Acrobat Premium parity. Complex multi-column or rotated documents retain authored text order; PDF reading order can still vary with the source. OCR is English, with standard-font character coverage, and does not reconstruct scan layout as an Office document. AppImage use may require FUSE, or extraction. Linux automated validation uses containers/Xvfb rather than physical Wayland/GPU sessions. Exact font matching/reflow, richer Office exports, form creation/XFA, trusted publisher signing, and advanced certificate trust/timestamp/co-signature support remain outside this patch.

Use Help > Check for Updates to find future stable releases and open their download page.
