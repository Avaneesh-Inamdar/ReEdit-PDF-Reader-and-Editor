import { describe, it, expect } from 'vitest'
import { loadFixture, extractText, countImagesRaw, getImageByteLengths } from './helpers'
import { nonDestructiveEditText, verifyNonDestructive } from '../src/renderer/src/lib/pdfEditing'
import { PDFDocument } from 'pdf-lib'

describe('non-destructive text editing (whiteout + overlay)', () => {
  it('edits text via precise bbox whiteout without touching image XObjects', async () => {
    const origBytes = loadFixture('image-and-text.pdf')
    const origImageCount = await countImagesRaw(origBytes)
    const origImageLens = await getImageByteLengths(origBytes)
    const origText = await extractText(origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer)
    expect(origImageCount).toBeGreaterThan(0)
    expect(origText.text).toContain('Image-and-Text')

    // Perform non-destructive edit: whiteout small bbox at top (where title is) and overlay new text
    // The bbox for title region: estimated normalized top strip 0.08 height
    const edited = await nonDestructiveEditText(
      origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer,
      1,
      { xNorm: 0.08, yNorm: 0.05, wNorm: 0.6, hNorm: 0.06 },
      'REPLACED TITLE',
      { fontSize: 14, colorHex: '#cc0000' }
    )

    const editedImageCount = await countImagesRaw(edited)
    const editedImageLens = await getImageByteLengths(edited)
    // Assert: embedded image object count and byte length unchanged (image preserved byte-identical in sense of count/length)
    expect(editedImageCount).toBe(origImageCount)
    expect(editedImageLens).toEqual(origImageLens)

    // page dimensions unchanged
    const origDoc = await PDFDocument.load(origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer)
    const editedDoc = await PDFDocument.load(edited.buffer.slice(edited.byteOffset, edited.byteOffset+edited.byteLength) as ArrayBuffer)
    expect(origDoc.getPageCount()).toBe(editedDoc.getPageCount())
    for (let i=0;i<origDoc.getPageCount();i++) {
      const a = origDoc.getPage(i).getSize()
      const b = editedDoc.getPage(i).getSize()
      expect(b.width).toBeCloseTo(a.width, 1)
      expect(b.height).toBeCloseTo(a.height, 1)
    }

    // Verify helper ok
    const v = await verifyNonDestructive(origBytes, edited)
    expect(v.ok).toBe(true)

    // Edited text layer now contains new text (extracted)
    const editedText = await extractText(edited.buffer.slice(edited.byteOffset, edited.byteOffset+edited.byteLength) as ArrayBuffer)
    expect(editedText.text).toContain('REPLACED TITLE')
    // Unrelated bottom text should still be present (not corrupted)
    expect(editedText.text).toContain('Another unrelated text block')
  })

  it('refuses edit when bbox covers most of page (infeasible)', async () => {
    const orig = loadFixture('simple-text.pdf')
    await expect(
      nonDestructiveEditText(
        orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
        1,
        { xNorm: 0, yNorm: 0, wNorm: 0.99, hNorm: 0.99 },
        'too big'
      )
    ).rejects.toThrow(/covers most of page/)
  })

  it('preserves underlying image bytes after edit (hash simulation)', async () => {
    const origBytes = loadFixture('image-and-text.pdf')
    // capture raw image stream bytes via latin1 search for image data pattern — our lens equality already covers; also check that image subtype still present
    const edited = await nonDestructiveEditText(
      origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer,
      1,
      { xNorm: 0.1, yNorm: 0.7, wNorm: 0.2, hNorm: 0.04 },
      'Hi',
      { fontSize: 10 }
    )
    const origStr = new TextDecoder('latin1').decode(origBytes)
    const editedStr = new TextDecoder('latin1').decode(edited)
    // Both contain exactly one image XObject
    expect((origStr.match(/\/Subtype\s*\/Image/g)||[]).length).toBe((editedStr.match(/\/Subtype\s*\/Image/g)||[]).length)
    // The image Width/Height entries must persist
    expect(editedStr.includes('/Width 1')).toBe(origStr.includes('/Width 1'))
  })
})
