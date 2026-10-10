import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { fontkitForPdfGlyphs } from '../src/renderer/src/lib/embeddedFont'
import { bakeAnnotationsToPdf } from '../src/renderer/src/lib/pdfEditing'
import { PDFDocument as MuPdfDocument } from 'mupdf'
import { textRun } from '../src/renderer/src/lib/pdfText'
import { normalizeImportedFont } from '../src/main/fontImport'

const font = new Uint8Array(
  readFileSync('src/renderer/src/assets/fonts/lato-latin-700-italic.woff')
)
describe('embedded font preservation', () => {
  it('embeds imported WOFF2 outlines as real searchable text', async () => {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
    const face = await pdf.embedFont(await normalizeImportedFont(readFileSync('node_modules/@fontsource/lato/files/lato-latin-400-normal.woff2')), { subset: true })
    pdf.addPage().drawText('WOFF2 sample', { font: face, x: 72, y: 700, size: 16 })
    const document = new MuPdfDocument(await pdf.save()), page = document.loadPage(0), text = page.toStructuredText('')
    expect(text.asText().trim()).toBe('WOFF2 sample')
    text.destroy(); page.destroy(); document.destroy()
  })
  it('embeds all 32 bundled faces as searchable font outlines', async () => {
    const files = readdirSync('src/renderer/src/assets/fonts').filter((file) =>
      file.endsWith('.woff')
    )
    expect(files).toHaveLength(32)
    for (const file of files) {
      const pdf = await PDFDocument.create()
      pdf.registerFontkit(fontkit)
      const embedded = await pdf.embedFont(readFileSync('src/renderer/src/assets/fonts/' + file), {
        subset: true
      })
      pdf.addPage().drawText('Font sample 123', { font: embedded, size: 12 })
      const doc = new MuPdfDocument(await pdf.save()),
        page = doc.loadPage(0),
        text = page.toStructuredText('')
      expect(text.asText().trim(), file).toBe('Font sample 123')
      text.destroy()
      page.destroy()
      doc.destroy()
    }
  })
  it('preserves searchable Unicode when a PDF font uses remapped glyphs', async () => {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkitForPdfGlyphs({ A: 'x', B: 'y' }))
    const embedded = await pdf.embedFont(font, { subset: true })
    pdf.addPage().drawText('AB', { font: embedded, size: 17.5 })
    const doc = new MuPdfDocument(await pdf.save()),
      page = doc.loadPage(0),
      text = page.toStructuredText('')
    expect(text.asText().trim()).toBe('AB')
    text.destroy()
    page.destroy()
    doc.destroy()
  })
  it('saves original font outlines, fractional size, red color and shear', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([612, 792])
    const run = textRun(
      { str: 'Original', fontName: 'f', transform: [14, 0, 4, 17.5, 72, 700], width: 100 },
      {},
      '1:0'
    )!
    Object.assign(run, { fontFamily: 'Lato-BoldItalic', fontData: font, bold: true, italic: true })
    const output = await bakeAnnotationsToPdf(
      (await pdf.save()).slice().buffer,
      [
        {
          id: 'original-font',
          page: 1,
          type: 'text',
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          text: 'Changed',
          sourceText: run,
          fontSize: 17.5,
          fontFamily: run.fontFamily,
          bold: true,
          italic: true,
          color: '#e63946',
          opacity: 1,
          strokeWidth: 0
        }
      ],
      []
    )
    const doc = new MuPdfDocument(output),
      page = doc.loadPage(0),
      text = page.toStructuredText('')
    const glyphs: { font: string; size: number; color: number[] }[] = []
    text.walk({
      onChar(_character, _origin, font, size, _quad, color) {
        glyphs.push({ font: font.getName(), size, color })
      }
    })
    expect(text.asText()).toContain('Changed')
    expect(glyphs[0].font).toContain('Lato-BoldItalic')
    expect(glyphs[0].color[0]).toBeCloseTo(230 / 255, 3)
    text.destroy()
    page.destroy()
    doc.destroy()
  })
  it('rejects unavailable glyphs instead of silently changing the font', async () => {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkitForPdfGlyphs())
    const embedded = await pdf.embedFont(font, { subset: true })
    expect(() => embedded.encodeText('😀')).toThrow(/lacks a character/)
  })
})
