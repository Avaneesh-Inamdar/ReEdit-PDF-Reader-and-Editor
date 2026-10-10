import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { textMatrix, textRun } from '../src/renderer/src/lib/pdfText'
import { bakeAnnotationsToPdf } from '../src/renderer/src/lib/pdfEditing'

describe('existing PDF text', () => {
  const item = {
    str: 'Original heading',
    transform: [24, 0, 0, 24, 72, 700],
    width: 200,
    fontName: 'font'
  }
  it('uses the source baseline, width and font metrics rather than list positions', () => {
    const run = textRun(item, { ascent: 0.75, descent: -0.25 }, '1:0')!
    expect(run).toMatchObject({ x: 72, y: 700, width: 200, size: 24, ascent: 18, descent: 6 })
    expect(textMatrix(run, [2, 0, 0, -2, 0, 1584])).toEqual([2, 0, 0, 2, 144, 184])
    expect(textMatrix(run, [0, 2, 2, 0, 0, 0])).toEqual([0, 2, -2, 0, 1400, 144])
  })
  it('detects vertical text using its height instead of silently dropping it', () => {
    const run = textRun({ ...item, str: '縦書き', width: 0, height: 72 }, { vertical: true }, '1:1')!
    expect(run).toMatchObject({ text: '縦書き', width: 72, vertical: true })
    expect(run.angle).toBeCloseTo(-Math.PI / 2)
  })
  it('rejects missing original Arial Narrow outlines instead of substituting Helvetica', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage()
    const run = { ...textRun(item, {}, '1:0')!, fontFamily: 'ArialNarrow' }
    await expect(bakeAnnotationsToPdf((await pdf.save()).buffer as ArrayBuffer, [{ id: 'missing', page: 1, type: 'text', x: 0, y: 0, w: 0, h: 0, text: 'Replacement', color: '#000000', opacity: 1, strokeWidth: 0, sourceText: run, fontFamily: 'ArialNarrow' }], [])).rejects.toThrow('does not embed ArialNarrow')
  })

  it('preserves paragraph line spacing without painting white cover boxes', async () => {
    const document = await PDFDocument.create()
    document.addPage([612, 792])
    const first = textRun(
      { ...item, str: 'First line', width: 80, transform: [12, 0, 0, 12, 72, 700] },
      {},
      '1:0:0-10'
    )!
    const second = { ...first, key: '1:1:0-11', text: 'Second line', y: 680 }
    const bytes = await bakeAnnotationsToPdf(
      (await document.save()).slice().buffer as ArrayBuffer,
      [
        {
          id: 'paragraph',
          page: 1,
          type: 'text',
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          text: 'Changed first\nChanged second',
          color: '#000000',
          opacity: 1,
          strokeWidth: 0,
          sourceText: first,
          maskTexts: [first, second],
          lineHeight: 20
        }
      ],
      []
    )
    const saved = await PDFDocument.load(bytes)
    const contents = saved.getPage(0).node.Contents()!
    const streams =
      'size' in contents
        ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index))
        : [contents]
    const operations = streams
      .filter((stream) => stream instanceof PDFRawStream)
      .map((stream) =>
        new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode())
      )
      .join('\n')
    expect(operations).not.toContain('1 1 1 rg')
    expect(operations).toContain('20 TL')
    expect(operations).toContain(Buffer.from('Changed second').toString('hex').toUpperCase())
  })

  it('saves replacements at the source baseline without covering the background in either save mode', async () => {
    const document = await PDFDocument.create()
    document.addPage([612, 792]).drawText(item.str, { x: 72, y: 700, size: 24 })
    const source = (await document.save()).slice().buffer as ArrayBuffer
    for (const flatten of [false, true]) {
      const bytes = await bakeAnnotationsToPdf(
        source,
        [
          {
            id: 'edit',
            page: 1,
            type: 'text',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            text: 'Updated heading',
            fontSize: 24,
            color: '#000000',
            strokeWidth: 0,
            opacity: 1,
            sourceText: textRun(item, { ascent: 0.75, descent: -0.25 }, '1:0')!
          }
        ],
        [],
        { flatten }
      )
      const saved = await PDFDocument.load(bytes)
      const streams = saved.getPage(0).node.Contents()!
      const contents =
        'size' in streams
          ? Array.from({ length: streams.size() }, (_, index) => streams.lookup(index))
          : [streams]
      const operations = contents
        .filter((s) => s instanceof PDFRawStream)
        .map((s) => new TextDecoder().decode(decodePDFRawStream(s as PDFRawStream).decode()))
        .join('\n')
      expect(operations).not.toContain('71.5 693.5 cm')
      expect(operations).toContain('1 0 0 1 72 700 Tm')
      expect(operations).toContain(Buffer.from('Updated heading').toString('hex').toUpperCase())
    }
  })
})
