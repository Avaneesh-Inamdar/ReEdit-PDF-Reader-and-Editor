import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { cropPages, restorePageBounds } from '../src/renderer/src/lib/pdfEditing'

async function fixture(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([200, 300]).setCropBox(10, 20, 180, 250)
  pdf.addPage([100, 100])
  const bytes = await pdf.save()
  return bytes.slice().buffer as ArrayBuffer
}

describe('crop pages', () => {
  it('insets the existing crop box and leaves unselected pages and media boxes alone', async () => {
    const bytes = await cropPages(await fixture(), [0], { left: 5, right: 15, top: 25, bottom: 10 })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPage(0).getCropBox()).toEqual({ x: 15, y: 30, width: 160, height: 215 })
    expect(pdf.getPage(0).getMediaBox()).toEqual({ x: 0, y: 0, width: 200, height: 300 })
    expect(pdf.getPage(1).getCropBox()).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('rejects invalid margins and a crop that is too large for any selected page', async () => {
    const data = await fixture()
    await expect(cropPages(data, [0], { left: -1, right: 0, top: 0, bottom: 0 })).rejects.toThrow()
    await expect(cropPages(data, [0, 1], { left: 100, right: 0, top: 0, bottom: 0 })).rejects.toThrow('page 2')
    await expect(cropPages(data, [4], { left: 0, right: 0, top: 0, bottom: 0 })).rejects.toThrow()
  })

  it('restores only selected pages to their media boxes', async () => {
    const bytes = await restorePageBounds(await fixture(), [0])
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPage(0).getCropBox()).toEqual({ x: 0, y: 0, width: 200, height: 300 })
    expect(pdf.getPage(1).getCropBox()).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    await expect(restorePageBounds(await fixture(), [0, 2])).rejects.toThrow('Invalid page')
  })
})
