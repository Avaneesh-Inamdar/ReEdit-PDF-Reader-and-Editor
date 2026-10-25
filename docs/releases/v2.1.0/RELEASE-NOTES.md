Re-Edit PDF 2.1.0 is a manual-download prerelease of the Rust/Tauri desktop app.
It is not an exact reproduction of current desktop Acrobat Pro; see the
[audit](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/blob/main/docs/releases/v2.1.0/AUDIT.md).

- Edit compatible paragraphs with wrapping; move and resize their text boxes
  directly on the page while retaining font size. Cancel restores the previous
  geometry and text.
- Print with Size, Multiple, Poster and Booklet layouts. Multiple adds four page
  orders and borders. Booklet adds left/right binding and front/back passes.
- Open password-protected PDFs for editing and preserve their encryption when
  saving. Restricted editing requires the owner permissions password.
- Navigate menus with F10/arrows, cycle panes with F6 and use Ctrl+Shift+N for Go
  to Page. Button Space activation and first-page links/bookmarks are corrected.

Download the setup EXE or MSI for Windows, DEB for Debian/Ubuntu, RPM for Fedora,
or AppImage for compatible Linux desktops. Portable Windows ZIP and Linux
tar.gz packages are also included. The Linux archive contains an extracted
AppDir; extract it and run `squashfs-root/AppRun`. It still requires a compatible
desktop environment. Checksums and the corresponding MuPDF source accompany
the packages; the project source is published under AGPL-3.0.

Install this release manually. The existing updater signing key was unavailable
in the audit environment, so this prerelease has no `latest.json` and is not
advertised through the signed update feed. The stable channel remains on 2.0.0.
SHA-256 checksums detect file changes; they are not publisher signatures.

Windows publisher signing is not configured. Updater signatures verify app
updates but do not remove Windows publisher warnings. Linux container/Xvfb checks
do not replace every stock desktop configuration. Acrobat parity remains partial,
especially for mixed-format text, multilingual OCR, advanced forms/signatures,
Office conversion, accessibility repair and cloud collaboration.
