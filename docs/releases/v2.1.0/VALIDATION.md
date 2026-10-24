# Re-Edit PDF 2.1.0 validation

Stable release candidate, 25 October 2026. Publication is pending the package
checks recorded below. This release does not claim complete Acrobat parity.

## Scope

- Uniform paragraph wrapping, inline text-box movement/resizing and saved text
  that remains searchable and editable.
- Size, Multiple, Poster and Booklet print plans, including four Multiple orders,
  vector page borders, left/right booklet binding and manual front/back passes.
- Keyboard menu/pane/page navigation and correct zero-based PDF destinations.
- Password-authenticated editing with encryption-preserving saves and ephemeral
  native sessions. Restricted editing requires the owner permissions password.

Workflow references and remaining gaps are in
[the Acrobat comparison](../../ACROBAT-PARITY.md). This pass uses online Adobe
documentation; no current paid Pro session was used to verify parity.

## Checks

Results will be filled from the completed local and isolated package runs before
publication. A package build alone is not a passed application test.

The validation covers Windows WebView2, Linux WebKitGTK under Xvfb, clean Windows
installer lifecycle runs and Debian/Ubuntu/Fedora package launches. Container
checks do not replace stock Wayland/X11 desktops or physical trackpad/printer
testing. Bounded open/close and font cleanup checks do not prove the absence of
all memory leaks.

## Release assets and updates

Only the Windows setup EXE, Linux DEB/RPM/AppImage, corresponding native MuPDF
source archive, `latest.json` and `SHA256SUMS` are intended for publication.
Updater signatures are verified separately from Windows publisher signing;
there is no Windows publisher certificate. Existing stable installations can
receive the new-version notification through the existing signed update feed
after publication.
