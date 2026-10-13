# Native Rust migration

The native application is a separate local build during migration. The released
Electron application remains available for regression comparisons. The user
authorized committing and building the alpha packages on 2026-10-14 after the
OCR background-repair fix. The gates below remain requirements for promotion
to a stable replacement release. Package and container checks are not evidence
of physical printer, trackpad, or stock-desktop validation.

## Release gates

- Tauri Rust desktop services with the existing React renderer in the system
  webview; no Electron or Node runtime dependency in the installed application.
- Native window decorations, DPI handling, standard close/minimize/maximize and
  unsaved-document confirmation.
- Reader, selection, Find, navigation, annotations, editing, fonts, forms, page
  operations, OCR, export, recent files, settings, update checks and file opening
  match the released feature set. Unsupported behavior must never silently pass.
- Print layout and preview share one implementation: page ranges, reverse,
  odd/even, copies, collate, duplex, color, paper, orientation, size, poster,
  multiple and booklet. Platform printing must propagate spooler failures.
- Engine regressions, pointer/keyboard/focus tests, PDF round trips, performance
  and repeated-open/close memory checks pass on the actual packaged executable.
- Windows installer Finish launch/file associations and Linux DEB/RPM/tar/AppImage
  launch pass. Native Linux runs must include Ubuntu stock desktop checks and
  both X11 and Wayland; container-only checks are not desktop validation.
- AppImage runtime and mount behavior verified without a FUSE2 dependency.
- Printer output, physical trackpad behavior and visual accessibility require
  explicit validation records; unit tests are not evidence for these checks.

The version is intentionally an alpha until these gates pass. Do not publish it
as a replacement release merely because it compiles.

## Visual contract (user clarification)

The previous Electron release's UI is the visual reference: preserve its exact
workspace layout, panels, icons, typography, spacing and settings screens. The
experimental egui screens are not the desired replacement UI. Preserve the Rust
PDF engine and print-layout work in Tauri. The user chose Tauri with the existing
React UI. Preserve the renderer layout and CSS; only adapt the desktop API
transport and resolve integration failures. The egui executable remains a local
engine test lab and is excluded from the desktop package.
