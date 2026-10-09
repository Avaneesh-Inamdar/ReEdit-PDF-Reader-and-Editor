# Re-Edit PDF 1.4.0 validation

Validated 2026-10-09/10 for the `v1.4.0` draft release at `b55e5c9`
(`443982c` built by CI; `684dc2c`/`b55e5c9` only adjust validation/source
archiving). Packages verified are in `release/publish-1.4.0/` and match the
uploaded draft assets byte-for-byte.

## Checksum verification

`release/publish-1.4.0/SHA256-1.4.0.txt` lists SHA-256 for the 7 binaries plus
`SOURCE-1.4.0.txt`. All local files hash to their listed values, and all 9
GitHub draft digests match:

- `3e0bfa12f9901643114e7d618d9510c0b47fb81008df1498a7e2fbe8069c6a74  mupdf-1.28.1-corresponding-source.tar.gz` (93,229,000 B)
- `889bb05f9278224274daac20e207e4e8745e487e44768b7553f071df78223624  re-edit-pdf-1.4.0-amd64.deb` (183,097,834 B)
- `6d5914bb17a41ef3eb011aa1e90a33b4ce111ea95ecf2292896e5a878eb57270  Re-Edit-PDF-1.4.0-portable.exe` (131,640,276 B)
- `79bddf78d93dda4048c2547c07c36b7772af3a13fc3a3fd85da74f5fd66bdf73  re-edit-pdf-1.4.0-x64.tar.gz` (177,961,967 B)
- `e1ee0ffaa4c869ca08fa4f7dea5ff2d16c020cbb435eac3322a7bf2840afe410  re-edit-pdf-1.4.0-x86_64.AppImage` (185,549,695 B)
- `3d7b939e29a5783326b00a78d98b7a128db00c78c2b680014894255f8ed16353  re-edit-pdf-1.4.0-x86_64.rpm` (182,240,696 B)
- `b6b08b9e93113751e3c375bdda39fca6fe9b2937b462fd78abac2dabc304be3f  Re-Edit-PDF-Setup-1.4.0.exe` (131,893,367 B)
- `61b18ade53075c2403e0d163a1fe5fddd5f821e8cf9cc765f1591a61a5ead99a  SOURCE-1.4.0.txt` (1,128 B)
- `SHA256-1.4.0.txt` self-hash `99898811db8692849c69fcbf0e0dd13cf21cce0d36ec2de2ce45d25149ab9759` (765 B) matches the uploaded digest.

`release/uploaded-assets.jsonl` digests match the same values.

## Build and unit tests

- `Build desktop packages` run `37976497247` (commit `443982c`): success on
  `windows-latest` and `ubuntu-22.04`.
- `npm test`: 62 passed, 1 skipped (LibreOffice conversion, absent on Windows),
  across 14 files. Linux CI runs the same suite with `READIT_TEST_OFFICE=1`.
- `npm run typecheck` (main + renderer) passes as part of the build.

## Windows validation

- CI `windows-latest` packaged workflows (`READIT_SMOKE_PACKAGED=1`,
  `npm run test:desktop`) passed as part of run `37976497247`.
- Local `release/smoke-windows/result.json` and
  `release/smoke-packaged-1.4.0/result.json`: passed, 24/24 GUI checks, no
  renderer errors. Checks include rendering, click/partial text edit and save,
  undo/redo, drag suppression, hand pan, multi-document sessions, annotation,
  signature placement/movement/persistence, AcroForm fill/save, preferences and
  theme reload, Combine Files ordering, native mouse selection at baseline,
  growing edit dialog, print preparation, high-DPI backing resolution, and
  300-page open/navigate with bounded canvases.
- Installer test on a Windows 11 host (non-clean, isolated directory):
  `Re-Edit-PDF-Setup-1.4.0.exe /S /D=<temp>\ReEditPDF` exits 0, installs
  `Re-Edit-PDF.exe` with FileVersion/ProductVersion `1.4.0`, plus
  `Uninstall Re-Edit-PDF.exe` and `resources/app.asar`.
  Registry verified under HKCU: `Software\Classes\ReEdit.PDF`,
  `.pdf\OpenWithProgids=ReEdit.PDF`,
  `Software\ReEditPDF\Capabilities` (+ `RegisteredApplications` entry).
  Silent uninstall exits 0 and removes those keys; the custom install folder is
  left empty (normal NSIS behavior for a custom `/D=` path) and was deleted.
  Windows default-app policy still requires the user to confirm the default in
  Settings; the app opens `ms-settings:defaultapps` via `system:defaultApps`
  (`src/main/index.ts:472`).
- Printing: smoke harness stubs `webContents.print` and asserts one print job
  is prepared (`scripts/smoke-electron.cjs:25`). The production path builds a
  paged HTML sheet and calls `webContents.print({silent:false})`
  (`src/main/index.ts:611`), so the system print dialog appears. Host printers
  enumerated: `Microsoft Print to PDF`, `HP LaserJet Professional M1136 MFP`.
  No clean-VM install or physical paper print was performed; a clean-machine
  spot check is still recommended but there is no code reason to expect a
  difference from the isolated-directory install above.

## Linux validation (lab)

Local lab (official container userspaces, Xvfb, software rendering) passes for
the 1.4.0 packages:

- `debian-12` (DEB), `ubuntu-24.04` (DEB), `fedora-43` (RPM),
  `appimage-extracted` (Debian 12, extracted AppImage): each
  `result.json` passed with the same 24 checks and `"rendererErrors": []`.
- `release-features` suites pass alongside each (`scripts/test-linux-package.sh`
  asserts both `result.json` files contain `"passed": true`).
- Desktop integration: `desktop-file-validate` passes,
  `MimeType` advertises `application/pdf` with `%F`, and the PDF default is set
  through `gio mime` on GNOME (fallback `xdg-mime`) and queried back as
  `re-edit-pdf.desktop`.
- Installed-executable launch checks pass:
  `release/linux-validation/linux-launch.json`,
  `release/linux-validation/appimage-launch.json`, plus
  `linux-tests/debian-12/tar-launch.json` pattern for the tarball binary. Each
  opens a local PDF file URI in the real executable and renders page 1.
- Container Chromium logs contain expected headless warnings (no system bus,
  GPU process fallback); no renderer errors are recorded in the reports.

Synthetic 300-page check (open until page-one selectable text; not a general
benchmark):

| Environment | Open time | Initial page canvases | Backing scale |
| --- | ---: | ---: | ---: |
| Windows | 155 ms | 2 | 1.499 |
| Debian 12 | 310 ms | 2 | 1.499 |
| Ubuntu 24.04 | 262 ms | 2 | 1.499 |
| Fedora 43 | 252 ms | 2 | 1.499 |
| Extracted AppImage | 258 ms | 2 | 1.499 |

Jumping to page 300 renders that page, updates the counter to 300/300, and
keeps fewer than ten page canvases mounted.

## CI distribution validation

- `Validate Linux distributions` run `37982234160` (commit `09dc13e`,
  artifacts from build `37976497247`): success on all three matrix jobs —
  `debian:12`, `ubuntu:24.04`, `fedora:43`.
- Each job reports the same 24 GUI checks plus 5 release-feature checks
  (update dialog, editable Word export, P12 signing, password cleared, genuine
  redaction), all `"passed": true`, plus installed-executable file-URI launch
  checks (`launch.json` for the DEB/RPM install; `appimage-launch.json` and
  `tar-launch.json` on Debian 12 for the extracted AppImage binary and the
  tarball binary).
- Two earlier attempts framed the fix: run `37978944068` timed out at the old
  20-minute limit after Electron 44's GPU process crashed under `capturePage`
  (`UnknownVizError`, unhandled rejection hanging the harness). Fixed by
  launching the test harness with `--disable-gpu --disable-dev-shm-usage`,
  retrying `capturePage`, failing fast on unhandled rejections, raising the
  job timeout to 45 minutes, and `chown`-ing the docker-written reports so the
  upload step can read them. A follow-up run (`37981564846`) then passed
  Fedora/Ubuntu but exposed the AppRun wrapper failing once extracted
  (`AppRun: line 45: /re-edit-pdf: No such file or directory`); the check now
  invokes the extracted `re-edit-pdf` binary directly, matching the local lab
  (`release/linux-lab/test-appimage.sh`). FUSE mounting itself remains
  untested, as documented below.

## Check for Updates

`Help > Check for Updates` calls `app:checkUpdates` (`src/main/index.ts:447`),
which fetches `https://api.github.com/repos/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor/releases/latest`.
While `v1.4.0` is a draft, `/latest` ignores it (draft/prerelease excluded).
After publishing `v1.4.0` as the stable release, the same endpoint must return
`tag_name: v1.4.0`; `isNewerRelease(current, latest)` (`src/main/updates.ts:1`,
tested in `tests/updates.test.ts`) then reports available for older versions
and current for `1.4.0`. Verify with the API and once from the built app before
announcing.

## Publish and update check

- Published `2026-10-09T19:51:42Z`: `v1.4.0` is now a stable release
  (`isDraft: false`, `isPrerelease: false`) with all 9 assets.
  GitHub created `refs/tags/v1.4.0` at `443982c` — the exact commit the
  release binaries were built from (`Build desktop packages` run
  `37976497247`). Commits after `443982c` touch only docs, workflows, and
  Linux/CI test scripts (no `src/`, dependency, or packaging changes), so the
  published tag is the corresponding source of the shipped application.
- `GET /repos/.../releases/latest` returns `200` with `tag_name: v1.4.0`
  (`draft: false`, `prerelease: false`). The app's `isNewerRelease` logic
  reports update available for `1.3.0` and current for `1.4.0`, matching the
  `Help > Check for Updates` behavior.

## Limits (unchanged)

Unsigned x64 builds only. No full Acrobat parity: standard-font visual text
replacement without exact font matching or paragraph reflow; single detached
certificate signature without timestamp, co-signing, chain validation, or
verification UI; text-only DOCX export without images/tables/layout;
LibreOffice-required Office-to-PDF; no PDF-to-Excel/PowerPoint, XFA editing,
form creation, or collaboration. Linux evidence is containers/Xvfb (no
Wayland/GPU matrix, no musl/Alpine, no ARM64); AppImage tested extracted
(FUSE not tested); macOS excluded. Temporary lab artifacts remain because
cleanup is blocked by policy; the lab VM is shut down.

## Local evidence

- `release/publish-1.4.0/` + `SHA256-1.4.0.txt` + `SOURCE-1.4.0.txt`
- `release/uploaded-assets.jsonl`
- `release/smoke-windows/result.json`, `release/smoke-packaged-1.4.0/result.json`
- `release/linux-validation/linux-tests/<debian-12|ubuntu-24.04|fedora-43|appimage-extracted>/result.json`
- `release/linux-validation/linux-launch.json`,
  `release/linux-validation/appimage-launch.json`
- `release/ci-windows.log`, `release/ci-linux-final.log`
