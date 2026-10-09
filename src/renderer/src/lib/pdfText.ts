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
}

export function textRun(
  item: { str: string; transform: number[]; width: number; fontName: string },
  style: { ascent?: number; descent?: number; fontFamily?: string; vertical?: boolean },
  key: string
): PdfTextRun | null {
  if (!item.str.trim() || style.vertical) return null
  const [a, b, c, d, x, y] = item.transform
  const size = Math.hypot(c, d)
  if (!size || !item.width) return null
  const family = style.fontFamily || ''
  return {
    key,
    text: item.str,
    x,
    y,
    width: item.width,
    size,
    ascent: (style.ascent ?? 0.8) * size,
    descent: Math.abs(style.descent ?? -0.2) * size,
    angle: Math.atan2(b, a),
    fontFamily: /mono/i.test(family)
      ? 'Courier'
      : /serif/i.test(family) && !/sans/i.test(family)
        ? 'Times-Roman'
        : 'Helvetica'
  }
}

// SVG local coordinates point down, PDF coordinates point up. Compose both with the viewport.
export function textMatrix(run: PdfTextRun, viewport: number[]): number[] {
  const cos = Math.cos(run.angle),
    sin = Math.sin(run.angle)
  const [a, b, c, d, e, f] = viewport
  return [
    a * cos + c * sin,
    b * cos + d * sin,
    a * sin - c * cos,
    b * sin - d * cos,
    a * run.x + c * run.y + e,
    b * run.x + d * run.y + f
  ]
}
