import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument as MuPdfDocument } from 'mupdf'
import { drawReplacementText } from '../src/renderer/src/lib/pdfTextDrawing'
import { replacementSpacing } from '../src/renderer/src/lib/textSpacing'
import { suggestedFont, alternativeFontLabel } from '../src/renderer/src/lib/fontAlternatives'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'

function annotation(): Annotation {
  return {
    id: 'spacing',
    page: 1,
    type: 'text',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    color: '#000000',
    strokeWidth: 0,
    opacity: 1,
    text: 'AB CD',
    fontSize: 12,
    fontFamily: 'Arimo',
    sourceText: {
      key: '1:0',
      text: 'AB CD',
      x: 72,
      y: 700,
      width: 90,
      size: 12,
      ascent: 10,
      descent: 2,
      angle: 0,
      fontFamily: 'Arimo',
      wordSpacing: 4,
      characterSpacing: 0.5
    }
  }
}

describe('replacement text spacing', () => {
  it('preserves source spacing at the original size and scales it when resizing', () => {
    const value = annotation()
    expect(replacementSpacing(value)).toEqual({ character: 0.5, word: 4 })
    value.fontSize = 24
    expect(replacementSpacing(value)).toEqual({ character: 1, word: 8 })
  })
  it('uses the new face’s natural spacing when the font or style changes', () => {
    expect(replacementSpacing({ ...annotation(), fontFamily: 'Tinos' })).toEqual({
      character: 0,
      word: 0
    })
    expect(replacementSpacing({ ...annotation(), bold: true })).toEqual({ character: 0, word: 0 })
    expect(replacementSpacing({ ...annotation(), fontData: new Uint8Array(4) })).toEqual({
      character: 0,
      word: 0
    })
  })
  it.each(['standard', 'embedded'])(
    'saves the same visible word spacing with a %s font',
    async (kind) => {
      const pdf = await PDFDocument.create()
      pdf.registerFontkit(fontkit)
      const font =
        kind === 'standard'
          ? await pdf.embedFont(StandardFonts.Helvetica)
          : await pdf.embedFont(
              readFileSync('src/renderer/src/assets/fonts/arimo-latin-400-normal.woff'),
              { subset: true }
            )
      const page = pdf.addPage()
      drawReplacementText(page, annotation(), font, rgb(0, 0, 0), 72, 700)
      const doc = new MuPdfDocument(await pdf.save()),
        loaded = doc.loadPage(0),
        text = loaded.toStructuredText('')
      try {
        const positions = new Map<string, number>()
        text.walk({
          onChar(char, origin) {
            positions.set(char, origin[0])
          }
        })
        const expected = font.widthOfTextAtSize('AB ', 12) + 3 * 0.5 + 4
        expect(positions.get('C')! - positions.get('A')!).toBeCloseTo(expected, 3)
        expect(text.asText()).toContain('AB CD')
      } finally {
        text.destroy()
        loaded.destroy()
        doc.destroy()
      }
    }
  )
  it('does not carry wide justified spaces into the selected replacement font in a saved PDF', async () => {
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica)
    const value = { ...annotation(), fontFamily: 'Helvetica' }
    value.sourceText!.wordSpacing = 30
    drawReplacementText(pdf.addPage(), value, font, rgb(0, 0, 0), 72, 700)
    const doc = new MuPdfDocument(await pdf.save()),
      loaded = doc.loadPage(0),
      text = loaded.toStructuredText('')
    try {
      const positions = new Map<string, number>()
      text.walk({
        onChar(char, origin) {
          positions.set(char, origin[0])
        }
      })
      expect(positions.get('C')! - positions.get('A')!).toBeCloseTo(
        font.widthOfTextAtSize('AB ', 12),
        3
      )
    } finally {
      text.destroy()
      loaded.destroy()
      doc.destroy()
    }
  })
})

describe('open-source font suggestions', () => {
  it.each([
    ['ABCDEF+Arial-Bold', 'Arimo'],
    ['TimesNewRomanPSMT', 'Tinos'],
    ['CourierNewPSMT', 'Cousine'],
    ['Calibri', 'Carlito'],
    ['Cambria-Italic', 'Caladea'],
    ['ArialNarrow', 'Roboto Condensed'],
    ['MyriadPro-Regular', 'Source Sans 3'],
    ['MinionPro-Regular', 'Source Serif 4']
  ])('suggests an alternative to %s', (original, replacement) => {
    expect(suggestedFont(original)).toBe(replacement)
  })
  it('labels alternatives without renaming them as proprietary fonts', () => {
    expect(alternativeFontLabel('Carlito')).toBe('Carlito · alternative to Calibri')
    expect(alternativeFontLabel('Noto Sans')).toBe('Noto Sans')
    expect(suggestedFont('UnrelatedCustomFont')).toBeUndefined()
  })
})
