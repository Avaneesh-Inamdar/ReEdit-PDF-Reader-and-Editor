# Local editor fixes — 17 October 2026

These changes are in the local working tree. The published 2.0.0-alpha.1 packages
have not been replaced.

## Changes

- Keep a usable embedded font. If it cannot encode an edit, try the matching
  installed family, an open-source alternative, then a bundled face with the
  required glyphs. Explain substitutions inside the editor. Preserve size, color
  and emphasis. Cache font bytes within an editing session and retain active
  preview faces until the editor closes.
- Expand a selected word to its connected, compatible text line. Keep that word
  selected in the inline editor and replace the line together, so subsequent
  words move with the replacement. Separate columns, rotations and styles are
  not joined indiscriminately. Repeated words retain the selected occurrence.
- Accurate English OCR uses Sauvola adaptive thresholding and a second sparse
  pass. Preserve pale strokes instead of hard-whitening them. Merge additional
  words without duplicating existing OCR or native text.
- Correct conflicting top/bottom placement on the Convert menu that collapsed
  its background box while leaving buttons visible.
- Show PDF printing, copying, editing, accessibility, annotation, form and page
  assembly permissions in Document Properties and the Security Summary.
- List existing annotations and signature fields in Edit. Remove their PDF
  objects and associated field references instead of painting white rectangles.
  Support signature widgets without appearance streams and remove a certification
  pointer when its signature field is removed. PDF undo restores form state.
- Allow dragging a region with the eraser for scanned or flattened marks. Remove
  covered graphics/image pixels and reconstruct nearby paper, preserving unrelated
  graphics. This is an editing operation; use Redact for sensitive information.

## Validation

- Production UI build and TypeScript check passed.
- Frontend: 126 tests passed, one optional Office test skipped, across 24 files.
- Existing Rust core/desktop checks: 25 passed. A new native regression additionally
  verifies flattened vector removal on warm paper while preserving nearby ink.
- Real Windows WebView: opaque Convert menu, existing-object controls, selected-word
  context, automatic font substitution, retention of following words and repeat
  edit/font-face cleanup.
- Real offline OCR through the app: initially image-only paper; main text and a
  small gray footer recognized, with selection geometry for all recognized words.

Generated PDFs, screenshots and raw results are in `release/validation-oct17/`.
They use isolated settings and WebView profiles. Windows process-tree measurement
was unavailable inside the sandbox; bounded preview-font counts are a targeted
cleanup check, not a complete memory-leak assessment.

## Certificate layout stabilization

The previous build reproduced an approximately 8.4 CSS-pixel page-width
oscillation on a landscape certificate near a scrollbar threshold. It also
introduced horizontal overflow and changed zoom during continuous scrolling
between mixed page sizes.

Fit zoom now rounds down, reserves stable vertical scrollbar space, uses the
actual page-stack padding, and avoids redundant subpixel size updates. Page
dimensions come from an unscaled viewport. Continuous scrolling changes the
page indicator without repeatedly refitting to different page sizes; single-page
view still fits its active page.

The old Windows WebView build failed the layout regressions. The fixed build
passed the same single-certificate and mixed/cropped/rotated-page checks with
stable geometry and no horizontal overflow in Fit Width. The frontend suite
now passes 135 tests with one optional Office test skipped across 25 files.
Fixtures and before/after reports are in `release/validation-oct17/layout/`.

## Remaining limits

This is connected-line editing, not complete rich-text paragraph reflow. Mixed
fonts, columns, complex shaping and cross-page layout still need broader work.
Missing proprietary faces are substituted rather than redistributed. OCR is
currently English; handwriting, tables and multilingual recognition are not
complete Acrobat equivalents. Source pixels hidden by a scanned mark cannot be
recovered exactly: inspect reconstructed backgrounds before saving. Editing a
signed document changes its signed content; removing a field is not certificate
trust verification or secure sanitization.

References: [Adobe text editing](https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html)
and [Tesseract image quality and segmentation](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).
