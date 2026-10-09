# Re-Edit PDF 1.4.0

Windows x64: assisted setup and portable executable. Linux x64: DEB, RPM, AppImage and tar.gz. These downloads are unsigned. Verify their SHA-256 checksums against the published checksum file. Trusted publisher signing was deferred at the owner's request.

## Changes

- Re-Edit PDF branding, a manually drawn vector logo, consistent Lucide icons and native Windows window controls.
- Accurate PDF.js text selection, selected-text editing, a growing text editor, correct baselines, undo/redo and independent document sessions.
- MuPDF removes original selected text when saving edits. Redaction flattens form fields, removes marked text, image pixels, graphics and intersecting comments, then rewrites the PDF without previous revisions, document metadata or catalog attachments.
- Sharp rendering with bounded canvas allocation, lazy page and thumbnail rendering, cached text extraction and limited concurrent work for large documents.
- Working menus/preferences, internal dragging and hand panning; assisted Windows installer and PDF default-app registration; Linux desktop and MIME integration.
- Help > Check for Updates reads the latest stable GitHub release. Downloads/installations remain user initiated.
- Sign > Sign with a Certificate saves a cryptographically signed copy using a supplied P12/PFX certificate.
- File > Export text to Word produces editable DOCX paragraphs. File > Convert Office document to PDF uses a separately installed LibreOffice.
- Complete corresponding source is published under AGPL-3.0-only.

## Limits

This release does not have full Adobe Acrobat parity. Text replacement uses standard fonts and a white background; exact font matching and paragraph reflow are incomplete. Reset temporary viewer rotation before saving marked redactions. Review saved redacted copies before sharing. Undo in the open session retains the source document. Advanced PDF structures and every producer's output have not been audited.

Certificate signing supports one signature, without a trusted timestamp, incremental co-signing, chain validation or signature verification UI. Trust depends on the recipient's certificate store. Word export omits images, tables and exact layout. PDF-to-Excel/PowerPoint, XFA editing, form creation and collaboration remain unsupported.

Linux GUI testing uses Xvfb/containers and does not establish compatibility with every Wayland/GPU/distribution combination. macOS builds are not included. Native clean-machine Windows installer/uninstaller and physical printing need additional manual validation.
