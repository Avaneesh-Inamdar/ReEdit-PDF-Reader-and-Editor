# Re-Edit PDF desktop migration

The Tauri build retains the existing React UI and runs desktop services
in Rust. Electron remains in the repository as the released regression
reference; it is not part of the Tauri executable.

## Local development

Install Rust, the platform's Tauri prerequisites, and Node.js for building the
renderer. MuPDF also requires a C/C++ toolchain and libclang. On Windows,
`scripts/rust-env.ps1` discovers Visual Studio and LLVM.

```sh
npm ci
npm run dev:desktop
```

On Windows, launch a standalone local executable using:

```powershell
./scripts/desktop.ps1 -Action run test-fixtures/simple-text.pdf
```

Build locally with `npm run build:desktop`. Packages are generated for the
host platform; Linux DEB, RPM and AppImage builds require Linux. Packaging is
still under validation. These commands do not publish anything.

## Validation

```sh
npm run build:ui
npm test
cargo test --locked -p re-edit-pdf-desktop -p re-edit-pdf-native --no-default-features
```

The Windows WebView2 harness is explicitly opt-in:

```powershell
. ./scripts/rust-env.ps1
cargo build --locked -p re-edit-pdf-desktop --features custom-protocol,desktop-test
./scripts/measure-desktop.ps1
```

The harness uses fixture PDFs and an isolated recent-file store. Screenshots,
UI checks and process-tree memory samples go to
`release/native-validation/tauri/`. Test commands are excluded from ordinary
builds. Process samples cover the tested fixture and do not prove that every
PDF or driver is free of memory leaks.

See [the migration gates](../native/MIGRATION.md) and
[local validation](../native/LOCAL-VALIDATION.md) before publishing packages.
