import { describe, expect, it } from 'vitest'
import { degrees, PDFDocument } from 'pdf-lib'
import { addTextWatermark } from '../src/renderer/src/lib/pdfEditing'
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

describe('text watermark', () => {
  it('centers a diagonal watermark on selected rotated pages', async () => {
    const bytes = await addTextWatermark(await fixture(), [0, 1, 2, 3], { text: 'DRAFT', size: 24, opacity: 0.3, angle: 45 })
    const pdf = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
    for (let i = 1; i <= 4; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const item = (await page.getTextContent()).items.find((entry) => 'str' in entry && entry.str === 'DRAFT')
      if (!item || !('transform' in item)) throw new Error('Watermark missing')
      const [a, b, c, d, e, f] = item.transform
      const [x, y] = viewport.convertToViewportPoint(e + a / 24 * item.width / 2 + c * 0.35, f + b / 24 * item.width / 2 + d * 0.35)
      expect(Math.abs(x - viewport.width / 2)).toBeLessThan(1)
      expect(Math.abs(y - viewport.height / 2)).toBeLessThan(1)
    }
    await pdf.destroy()
  })

  it('validates the watermark before saving', async () => {
    const data = await fixture()
    await expect(addTextWatermark(data, [0], { text: '', size: 24, opacity: 0.3, angle: 0 })).rejects.toThrow('single-line')
    await expect(addTextWatermark(data, [0], { text: 'DRAFT', size: 24, opacity: 0, angle: 0 })).rejects.toThrow('opacity')
    await expect(addTextWatermark(data, [0], { text: 'A'.repeat(100), size: 144, opacity: 1, angle: 45 })).rejects.toThrow('too large')
  })
})
