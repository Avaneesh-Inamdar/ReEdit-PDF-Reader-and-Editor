Re-Edit PDF 2.1.0 is a stable update to the Rust/Tauri desktop app.

- Edit compatible paragraphs with wrapping; move and resize their text boxes
  directly on the page while retaining font size. Cancel restores the previous
  geometry and text.
- Print with Size, Multiple, Poster and Booklet layouts. Multiple adds four page
  orders and borders. Booklet adds left/right binding and front/back passes.
- Open password-protected PDFs for editing and preserve their encryption when
  saving. Restricted editing requires the owner permissions password.
- Navigate menus with F10/arrows, cycle panes with F6 and use Ctrl+Shift+N for Go
  to Page. Button Space activation and first-page links/bookmarks are corrected.

Download the setup EXE for Windows, DEB for Debian/Ubuntu, RPM for Fedora, or
AppImage for other compatible Linux desktops. Checksums and signed update
metadata accompany the packages; the source is published under AGPL-3.0.

Windows publisher signing is not configured. Updater signatures verify app
updates but do not remove Windows publisher warnings. Linux container/Xvfb checks
do not replace every stock desktop configuration. Acrobat parity remains partial,
especially for mixed-format text, multilingual OCR, advanced forms/signatures,
Office conversion, accessibility repair and cloud collaboration.
