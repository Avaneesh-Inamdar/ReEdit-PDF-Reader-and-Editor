// Soft wraps never become hard newlines in the stored text. Re-editing or
// changing a box's typography can therefore reflow in either direction.
export function wrapTextBox(
  text: string,
  width: number | undefined,
  measure: (text: string) => number
): string[] {
  const paragraphs = text.split(/\r\n|[\r\n]/)
  if (!width || !Number.isFinite(width) || width <= 0) return paragraphs
  return paragraphs.flatMap((paragraph) => {
    if (!paragraph) return ['']
    const lines: string[] = []
    let line = ''
    for (const token of paragraph.match(/[^ \t]+|[ \t]+/gu) || []) {
      if (measure(line + token) <= width) {
        line += token
        continue
      }
      if (/^[ \t]+$/.test(token)) {
        if (line) lines.push(line.trimEnd())
        line = ''
        continue
      }
      if (line) {
        lines.push(line.trimEnd())
        line = ''
      }
      // Keep accents, surrogate pairs and emoji sequences together.
      const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(token)
      for (const { segment: character } of characters) {
        if (line && measure(line + character) > width) {
          lines.push(line)
          line = ''
        }
        line += character
      }
    }
    if (line || !lines.length) lines.push(line)
    return lines
  })
}
