import { setCharacterSpacing, setWordSpacing, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { Annotation } from '../stores/useAnnotationStore'
import { replacementSpacing } from './textSpacing'
import { wrapTextBox } from './textBoxLayout'

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
  const lineHeight = annotation.lineHeight || source.textBox?.lineHeight || size * 1.2
  const spacing = replacementSpacing(annotation)
  const rawText = annotation.text || ''
  // A single run without word spacing doesn't need a space glyph. Preserve
  // that path for original subset fonts that have no encoded blank character.
  const codeBytes =
    source.textBox || (spacing.word && rawText.includes(' '))
      ? font.encodeText(' ').asBytes().length
      : 1
  const glyphWidths = new Map<string, number>()
  const advanceWidth = (value: string): number => {
    // StandardFont's widthOfTextAtSize includes pair kerning, but drawText's
    // single Tj operator doesn't position those pairs. Measure actual advances.
    if (codeBytes !== 1) return font.widthOfTextAtSize(value, size)
    return Array.from(value).reduce((total, character) => {
      if (!glyphWidths.has(character))
        glyphWidths.set(character, font.widthOfTextAtSize(character, size))
      return total + glyphWidths.get(character)!
    }, 0)
  }
  const text = wrapTextBox(
    rawText,
    source.textBox?.width,
    (value) =>
      advanceWidth(value) +
      Math.max(0, font.encodeText(value).asBytes().length / codeBytes - 1) * spacing.character +
      (value.match(/ /g)?.length || 0) * spacing.word
  ).join('\n')
  // PDF word spacing (Tw) only affects single-byte code 32. Custom embedded
  // fonts use two-byte CIDs, so position spaces explicitly for both font kinds.
  page.pushOperators(setCharacterSpacing(spacing.character), setWordSpacing(0))
  if (!spacing.word || !text.includes(' ')) {
    page.drawText(text, { x, y, size, lineHeight, font, color })
    return
  }
  for (const [lineIndex, line] of text.split(/\r\n|[\r\n]/).entries()) {
    let offset = 0
    for (const part of line.match(/ +|[^ ]+/g) || []) {
      // Draw each space separately so consecutive spaces get the same advance.
      for (const segment of part.startsWith(' ') ? Array.from(part) : [part]) {
        page.drawText(segment, { x: x + offset, y: y - lineIndex * lineHeight, size, font, color })
        const glyphCount = font.encodeText(segment).asBytes().length / codeBytes
        offset +=
          (source.textBox ? advanceWidth(segment) : font.widthOfTextAtSize(segment, size)) +
          glyphCount * spacing.character
        if (segment === ' ') offset += spacing.word
      }
    }
  }
}
