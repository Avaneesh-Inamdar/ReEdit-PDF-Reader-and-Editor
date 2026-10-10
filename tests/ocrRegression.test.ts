import { describe, it, expect } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import type { Page } from 'tesseract.js'
import { bakeOcrToPdf } from '../src/renderer/src/lib/ocr'
import { getPdfJsDoc } from './helpers'
import { useOcrStore } from '../src/renderer/src/stores/useOcrStore'

describe('OCR placement and cancellation', () => {
  it.each([0, 90, 180, 270])(
    'embeds invisible searchable text inside a cropped page rotated %i degrees',
    async (rotation) => {
      const original = await PDFDocument.create(),
        page = original.addPage([600, 800])
      page.setCropBox(20, 30, 500, 700)
      page.setRotation(degrees(rotation))
      const source = await original.save()
      const result = {
        words: [{ text: 'Searchable', bbox: { x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.23 } }]
      } as Page
      const bytes = await bakeOcrToPdf(source.slice().buffer as ArrayBuffer, { 1: result })
      const doc = await getPdfJsDoc(bytes.slice().buffer as ArrayBuffer)
      const text = await (await doc.getPage(1)).getTextContent()
      const word = text.items.find((item) => 'str' in item && item.str === 'Searchable')
      expect(word).toBeDefined()
      if (word && 'transform' in word) {
        expect(word.transform[4]).toBeCloseTo(70, 1)
        expect(word.transform[5]).toBeGreaterThan(500)
        expect(Math.abs(word.width - 150)).toBeLessThan(1)
      }
      await doc.destroy()
    }
  )
  it('retains cancellation through per-page progress updates', () => {
    const store = useOcrStore.getState()
    store.clearOcrResults()
    store.setProcessing(true, 1)
    store.cancelOcr()
    store.setProcessing(true, 2)
    expect(useOcrStore.getState().isCancelled).toBe(true)
    store.setProcessing(false, null)
    expect(useOcrStore.getState().isCancelled).toBe(true)
    store.resetCancel()
    expect(useOcrStore.getState().isCancelled).toBe(false)
  })
})
