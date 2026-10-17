import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { mkdirSync, writeFileSync } from 'node:fs'
const directory = 'release/validation-oct17/layout'
mkdirSync(directory, { recursive: true })
for (const [name, sizes] of [
  ['certificate', [[842, 595]]],
  [
    'mixed-pages',
    [
      [842, 595],
      [595, 842],
      [900, 650]
    ]
  ]
]) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.TimesRoman)
  for (const [index, [w, h]] of sizes.entries()) {
    const page = pdf.addPage([w, h])
    page.drawRectangle({
      x: 20,
      y: 20,
      width: w - 40,
      height: h - 40,
      borderWidth: 2,
      borderColor: rgb(0.15, 0.25, 0.45)
    })
    page.drawText('CERTIFICATE OF COMPLETION', { x: 60, y: h - 100, size: 28, font })
    page.drawText(`Landscape and mixed-page layout regression - page ${index + 1}`, {
      x: 60,
      y: h - 160,
      size: 16,
      font
    })
    if (index === 2) {
      page.setCropBox(15, 20, w - 30, h - 40)
      page.setRotation(degrees(90))
    }
  }
  writeFileSync(`${directory}/${name}.pdf`, await pdf.save())
}
