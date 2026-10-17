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
const imageOnly=process.argv.includes('--image-only')
const original = await PDFDocument.create(),
  font = await original.embedFont(StandardFonts.Helvetica),
  page = original.addPage([400, 300])
page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(0.95, 0.9, 0.82) })
page.drawText('Original scanned text', { x: 40, y: 220, size: 16, font })
page.drawText('Keep this next line unchanged', { x: 40, y: 190, size: 16, font })
if(imageOnly)page.drawText('Small isolated footer 12345',{x:40,y:45,size:10,font,color:rgb(0.55,0.55,0.55)})
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
if(!imageOnly)for (const [text, y] of [
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
writeFileSync(`release/native-validation/tauri/${imageOnly?'ocr-image-only':'ocr-paper'}.pdf`, await doc.save())
