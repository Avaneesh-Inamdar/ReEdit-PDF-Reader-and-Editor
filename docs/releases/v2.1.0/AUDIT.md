# Current Acrobat Pro audit — 25 October 2026

## Verdict

**The request for identical UI, workflows, clicks and behavior has not been
completed.** Re-Edit PDF is a working independent PDF editor with an Acrobat-like
workspace. Passing its own regression tests does not establish Acrobat parity.
The comparison target for this audit is current desktop Acrobat Pro, as selected
by the repository owner.

The source was cloned from `main` at
`ee0600513cfba0fc43788e6ba438d781b74de057`. Both selected production package builds
identify application commit `3ea243ba0aefaa6dda0a7c92bbdcf45c94351635`. The only
changes between those revisions create installer test output directories; they
do not change the application. This audit's changes concern release reporting
and update-feed publication, not PDF engine or UI behavior.

## What was compared

The audit reviewed the renderer tool routes, native build configuration, existing
comparison evidence, test suites, CI logs and downloaded package test reports.
The repository's workspace screenshot was inspected as static visual evidence.
Adobe's current documentation was checked for the
[workspace](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/workspace.html),
[text formatting](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/format-text.html),
[text-box manipulation](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/adjust-text-boxes.html)
and [booklet printing](https://helpx.adobe.com/acrobat/desktop/print-documents/booklets-posters-banners/print-booklets.html).

No licensed, running Acrobat Pro installation was available in this environment.
There was no side-by-side runtime or exhaustive click comparison. The earlier
Adobe package/resource inventory is described in
[ACROBAT-PARITY.md](../../ACROBAT-PARITY.md); it is not a current runtime oracle.
Neither those resources nor an open-source GitHub project disclose all of
Acrobat's private implementation or reproduce its hosted services.

## Concrete differences

| Workflow | Repository evidence | Result |
| --- | --- | --- |
| Global toolbar | `Toolbar.tsx` routes All tools, Edit, Convert and Sign, plus Open/Save/Print/Save as. Convert offers text-to-Word export and Office import. | Familiar organization, but different actions and scope; there is no matching Share/cloud workflow. |
| Existing text | Conservative compatible-paragraph editing; mixed styles and ambiguous geometry fall back to line editing. | Partial. No general mixed-format text-box editing, lists, alignment or advanced character controls. |
| Text-box handles | Existing inline editor supports movement and horizontal width adjustment. | Partial. Acrobat also documents corner/height resizing and rotation. |
| Existing images | Edit tools can add images; `DocumentObjectsPanel.tsx` lists annotations and fields. | No general selection, crop, replacement or transform workflow for original page images. |
| Forms/signatures | Form filling and local signature/certificate routes exist. | No comparable form-authoring, XFA, certificate-trust or hosted e-signature service coverage. |
| OCR/conversion | Offline English OCR and text-oriented Word export; Office import needs LibreOffice. | No multilingual recognition selection or general layout-preserving Office export parity. |
| Printing | Size, Multiple, Poster and Booklet planners have preview/output tests. | Partial. Booklet sheet intervals, tall binding and physical driver/output validation remain gaps. |
| Page tools | Combine, reorder, rotate, delete, blank insertion and extraction exist. | Crop, watermarks, headers/footers and Bates workflows remain gaps. |
| Specialist workflows | See the source inventory in the existing comparison. | Accessibility repair, production/preflight, document comparison, batch actions and cloud review are not comparable. |
| Feel and clicks | Menus, keyboard navigation, selection and several print/editor interactions have regression coverage. | No exhaustive screen, focus, DPI, gesture or side-by-side click equivalence evidence. |

The complete engineering gap table remains in
[ACROBAT-PARITY.md](../../ACROBAT-PARITY.md). None of the differences above was
implemented away by this release audit.

## Rechecked evidence and release

The [validation report](VALIDATION.md) distinguishes newly executed local checks
from prior CI checks whose logs/artifacts were inspected. The
[build provenance](BUILD-PROVENANCE.json) records the exact application commit,
artifact identities, selected package hashes and validation runs.

The 2.1.0 packages are published as a **manual-download prerelease**. The existing
updater private key is referenced by `scripts/sign-native-release.ps1` in a
Windows user profile, with a DPAPI-protected password. That key is unavailable
in this environment. No replacement updater identity, fabricated signatures or
unsigned automatic update is introduced. The stable signed channel stays on
2.0.0 until the existing key signs the selected 2.1.0 assets and its manifest.

Packages belong in GitHub Releases rather than Git source history. The release
includes Windows setup EXE/MSI/portable ZIP, Linux DEB/RPM/AppImage/portable
tar.gz, the corresponding MuPDF source archive, and SHA-256 checksums. Windows
publisher signing is not configured. The release is not a claim that every
Acrobat Pro workflow has been reproduced.
