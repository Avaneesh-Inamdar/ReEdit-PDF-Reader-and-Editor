import { setCharacterSpacing, setWordSpacing, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { Annotation } from '../stores/useAnnotationStore'
import { replacementSpacing } from './textSpacing'

export function drawReplacementText(
  page: PDFPage,
  annotation: Annotation,
  font: PDFFont,
  color: RGB,
  x: number,
  y: number
): void {
  const source = annotation.sourceText!
  const size = annotation.fontSize || source.size
  const lineHeight = annotation.lineHeight || size * 1.2
  const spacing = replacementSpacing(annotation)
  const text = annotation.text || ''
  // PDF word spacing (Tw) only affects single-byte code 32. Custom embedded
  // fonts use two-byte CIDs, so position spaces explicitly for both font kinds.
  page.pushOperators(setCharacterSpacing(spacing.character), setWordSpacing(0))
  if (!spacing.word || !text.includes(' ')) {
    page.drawText(text, { x, y, size, lineHeight, font, color })
    return
  }
  const codeBytes = font.encodeText(' ').asBytes().length
  for (const [lineIndex, line] of text.split(/\r\n|[\r\n]/).entries()) {
    let offset = 0
    for (const part of line.match(/ +|[^ ]+/g) || []) {
      // Draw each space separately so consecutive spaces get the same advance.
      for (const segment of part.startsWith(' ') ? Array.from(part) : [part]) {
        page.drawText(segment, { x: x + offset, y: y - lineIndex * lineHeight, size, font, color })
        const glyphCount = font.encodeText(segment).asBytes().length / codeBytes
        offset += font.widthOfTextAtSize(segment, size) + glyphCount * spacing.character
        if (segment === ' ') offset += spacing.word
      }
    }
  }
}
