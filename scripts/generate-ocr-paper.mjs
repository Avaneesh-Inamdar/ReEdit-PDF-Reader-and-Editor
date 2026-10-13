// Reproducible off-white scan with the same invisible layer used by OCR.
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  beginText,
  endText,
  setFontAndSize,
  setTextRenderingMode,
  TextRenderingMode,
  setTextMatrix,
  showText,
  pushGraphicsState,
  popGraphicsState
} from 'pdf-lib'
import { PDFDocument as NativePdf, ColorSpace } from 'mupdf'
const original = await PDFDocument.create(),
  font = await original.embedFont(StandardFonts.Helvetica),
  page = original.addPage([400, 300])
page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(0.95, 0.9, 0.82) })
page.drawText('Original scanned text', { x: 40, y: 220, size: 16, font })
page.drawText('Keep this next line unchanged', { x: 40, y: 190, size: 16, font })
const native = new NativePdf(await original.save()),
  loaded = native.loadPage(0),
  pixels = loaded.toPixmap([2, 0, 0, 2, 0, 0], ColorSpace.DeviceRGB, false, false)
const png = pixels.asPNG()
pixels.destroy()
loaded.destroy()
native.destroy()
const doc = await PDFDocument.create(),
  scan = await doc.embedPng(png),
  output = doc.addPage([400, 300]),
  ocrFont = await doc.embedFont(StandardFonts.Helvetica)
output.drawImage(scan, { x: 0, y: 0, width: 400, height: 300 })
const key = output.node.newFontDictionary('OCR', ocrFont.ref)
for (const [text, y] of [
  ['Original scanned text', 220],
  ['Keep this next line unchanged', 190]
])
  output.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(key, 16),
    setTextRenderingMode(TextRenderingMode.Invisible),
    setTextMatrix(1, 0, 0, 1, 40, y),
    showText(ocrFont.encodeText(text)),
    endText(),
    popGraphicsState()
  )
mkdirSync('release/native-validation/tauri', { recursive: true })
writeFileSync('release/native-validation/tauri/ocr-paper.pdf', await doc.save())
