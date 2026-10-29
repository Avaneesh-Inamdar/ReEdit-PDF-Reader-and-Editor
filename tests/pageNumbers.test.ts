import { describe, expect, it } from 'vitest'
import { degrees, PDFDocument } from 'pdf-lib'
import { addPageNumbers } from '../src/renderer/src/lib/pdfEditing'
import { getPdfJsDoc } from './helpers'

async function fixture(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create()
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([240, 360])
    page.setCropBox(20, 30, 200, 300)
    page.setRotation(degrees(rotation))
  }
  return (await pdf.save()).slice().buffer as ArrayBuffer
}

describe('page numbering', () => {
  it('numbers selected pages in document order and centers footers on rotated crop boxes', async () => {
    const bytes = await addPageNumbers(await fixture(), [0, 1, 2, 3], 10)
    const pdf = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
    for (let i = 1; i <= 4; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const items = (await page.getTextContent()).items
      const item = items.find((entry) => 'str' in entry && entry.str === String(9 + i))
      expect(item && 'transform' in item).toBeTruthy()
      if (!item || !('transform' in item)) throw new Error('Page number missing')
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
      expect(y).toBeCloseTo(viewport.height - 24, 1)
      expect(x + item.width / 2).toBeCloseTo(viewport.width / 2, 1)
    }
    await pdf.destroy()
  })

  it('leaves unselected pages untouched and rejects invalid input', async () => {
    const data = await fixture()
    const bytes = await addPageNumbers(data, [2], 1)
    const pdf = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
    expect((await (await pdf.getPage(1)).getTextContent()).items).toHaveLength(0)
    expect((await (await pdf.getPage(3)).getTextContent()).items.some((item) => 'str' in item && item.str === '3')).toBe(true)
    await pdf.destroy()
    await expect(addPageNumbers(data, [0], 0)).rejects.toThrow('positive whole number')
    await expect(addPageNumbers(data, [4], 1)).rejects.toThrow('Invalid page selection')
    await expect(addPageNumbers(data, [0], 1, { position: 'top', alignment: 'left', template: '😀' })).rejects.toThrow('unsupported')
  })

  it('places formatted headers at the right edge in every page orientation', async () => {
    const bytes = await addPageNumbers(await fixture(), [0, 1, 2, 3], 3, {
      position: 'top', alignment: 'right', template: 'Page {page} of {total}'
    })
    const pdf = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
    for (let i = 1; i <= 4; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const item = (await page.getTextContent()).items.find((entry) => 'str' in entry && entry.str === `Page ${i + 2} of 4`)
      if (!item || !('transform' in item)) throw new Error('Header missing')
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
      expect(y).toBeCloseTo(34, 1)
      // PDF.js text advances can differ slightly from the embedded font's metrics.
      expect(Math.abs(x + item.width - (viewport.width - 24))).toBeLessThan(1)
    }
    await pdf.destroy()
  })
})
