import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { adjustTextBox, textBoxPointerDelta } from '../src/renderer/src/lib/textBoxGeometry'
import { wrapTextBox } from '../src/renderer/src/lib/textBoxLayout'
import { bakeAnnotationsToPdf } from '../src/renderer/src/lib/pdfEditing'
import { textRemovalRegions } from '../src/renderer/src/lib/textRemoval'
import { removePdfContent } from '../src/main/pdfEngine'
import { getPdfJsDoc } from './helpers'
import type { PdfTextRun } from '../src/renderer/src/lib/pdfText'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'

const source: PdfTextRun = {
  key: '1:0',
  text: 'Original paragraph',
  x: 72,
  y: 700,
  width: 120,
  size: 12,
  ascent: 10,
  descent: 2,
  angle: 0,
  fontFamily: 'Helvetica',
  color: '#992233',
  textBox: { width: 120, lineHeight: 15 }
}

describe('text box geometry', () => {
  it.each([
    [[2, 0, 0, 2, 100, 100], 20, 10, { x: 10, y: 5 }],
    [[0, 2, -2, 0, 0, 0], -10, 20, { x: 10, y: 5 }],
    [[-2, 0, 0, -2, 0, 0], -20, -10, { x: 10, y: 5 }],
    [[0, -2, 2, 0, 0, 0], 10, -20, { x: 10, y: 5 }]
  ])('converts screen drag to local points at every page rotation', (matrix, x, y, expected) => {
    expect(textBoxPointerDelta(matrix as number[], x as number, y as number)).toEqual(expected)
  })
  it('moves and resizes from either side without changing text, font or original masks', () => {
    const moved = adjustTextBox(source, 'move', 20, -10)
    expect(moved).toMatchObject({
      x: 92,
      y: 710,
      size: 12,
      fontFamily: 'Helvetica',
      color: '#992233'
    })
    expect(adjustTextBox(moved, 'left', 30)).toMatchObject({
      x: 122,
      y: 710,
      width: 90,
      textBox: { width: 90, lineHeight: 15 }
    })
    expect(adjustTextBox(moved, 'right', 30)).toMatchObject({ x: 92, width: 150 })
    expect(source).toMatchObject({ x: 72, y: 700, width: 120, textBox: { width: 120 } })
  })
  it('clamps either edge and ignores invalid or unsupported transformations', () => {
    expect(adjustTextBox(source, 'left', 999)).toMatchObject({ x: 168, width: 24 })
    expect(adjustTextBox(source, 'right', -999)).toMatchObject({ x: 72, width: 24 })
    expect(adjustTextBox(source, 'move', NaN)).toBe(source)
    const rotated = { ...source, angle: Math.PI / 2 }
    expect(adjustTextBox(rotated, 'right', 30)).toBe(rotated)
    expect(textBoxPointerDelta([0, 0, 0, 0], 10, 10)).toEqual({ x: 0, y: 0 })
  })
  it('rewraps in either direction at the same font size', () => {
    const text = 'one two three four',
      measure = (value: string): number => value.length * 6
    const narrow = adjustTextBox(source, 'right', -60)
    expect(wrapTextBox(text, narrow.textBox!.width, measure)).toEqual(['one two', 'three four'])
    expect(wrapTextBox(text, adjustTextBox(narrow, 'right', 60).textBox!.width, measure)).toEqual([
      text
    ])
    expect(narrow.size).toBe(source.size)
  })
  it.each([false, true])(
    'saves moved, narrowed text with original removal bounds and no handle artwork (flatten=%s)',
    async (flatten) => {
      const pdf = await PDFDocument.create(),
        font = await pdf.embedFont(StandardFonts.Helvetica),
        page = pdf.addPage([612, 792])
      page.drawText(source.text, { x: source.x, y: source.y, size: 12, font })
      page.drawText('Independent', { x: 350, y: 700, size: 12, font })
      const moved = adjustTextBox(adjustTextBox(source, 'move', 30, 20), 'right', -40)
      const annotation: Annotation = {
        id: 'move',
        page: 1,
        type: 'text',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        color: source.color!,
        strokeWidth: 0,
        opacity: 1,
        sourceText: moved,
        maskTexts: [source],
        text: 'Reflowed paragraph moves and retains its size',
        fontSize: 12
      }
      expect(textRemovalRegions([annotation])[0].quad?.[0]).toBe(72)
      const clean = await removePdfContent(
        await pdf.save(),
        textRemovalRegions([annotation]),
        false
      )
      const bytes = await bakeAnnotationsToPdf(
        clean.slice().buffer as ArrayBuffer,
        [annotation],
        [],
        { flatten }
      )
      const doc = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
      try {
        const content = await (await doc.getPage(1)).getTextContent()
        const items = content.items.filter((item) => 'str' in item && item.str)
        const edited = items.filter((item) => 'transform' in item && item.transform[4] < 300)
        expect(edited.length).toBeGreaterThan(2)
        for (const [index, item] of edited.entries()) {
          if (!('transform' in item)) continue
          expect(item.transform[0]).toBeCloseTo(12)
          expect(item.transform.slice(4)).toEqual([102, 680 - index * 15])
          expect(item.width).toBeLessThanOrEqual(80.1)
        }
        expect(items.map((item) => ('str' in item ? item.str : '')).join(' ')).not.toContain(
          'Original'
        )
        expect(items.find((item) => 'str' in item && item.str === 'Independent')).toMatchObject({
          transform: [12, 0, 0, 12, 350, 700]
        })
        const saved = await PDFDocument.load(bytes)
        expect(saved.getPage(0).node.Annots()?.size() || 0).toBe(0)
      } finally {
        await doc.destroy()
      }
    }
  )
})
