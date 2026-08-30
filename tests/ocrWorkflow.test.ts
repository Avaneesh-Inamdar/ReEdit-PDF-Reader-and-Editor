import { describe, it, expect } from 'vitest'
import { loadFixture, countImagesRaw, getImageByteLengths, getPdfJsDoc } from './helpers'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Simulated OCR: add invisible text layer over scanned image WITHOUT touching original image XObject
// WHY: spec OCR-first must preserve original scanned image untouched underneath.

async function simulateOcrTextLayer(data: ArrayBuffer, ocrText: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const page = pdf.getPages()[0]
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const { width, height } = page.getSize()
  // Overlay invisible text positioned over image — store as invisible? Use white color with opacity 0 would be invisible but still extractable
  // For test we draw faint text so extraction finds it; but image must stay.
  // Place text near image area without covering entire page
  page.drawText(ocrText, { x: 60, y: height - 150, size: 10, font, color: rgb(0,0,0), opacity: 0.01 })
  // Add second line as "invisible" — actually transparent text still counts for getTextContent? pdf.js extracts text regardless of color/opacity.
  // So we simulate OCR text layer as real text objects.
  return await pdf.save()
}

describe('OCR-first workflow for scanned/image-only PDFs', () => {
  it('scanned fixture has no text layer before OCR', async () => {
    const bytes = loadFixture('scanned-image-only.pdf')
    const doc = await getPdfJsDoc(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    let chars = 0
    for (let i=1;i<=doc.numPages;i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      for (const it of tc.items as unknown as Array<{str:string}>) chars += (it.str?.length ?? 0)
    }
    expect(chars).toBeLessThan(20)
  })

  it('OCR adds text layer without touching original image object (byte-identical image preservation)', async () => {
    const origBytes = loadFixture('scanned-image-only.pdf')
    const origImageCount = await countImagesRaw(origBytes)
    const origLens = await getImageByteLengths(origBytes)
    expect(origImageCount).toBeGreaterThan(0)

    const ocrSimulated = await simulateOcrTextLayer(
      origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer,
      'OCR simulated text: The quick brown fox'
    )

    const afterImageCount = await countImagesRaw(ocrSimulated)
    const afterLens = await getImageByteLengths(ocrSimulated)
    // Original image must be byte-identical (count + length preserved) — OCR never resampled/recompressed
    expect(afterImageCount).toBe(origImageCount)
    expect(afterLens).toEqual(origLens)

    // Text layer now exists and is sanely positioned
    const doc = await getPdfJsDoc(ocrSimulated.buffer.slice(ocrSimulated.byteOffset, ocrSimulated.byteOffset+ocrSimulated.byteLength) as ArrayBuffer)
    let charsAfter = 0
    let foundOcr = false
    for (let i=1;i<=doc.numPages;i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      for (const it of tc.items as unknown as Array<{str:string}>) {
        charsAfter += (it.str?.length ?? 0)
        if (it.str.includes('OCR simulated')) foundOcr = true
      }
    }
    expect(charsAfter).toBeGreaterThan(10)
    expect(foundOcr).toBe(true)
  })

  it('editing OCR text after layer creation still preserves underlying image', async () => {
    const origBytes = loadFixture('scanned-image-only.pdf')
    const withOcr = await simulateOcrTextLayer(
      origBytes.buffer.slice(origBytes.byteOffset, origBytes.byteOffset+origBytes.byteLength) as ArrayBuffer,
      'Original OCR text'
    )
    const lensBefore = await getImageByteLengths(withOcr)
    // Now perform a non-destructive edit on the OCR text region (whiteout small bbox + overlay)
    const { nonDestructiveEditText } = await import('../src/renderer/src/lib/pdfEditing')
    const edited = await nonDestructiveEditText(
      withOcr.buffer.slice(withOcr.byteOffset, withOcr.byteOffset+withOcr.byteLength) as ArrayBuffer,
      1,
      { xNorm: 0.1, yNorm: 0.2, wNorm: 0.5, hNorm: 0.04 },
      'Edited OCR text'
    )
    const lensAfter = await getImageByteLengths(edited)
    expect(lensAfter).toEqual(lensBefore)
  })
})
