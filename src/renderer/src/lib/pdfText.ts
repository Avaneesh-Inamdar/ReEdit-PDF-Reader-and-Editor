export interface PdfTextRun {
  key: string
  text: string
  x: number
  y: number
  width: number
  size: number
  ascent: number
  descent: number
  angle: number
  fontFamily: string
  previewFont?: string
  fontData?: Uint8Array
  fontGlyphs?: Record<string, string>
  fontGlyphWidths?: Record<string, number>
  color?: string
  bold?: boolean
  italic?: boolean
  characterSpacing?: number
  wordSpacing?: number
  // Normalized PDF text matrix, including horizontal stretch and shear.
  matrix?: number[]
  vertical?: boolean
  pdfAnnotationId?: string
}

export function textRun(
  item: { str: string; transform: number[]; width: number; height?: number; fontName: string },
  style: { ascent?: number; descent?: number; fontFamily?: string; vertical?: boolean },
  key: string
): PdfTextRun | null {
  if (!item.str.trim()) return null
  const [a, b, c, d, x, y] = item.transform
  const size = Math.hypot(c, d)
  const extent = style.vertical ? item.height || item.width : item.width
  if (!size || !extent) return null
  const family = style.fontFamily || ''
  return {
    key,
    text: item.str,
    x,
    y,
    width: extent / (Math.hypot(a, b) / size || 1),
    size,
    ascent: (style.ascent ?? 0.8) * size,
    descent: Math.abs(style.descent ?? -0.2) * size,
    angle: Math.atan2(b, a) - (style.vertical ? Math.PI / 2 : 0),
    matrix: style.vertical ? [-c / size, -d / size, a / size, b / size] : [a / size, b / size, c / size, d / size],
    vertical: !!style.vertical,
    fontFamily: /mono/i.test(family)
      ? 'Courier'
      : /serif/i.test(family) && !/sans/i.test(family)
        ? 'Times-Roman'
        : 'Helvetica'
  }
}

// SVG local coordinates point down, PDF coordinates point up. Compose both with the viewport.
export function textMatrix(run: PdfTextRun, viewport: number[]): number[] {
  const [ra, rb, rc, rd] = run.matrix || [Math.cos(run.angle), Math.sin(run.angle), -Math.sin(run.angle), Math.cos(run.angle)]
  const [a, b, c, d, e, f] = viewport
  return [
    a * ra + c * rb,
    b * ra + d * rb,
    -(a * rc + c * rd),
    -(b * rc + d * rd),
    a * run.x + c * run.y + e,
    b * run.x + d * run.y + f
  ].map(value => value || 0)
}
