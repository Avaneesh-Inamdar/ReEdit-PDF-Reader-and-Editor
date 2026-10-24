import type { PdfTextRun } from './pdfText'

export type TextBoxHandle = 'move' | 'left' | 'right'

export function adjustableTextBox(source: PdfTextRun): boolean {
  return (
    !!source.textBox &&
    !source.vertical &&
    !source.pdfAnnotationId &&
    Math.abs(source.angle) < 0.01 &&
    (!source.matrix ||
      source.matrix.every((value, index) => Math.abs(value - [1, 0, 0, 1][index]) < 0.01))
  )
}

// Convert screen pixels to the editor's unscaled coordinates, including a
// rotated page viewport. Translation does not affect a pointer displacement.
export function textBoxPointerDelta(
  matrix: number[],
  dx: number,
  dy: number
): { x: number; y: number } {
  const [a, b, c, d] = matrix,
    determinant = a * d - b * c
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.000001) return { x: 0, y: 0 }
  return { x: (d * dx - c * dy) / determinant, y: (a * dy - b * dx) / determinant }
}

// Geometry is a new source object; original mask runs keep their old bounds.
// Font size, outlines, color and line height are deliberately copied intact.
export function adjustTextBox(
  source: PdfTextRun,
  handle: TextBoxHandle,
  dx: number,
  dy = 0
): PdfTextRun {
  if (!adjustableTextBox(source) || !Number.isFinite(dx) || !Number.isFinite(dy)) return source
  const width = source.textBox!.width
  const minimum = Math.min(width, Math.max(12, source.size * 2))
  if (handle === 'move') return { ...source, x: source.x + dx, y: source.y - dy }
  const shift = handle === 'left' ? Math.min(dx, width - minimum) : 0
  const nextWidth = handle === 'left' ? width - shift : Math.max(minimum, width + dx)
  return {
    ...source,
    x: source.x + shift,
    width: nextWidth,
    textBox: { ...source.textBox!, width: nextWidth }
  }
}
