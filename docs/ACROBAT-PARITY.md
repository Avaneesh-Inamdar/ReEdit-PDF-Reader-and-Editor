# Acrobat workflow comparison

Updated on 25 October 2026. This is an engineering gap assessment, not a claim
of complete compatibility or a pixel-identical reproduction. It covers the
2.1.0 changes following v2.0.0. Package validation and publication status are
recorded in [the 2.1.0 release report](releases/v2.1.0/VALIDATION.md).

The [release audit](releases/v2.1.0/AUDIT.md) rechecks the current
desktop Acrobat Pro target, concrete source differences, package provenance
and completed CI reports. Its verdict is that identical UI and behavior have
**not** been achieved. Current package availability does not change that verdict.

## Additional 2.1.0 work

The October 25 implementation uses Adobe's public documentation as its workflow
reference. Acrobat is not currently available for live comparison; the earlier
REA package inventory below remains static evidence, not a runtime comparison.

- Active inline text boxes have move and left/right resize handles. Resizing
  rewraps compatible text without changing its font size. Done applies geometry
  and text together; Cancel discards them. The original removal geometry is
  retained separately so moving text does not erase its destination.
- Multiple printing supports horizontal, horizontal reversed, vertical and
  vertical reversed ordering, plus exported vector page borders. Booklet printing
  supports left/right binding and both/front/back passes. Manual passes force
  simplex output; returning to both sides restores duplex.
- Password-protected editing uses an in-memory native authentication session.
  Saving retains the source encryption, passwords and permission flags. A
  restricted document requires its owner permissions password for editing.
  Passwords are not stored in renderer state or persistent preferences.

See Adobe's [text box guidance](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/adjust-text-boxes.html),
[multiple-page ordering](https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/multiple-pages.html)
and [manual booklet passes](https://helpx.adobe.com/uk/acrobat/kb/print-booklets-acrobat-reader.html).

## October 24 implementation

- Editing compatible horizontal text now detects a uniform paragraph, wraps
  replacements inside its width and preserves explicit paragraph breaks. A
  longer first word can move following words and lines instead of overlapping
  them. Soft wraps are recomputed rather than saved as explicit newlines.
- Saved replacements remain normal searchable PDF text and can be selected and
  edited again. Export uses the font's actual glyph advances to avoid treating
  kerning that is not emitted into the PDF as available space.
- Print controls now expose the native planner's Size, Multiple, Poster and
  Booklet layouts. Preview and output use the same layout options. Added custom
  scaling, shrink oversized pages, automatic rotation, grid dimensions, poster
  overlap and copy collation. Windows uncollated duplex copies retain front/back
  pairs; collated copies of odd-length jobs receive a blank back between copies.
- F10 and arrow keys operate the application menus; Escape returns to a parent
  menu and then its trigger. Space activates focused buttons. F6 cycles visible
  workspace panes, Ctrl+Shift+N focuses Go to Page, and document page/screen keys
  are scoped away from inputs and controls. Document tabs support arrow/Home/End
  navigation.
- Internal links and bookmarks now handle zero-based numeric destinations,
  including page zero, as well as named destinations and indirect references.

Paragraph grouping deliberately excludes mixed styling, rotation, shearing and
ambiguous geometry. Those cases retain line editing. Mixed-font runs and reflow
into another page or independent box are not supported.
Browser preview font metrics can differ slightly from exported font metrics.

## Reference evidence and limits

The official Windows package was acquired from Adobe's
[64-bit installer page](https://helpx.adobe.com/acrobat/kb/download-64-bit-installer.html).
Its SHA-256 and REA evidence identifiers are retained in
[the evidence index](acrobat-study/2026-10-24/evidence.json).

REA 6.4.0 inspected the ZIP's artifact graph and the resource tables in
`Acrobat.dll`, `acrobatres.dll` and `AcroForm.api`. Separate package inspection
found 41 tool manifests declaring 170 command names. These establish package
structure and declarations, not that a tool is licensed, runnable or implemented
in a particular way. Resource payloads were not decoded into a complete UI.

**The base files extracted from Core.cab are version 21.1.20135.421056.** The
download also contains `AcrobatDCx64Upd2600222031.msp`; that patch was not applied.
The base resource inventory must not be presented as the current 2026 Acrobat
interface. Adobe Setup was not run, no paid Pro session was observed, and no
native decompiler was available. No Adobe code, icons or binaries were copied
into this project or its releases.

Adobe's [SDK overview](https://developer.adobe.com/acrobat-pdfl-sdk/guides/overview/)
documents distinct viewer, document and lower-level object APIs. Its
[PDFEdit API](https://opensource.adobe.com/dc-acrobat-sdk-docs/acrobatsdk/apireference/package-summary.html)
describes page-content objects. These public interfaces inform architecture;
they do not disclose Acrobat's private layout, OCR or conversion algorithms.

The user-requested Reddit review included
[editing alternatives discussed on r/Piracy](https://www.reddit.com/r/Piracy/comments/1dp3lnc),
[workflow complaints on r/pdf](https://www.reddit.com/r/pdf/comments/1thi7o7/adobe_acrobat_is_completely_breaking_my_workflow/)
and [OCR accuracy reports](https://www.reddit.com/r/pdf/comments/1wg1wbe/trying_to_accurately_ocr_a_pdf/).
These are unverified user reports used to prioritize font/layout, shortcut and
recognition tests. They are not evidence of Adobe's implementation. No cracked
packages were downloaded or executed.

## Remaining work

The following assessment covers the reviewed renderer tools and native engine;
it is not an exhaustive inventory of every Acrobat edition or cloud service.
“Partial” means an existing workflow has material limitations, not parity.

| Area                               | Current state                                              | Work still required                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing text                      | Partial; compatible paragraphs now wrap                    | Mixed-font runs, complex/RTL/vertical scripts, reliable geometric grouping across arbitrary PDFs and visual save/reopen fidelity corpus.                                                                  |
| Text formatting                    | Font/size/color and basic styles                           | Paragraph alignment, lists, character/horizontal scaling, super/subscript, advanced spacing, rotation and mixed-format box geometry. Uniform horizontal boxes support movement and width resizing.                                                                          |
| Fonts                              | Embedded, installed and bundled alternatives               | Reliable shaping and fallback across more scripts; incomplete subset fonts cannot supply glyphs they never contained. Proprietary Adobe fonts are not bundled.                                            |
| Original images/objects            | Adding images and selecting app annotations                | Selecting, replacing, moving, cropping and removing arbitrary existing page-content objects while preserving clipping and backgrounds.                                                                    |
| OCR                                | Offline English, two models and layout choices             | Language selection/models, deskew/rotation, difficult scans, tables, recognition correction and quantitative accuracy/selection tests. The native pipeline currently requests `eng`.                      |
| Flattened mark removal             | Region removal with background reconstruction              | General image reconstruction cannot guarantee clean recovery of content obscured by a mark; more scanned and textured-background cases need coverage.                                                     |
| Printing                           | Native layout previews and basic printer settings          | Tall booklet binding and sheet intervals, poster labels/cut marks, comment/form print selection, driver properties, advanced color/production options and physical-printer tests. |
| Page organization                  | Combine, insert blank, reorder, rotate, extract, delete    | Crop-box workflow, headers/footers, page numbering, backgrounds, watermarks and Bates numbering.                                                                                                          |
| Forms                              | Supported AcroForm filling                                 | Field authoring/detection, calculations, validation, tab ordering, broader appearance handling and XFA compatibility.                                                                                     |
| Passwords/security                 | Authenticated editing and encryption-preserving saves | New protection/password-setting UI and read-only restricted viewing. Restricted edits require the owner permissions password. Permissions are not certificate trust validation.                                |
| Redaction/sanitization             | Genuine content removal                                    | A separately audited whole-document sanitation workflow covering hidden metadata, attachments, layers and active content, plus adversarial redaction tests.                                               |
| Certificate signatures             | P12/PFX signing route                                      | Timestamping, multiple signatures, chain/revocation validation, trust UI, long-term validation and a representative signed-document corpus.                                                               |
| Conversion                         | Text-oriented Word export; optional LibreOffice import     | High-fidelity layout conversion to Word, Excel and PowerPoint; broader export/import formats and conformance conversions.                                                                                 |
| Optimize PDF                       | Basic rewrite/compression                                  | Size audit, configurable image downsampling/recompression, font and object optimization with quality controls.                                                                                            |
| Accessibility                      | Basic reader interface                                     | Tags, reading order, alt text, PDF/UA checks/repair, reading reflow and read-aloud workflows.                                                                                                             |
| Search                             | Current-document results and filters                       | Folder/multiple-document search, indexing and richer advanced search.                                                                                                                                     |
| Navigation                         | Thumbnails, outline and attachment viewing                 | Bookmark authoring, link authoring, optional-content/layer management and richer destination behavior.                                                                                                    |
| Document comparison                | No comparable reviewed workflow                            | Text/visual comparison and a reviewable change report.                                                                                                                                                    |
| Batch automation                   | No comparable reviewed workflow                            | Action pipelines, batch conversion/OCR and repeatable error reporting.                                                                                                                                    |
| Print production / specialist PDFs | No comparable reviewed toolset                             | Preflight, color separations, PDF/X and PDF/A validation, measurement/geospatial, portfolio, 3D and multimedia workflows.                                                                                 |
| Collaboration / cloud e-sign       | Local annotations and signing                              | Sharing identities, review state, notifications, audit trails and service infrastructure; these are separate products/services.                                                                           |
| UI and accessibility               | Existing React workspace with improved keyboard operation  | Systematic screen-by-screen comparison, menu coverage, screen-reader testing, small-screen/high-DPI layouts and dialog focus audits.                                                                      |
| Desktop quality                    | Automated Windows checks listed below                      | Stock Linux Wayland/X11, physical trackpads/printers, larger and malformed PDF corpora, longer memory/performance measurements and installer/package validation of these new changes.                     |

Adobe's own [text-editing documentation](https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html)
describes independent text boxes: reflow inside a box does not push other boxes
or flow into another page. The new conservative paragraph behavior follows
that model. The remaining formatting and geometry scope is illustrated by
[format text](https://helpx.adobe.com/ca/acrobat/desktop/edit-documents/edit-text-in-pdfs/format-text.html)
and [adjust text boxes](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/adjust-text-boxes.html).

Print references: [Size](https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/page-size.html),
[Multiple](https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/multiple-pages.html),
[Poster](https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/large-documents.html),
[Booklet](https://helpx.adobe.com/acrobat/desktop/print-documents/booklets-posters-banners/print-booklets.html).
Other references: [keyboard shortcuts](https://helpx.adobe.com/acrobat/desktop/get-started/preferences-and-settings/keyboard-shortcuts.html),
[accessibility checks](https://helpx.adobe.com/uk/acrobat/using/create-verify-pdf-accessibility.html)
and [edition comparison](https://www.adobe.com/acrobat/pricing/compare-versions.html).

## Validation of this pass

- Renderer build and web TypeScript check passed.
- The paragraph/print helpers, new tests and WebView suite pass ESLint with
  zero warnings. The wider navigation/viewer lint run still reports 11 existing
  errors, also reproduced from the baseline source; repository-wide lint is
  not clean.
- Frontend: **168 passed, one optional LibreOffice test skipped**, across 32 test files.
- Rust: **34 passed** (11 desktop, 23 native core).
- Windows WebView2: **68 checks passed** across the new Acrobat-workflow suite
  (17), selection (12), input/print/save/update interactions (28), editing
  regression (8) and certificate/mixed-page fit stability (3).
- Paragraph tests include saving, reopening, a second edit without duplicate
  original text, hard/soft breaks, unchanged independent boxes/pages and glyph
  advances. Interaction tests include trusted double/triple click, long drag
  selection, wheel input, printer fallback, changed preview layout and repeated
  edit/open/close cleanup.

Windows tests run an isolated development build using real WebView2 and trusted
keyboard/pointer delivery where supported by the harness. The print destination
tests use a mocked printer inventory; they do not establish physical output.
Bounded lifecycle/font checks passed, but are not proof that all memory leaks
are absent. No new Linux packages, stock desktops or installer builds were
validated in this pass. Earlier release checks remain documented separately in
[v2.0.0 validation](releases/v2.0.0/VALIDATION.md).

Raw local outputs live under ignored `release/acrobat-study-2026-10-24/` and
`release/native-validation/oct24/`; the final print visual check is under
`release/native-validation/oct24-final/`. A compact check summary is retained
alongside the evidence index. Full parity requires implementing the remaining
work and validating it against licensed current Acrobat behavior and a much
broader document/hardware corpus.
