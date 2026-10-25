# Re-Edit PDF 2.1.0 validation

Manual-download prerelease audit, 25 October 2026. Full current desktop Acrobat
Pro parity has **not** been achieved. See the [audit](AUDIT.md) and the
[detailed gap assessment](../../ACROBAT-PARITY.md).

## Application and package provenance

Selected Windows and Linux production packages were built from application
commit `3ea243ba0aefaa6dda0a7c92bbdcf45c94351635`. The clone started at
`ee0600513cfba0fc43788e6ba438d781b74de057`; the intervening change only creates
installer test output directories. This audit changes release documentation and
feed-publication logic, without changing application UI or PDF engine code.

The [build provenance](BUILD-PROVENANCE.json) records artifact identities and
package hashes. Compact downloaded [test reports](TEST-REPORTS.json) retain
checks, errors and installer/distribution results.

## Checks run locally during this audit

- `npm ci --ignore-scripts`: completed from the committed lockfile.
- `npm run typecheck`: node and renderer checks passed.
- `npm run build:ui`: passed. Vite reports its existing large-chunk warning.
- `npm test`: **190 passed, one skipped**, across 36 files, after the release-feed
  regression was added. The optional LibreOffice integration was skipped because
  LibreOffice is not installed here; the Linux CI build ran it successfully.
- ESLint for `scripts/prepare-update-feed.mjs` and `tests/updateFeed.test.ts`:
  passed with zero warnings.
- Package structure checks passed for the Windows portable ZIP (CRC, executable,
  runtime DLLs and license), Linux AppDir tar.gz (safe paths, executable launcher,
  bundled WebKit and app binary), MuPDF source archive and RPM version/architecture.
  The Linux Actions ZIP was verified against GitHub's recorded SHA-256 digest.
- The updated feed workflow passed against stable 2.0.0 in
  [run 40179199235](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40179199235).
- Existing renderer/shared source lint: **58 errors across 24 files**. Application
  source is unchanged by this audit. The repository-wide lint command was stopped
  because it also traverses vendored/generated assets; this is not a clean lint
  result and should not be presented as one.
- No local Rust compilation was performed; this host has no Rust toolchain.
  Native unit-test results below come from the actual package CI logs.

## Previously executed CI, rechecked from logs and artifacts

These are inspected CI results, not claims that those platforms were rerun on
this Linux host.

| Run | Scope | Rechecked result |
| --- | --- | --- |
| [40168228525](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40168228525) | Windows production packages and WebView2 | Successful Windows job; 189 frontend tests passed, one optional Office test skipped; 45 Rust tests passed. 132 distinct UI checks passed across the retained suites. |
| [40130544556](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40130544556) | Linux production packages and WebKitGTK | Linux package job succeeded; 190 frontend and 45 Rust tests passed. 86 UI checks passed. The overall run was cancelled in the Windows job; its Linux package job completed successfully. |
| [40168407818](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40168407818) | Exact Windows packages, two clean workers | Both attempts passed EXE wizard/Finish/launch/uninstall, MSI install/launch/uninstall and portable startup-close checks. |
| [40168271669](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40168271669) | Linux distribution packages | Debian 12, Ubuntu 24.04 and Fedora 43 passed nine WebView smoke checks each; installed DEB/RPM and AppImage extract-and-run processes launched. |

The Windows job built both production packages and the opt-in test executable,
collecting production binaries before rebuilding with test commands enabled.
The installer and distribution jobs consumed the selected build artifacts.
These harnesses do not prove that every control works on every document.

The inspected Windows reader and print screenshots show the implemented
workspace and multiple-page print preview. They are evidence of Re-Edit PDF's
rendering, not side-by-side Acrobat visual equivalence.

## Release assets and updates

The [2.1.0 prerelease](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/tag/v2.1.0)
is public at tag commit `ffa112d3ec105bfd163ab38eeb66dae76cb244c3`. All nine
uploaded asset sizes and GitHub SHA-256 digests matched the local files before
publication. The publication-triggered feed check
[40179527785](https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/actions/runs/40179527785)
passed, excluding the prerelease before fetching update metadata. GitHub's latest
stable release and the signed feed both remain on 2.0.0.

Published downloads include Windows setup EXE/MSI/portable ZIP, Linux
DEB/RPM/AppImage/portable tar.gz, corresponding native MuPDF source and
`SHA256SUMS`. The Linux tar.gz contains an extracted AppDir with its bundled
libraries and launcher; it is not a bare executable claimed to be portable.
GitHub supplies the project source ZIP/tar.gz for the release tag.

This prerelease is for manual installation. The existing updater signing key is
unavailable here, so there is no `latest.json` for 2.1.0 and the stable signed
feed remains on 2.0.0. The publication workflow now checks channel eligibility
before fetching signatures; a prerelease cannot displace the stable feed.
Eligible stable releases still require their signed manifest.

Windows publisher signing is not configured. Checksums are not signatures.
Container/Xvfb launch checks do not replace stock Wayland/X11 desktops, FUSE,
physical trackpads/printers, driver behavior, screen-reader tests or an extensive
malformed/complex PDF corpus. Bounded cleanup checks do not prove the absence of
all memory leaks. No current licensed Acrobat Pro session was used for runtime
comparison.
