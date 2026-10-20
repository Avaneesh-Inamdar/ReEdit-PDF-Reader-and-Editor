import { PDFDocument, StandardFonts } from 'pdf-lib'
import { mkdirSync, writeFileSync } from 'node:fs'
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (let number = 1; number <= 32; number++) {
  const page = pdf.addPage([612, 792])
  page.drawText(`Document page ${number} unique marker`, { x: 40, y: 700, size: 12, font })
  page.drawText('Second line for text selection.', { x: 40, y: 680, size: 12, font })
}
mkdirSync('release/native-validation', { recursive: true })
writeFileSync('release/native-validation/selection.pdf', await pdf.save())
