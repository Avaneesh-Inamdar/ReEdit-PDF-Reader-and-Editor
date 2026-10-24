import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  connectedTextBox,
  connectedTextLine,
  textBoxSource,
  textBoxText
} from '../src/renderer/src/lib/textLine'
import { wrapTextBox } from '../src/renderer/src/lib/textBoxLayout'
import { textRun, type PdfTextRun } from '../src/renderer/src/lib/pdfText'
import { bakeAnnotationsToPdf } from '../src/renderer/src/lib/pdfEditing'
import { textRemovalRegions } from '../src/renderer/src/lib/textRemoval'
import { removePdfContent } from '../src/main/pdfEngine'
import { getPdfJsDoc } from './helpers'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'

const run = (key: string, text: string, y: number, width = 120, x = 72): PdfTextRun => ({
  key,
  text,
  x,
  y,
  width,
  size: 12,
  ascent: 10,
  descent: 2,
  angle: 0,
  fontFamily: 'Helvetica'
})

describe('conservative paragraph inference', () => {
  it('joins aligned body lines, including a short final line, from any clicked line', () => {
    const lines = [
      run('1:0', 'First line', 700),
      run('1:1', 'Second line', 685),
      run('1:2', 'End.', 670, 20)
    ]
    const unrelated = [
      run('1:3', 'Column', 700, 120, 350),
      run('1:4', 'Independent box', 630),
      run('2:0', 'Next page', 655)
    ]
    for (const clicked of lines) {
      const box = connectedTextBox(clicked, [...lines, ...unrelated])
      expect(box.flat()).toEqual(lines)
      expect(textBoxText(box)).toBe('First line Second line End.')
      expect(textBoxSource(box)).toMatchObject({
        x: 72,
        y: 700,
        size: 12,
        textBox: { width: 120, lineHeight: 15 }
      })
    }
  })
  it('stops at a short terminal line followed by a wider aligned paragraph', () => {
    const runs = [
      run('1:0', 'First', 700),
      run('1:1', 'End.', 685, 40),
      run('1:2', 'New paragraph', 670)
    ]
    expect(connectedTextBox(runs[0], runs).flat()).toEqual(runs.slice(0, 2))
    expect(connectedTextBox(runs[2], runs).flat()).toEqual([runs[2]])
  })
  it('keeps mixed-style words in separate edits without jumping over the styled word', () => {
    const runs = [
      run('1:0', 'Plain', 700, 30),
      { ...run('1:1', 'bold', 700, 24, 105), bold: true },
      run('1:2', 'plain', 700, 30, 132),
      run('1:3', 'Next line', 685)
    ]
    expect(connectedTextLine(runs[0], runs)).toEqual([runs[0]])
    expect(connectedTextBox(runs[0], runs)).toEqual([[runs[0]]])
  })
  it('does not impose one line spacing on lines with inconsistent baselines', () => {
    const runs = [run('1:0', 'First', 700), run('1:1', 'Second', 685), run('1:2', 'Third', 667)]
    expect(connectedTextBox(runs[1], runs)).toEqual([[runs[1]]])
  })
  it.each([
    { bold: true },
    { fontFamily: 'Times-Roman' },
    { size: 14 },
    { characterSpacing: 1 },
    { matrix: [0.8, 0, 0, 1] },
    { vertical: true },
    { pdfAnnotationId: '10R' }
  ])('does not merge incompatible typography or geometry %j', (patch) => {
    const first = run('1:0', 'First', 700),
      second = { ...run('1:1', 'Second', 685), ...patch }
    expect(connectedTextBox(first, [first, second]).flat()).toEqual([first])
  })
})

describe('text box layout', () => {
  const measure = (text: string): number => Array.from(text).length * 10
  it('wraps words without modifying stored text and can reflow shorter text back up', () => {
    const text = 'one two three four'
    expect(wrapTextBox(text, 80, measure)).toEqual(['one two', 'three', 'four'])
    expect(wrapTextBox(text.replace('two three ', ''), 80, measure)).toEqual(['one four'])
    expect(text).toBe('one two three four')
  })
  it('retains explicit newlines and blank paragraphs; long words keep Unicode characters intact', () => {
    expect(wrapTextBox('one\n\ntwo\r\nthree', 80, measure)).toEqual(['one', '', 'two', 'three'])
    expect(wrapTextBox('abcdef😀h', 30, measure)).toEqual(['abc', 'def', '😀h'])
    expect(wrapTextBox('a\u0301b\u0301', 20, measure)).toEqual(['a\u0301', 'b\u0301'])
    expect(wrapTextBox('unwrapped text', undefined, measure)).toEqual(['unwrapped text'])
  })
})

describe('paragraph save and re-edit', () => {
  it.each([false, true])(
    'saves reflow at the same size/baseline, preserves other boxes and page 2, and re-edits without duplicates (flatten=%s)',
    async (flatten) => {
      const pdf = await PDFDocument.create(),
        font = await pdf.embedFont(StandardFonts.Helvetica)
      const page = pdf.addPage([612, 792])
      const originals = [
        'Original paragraph first',
        'Original paragraph next',
        'Original paragraph end'
      ]
      const runs = originals.map((text, index) =>
        run(`1:${index}`, text, 700 - index * 15, font.widthOfTextAtSize(text, 12))
      )
      for (const part of runs) page.drawText(part.text, { x: part.x, y: part.y, size: 12, font })
      page.drawText('Independent box', { x: 350, y: 700, size: 12, font })
      pdf.addPage([612, 792]).drawText('Second page stays', { x: 72, y: 700, size: 12, font })
      const box = connectedTextBox(runs[1], runs)
      expect(box).toHaveLength(3)
      const annotation: Annotation = {
        id: 'paragraph',
        page: 1,
        type: 'text',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        color: '#000000',
        strokeWidth: 0,
        opacity: 1,
        sourceText: textBoxSource(box),
        maskTexts: box.flat(),
        text: 'Changed paragraph contains several extra words that should wrap within the original box and keep the same font size.'
      }
      const cleaned = await removePdfContent(
        await pdf.save(),
        textRemovalRegions([annotation]),
        false
      )
      const bytes = await bakeAnnotationsToPdf(
        cleaned.slice().buffer as ArrayBuffer,
        [annotation],
        [],
        { flatten }
      )
      const doc = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
      try {
        expect(doc.numPages).toBe(2)
        const firstPage = await doc.getPage(1),
          content = await firstPage.getTextContent()
        const items = content.items.filter(
          (
            item
          ): item is typeof item & {
            str: string
            transform: number[]
            width: number
            fontName: string
          } => 'str' in item && !!item.str
        )
        const edited = items.filter((item) => item.transform[4] < 300)
        expect(edited.length).toBeGreaterThan(3)
        expect(items.map((item) => item.str).join(' ')).not.toContain('Original')
        expect(items.find((item) => item.str === 'Independent box')?.transform.slice(4)).toEqual([
          350, 700
        ])
        for (const [index, item] of edited.entries()) {
          expect(item.transform[0]).toBeCloseTo(12, 3)
          expect(item.transform[4]).toBeCloseTo(72, 3)
          expect(item.transform[5]).toBeCloseTo(700 - index * 15, 3)
          expect(item.width).toBeLessThanOrEqual(annotation.sourceText!.textBox!.width + 0.1)
        }
        const secondPage = await doc.getPage(2),
          second = await secondPage.getTextContent()
        expect(
          second.items
            .filter((item) => 'str' in item)
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
        ).toBe('Second page stays')
        const reopened = edited.map((item, index) =>
          textRun(item, content.styles[item.fontName], `1:${index}`)!
        )
        const reopenedBox = connectedTextBox(reopened[1], reopened)
        expect(reopenedBox.flat()).toHaveLength(reopened.length)
        const next = {
          ...annotation,
          sourceText: textBoxSource(reopenedBox),
          maskTexts: reopenedBox.flat(),
          text: 'Short replacement'
        }
        const removed = await removePdfContent(bytes, textRemovalRegions([next]), false)
        const final = await bakeAnnotationsToPdf(removed.slice().buffer as ArrayBuffer, [next], [])
        const finalDoc = await getPdfJsDoc(final.slice().buffer as ArrayBuffer)
        try {
          const finalContent = await (await finalDoc.getPage(1)).getTextContent()
          const text = finalContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
          expect(text).toContain('Short replacement')
          expect(text).not.toContain('Changed paragraph')
          expect(text).not.toContain('extra words')
          expect(text).toContain('Independent box')
        } finally {
          await finalDoc.destroy()
        }
      } finally {
        await doc.destroy()
      }
    }
  )
})
