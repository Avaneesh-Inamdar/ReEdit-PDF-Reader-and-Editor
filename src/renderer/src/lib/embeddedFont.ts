import fontkit from '@pdf-lib/fontkit'
import { mapPdfGlyphs } from './fontEncoding'

// PDF.js may remap embedded glyphs into Unicode's private-use area. Reuse its
// outlines while writing a real ToUnicode map, so edited text stays searchable.
export function fontkitForPdfGlyphs(
  encoding: Record<string, string> = {},
  widths: Record<string, number> = {}
): typeof fontkit {
  return {
    ...fontkit,
    create(data: Uint8Array) {
      const font = fontkit.create(data)
      // PDF.js removes blank glyphs from the browser cmap. The outline and
      // advance still exist in the font; restore their Unicode space mapping.
      const mappedEncoding = { ...encoding }
      if (!font.hasGlyphForCodePoint(32)) {
        const spaceWidth = ((widths[' '] ?? 250) * font.unitsPerEm) / 1000
        const lookup = font as typeof font & {
          getGlyph(index: number, characters?: number[]): ReturnType<typeof font.glyphForCodePoint>
        }
        let blank: ReturnType<typeof font.glyphForCodePoint> | null = null
        for (let index = 1; index < font.numGlyphs; index++) {
          const glyph = lookup.getGlyph(index)
          if (
            !glyph.path.toSVG() &&
            (!blank ||
              Math.abs(glyph.advanceWidth - spaceWidth) < Math.abs(blank.advanceWidth - spaceWidth))
          )
            blank = glyph
        }
        if (blank) {
          const getGlyph = lookup.getGlyph.bind(font)
          lookup.getGlyph = (index, characters) => {
            const glyph = getGlyph(index, characters)
            if (!characters?.length) return glyph
            const copy = Object.create(glyph)
            Object.defineProperty(copy, 'codePoints', { value: characters })
            return copy
          }
          const glyphForCodePoint = font.glyphForCodePoint.bind(font),
            hasGlyph = font.hasGlyphForCodePoint.bind(font)
          font.hasGlyphForCodePoint = (point) => point === 32 || hasGlyph(point)
          font.glyphForCodePoint = (point) => {
            if (point !== 32) return glyphForCodePoint(point)
            const copy = Object.create(blank)
            Object.defineProperty(copy, 'codePoints', { value: [32] })
            return copy
          }
          mappedEncoding[' '] = ' '
        }
      }
      const originalLayout = font.layout.bind(font)
      const reverse = new Map(
        Object.entries(mappedEncoding).map(([unicode, glyph]) => [glyph, unicode])
      )
      font.layout = (text, features) => {
        const mapped = mapPdfGlyphs(text, mappedEncoding)
        for (const character of mapped) {
          if (!font.hasGlyphForCodePoint(character.codePointAt(0)!))
            throw new Error(
              'The original embedded font lacks a character in your edit. Choose a bundled font or import the full font in Format.'
            )
        }
        const layout = originalLayout(mapped, features)
        layout.glyphs = layout.glyphs.map((glyph) => {
          const copy = Object.create(glyph)
          const points = glyph.codePoints.flatMap((point) =>
            Array.from(reverse.get(String.fromCodePoint(point)) || String.fromCodePoint(point)).map(
              (value) => value.codePointAt(0)!
            )
          )
          Object.defineProperty(copy, 'codePoints', { value: points })
          return copy
        })
        return layout
      }
      return font
    }
  }
}
