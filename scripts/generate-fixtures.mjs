import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures')
fs.mkdirSync(outDir, { recursive: true })

// 1x1 transparent PNG — valid minimal
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='
const pngBytes = Buffer.from(pngBase64, 'base64')

async function simpleText() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Simple Text Fixture')
  pdf.setAuthor('Test')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < 3; p++) {
    const page = pdf.addPage([612, 792])
    page.drawText(`Simple Text PDF — Page ${p+1}`, { x: 50, y: 750, size: 18, font, color: rgb(0.1,0.1,0.1) })
    for (let i = 0; i < 20; i++) {
      page.drawText(`Line ${i+1} — The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet. `, { x: 50, y: 700 - i*22, size: 10, font, color: rgb(0.2,0.2,0.2) })
    }
  }
  const bytes = await pdf.save()
  fs.writeFileSync(path.join(outDir, 'simple-text.pdf'), bytes)
  console.log('simple-text.pdf', bytes.length)
}

async function imageAndText() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Image and Text')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([612, 792])
  page.drawText('Image-and-Text Fixture', { x: 50, y: 750, size: 16, font })
  page.drawText('This text is above the image. It should remain after non-destructive edits.', { x: 50, y: 720, size: 10, font })
  page.drawText('Another unrelated text block at bottom that must not shift.', { x: 50, y: 100, size: 10, font })
  // embed image
  let img
  try { img = await pdf.embedPng(pngBytes) } catch { const tiny = Uint8Array.from([137,80,78,71]); img = await pdf.embedPng(pngBytes) }
  page.drawImage(img, { x: 100, y: 300, width: 400, height: 200 })
  page.drawText('Caption under image', { x: 100, y: 280, size: 9, font, color: rgb(0.4,0.4,0.4) })
  const bytes = await pdf.save()
  fs.writeFileSync(path.join(outDir, 'image-and-text.pdf'), bytes)
  console.log('image-and-text.pdf', bytes.length)
}

async function scannedImageOnly() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  // NO drawText — only image, simulating scanned
  const img = await pdf.embedPng(pngBytes)
  // fill page with image that visually looks like text (but we just stretch the white png with border)
  page.drawRectangle({ x: 40, y: 40, width: 532, height: 712, color: rgb(1,1,1), borderColor: rgb(0.6,0.6,0.6), borderWidth: 1 })
  page.drawImage(img, { x: 60, y: 400, width: 492, height: 300 })
  // add a rectangle simulating text lines (pure graphics, no text operators)
  for (let i=0;i<8;i++) page.drawRectangle({ x: 60, y: 320 - i*30, width: 300+i*10, height: 8, color: rgb(0.15,0.15,0.15) })
  const bytes = await pdf.save()
  fs.writeFileSync(path.join(outDir, 'scanned-image-only.pdf'), bytes)
  console.log('scanned-image-only.pdf', bytes.length)
}

async function acroform() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([612, 792])
  page.drawText('AcroForm Fixture — fillable fields', { x: 50, y: 750, size: 14, font })
  const form = pdf.getForm()
  // text field
  const tf = form.createTextField('name_field')
  tf.addToPage(page, { x: 50, y: 650, width: 300, height: 24 })
  tf.setText('John Doe')
  // second field
  const tf2 = form.createTextField('email_field')
  tf2.addToPage(page, { x: 50, y: 600, width: 300, height: 24 })
  tf2.setText('')
  // checkbox
  const cb = form.createCheckBox('agree_checkbox')
  cb.addToPage(page, { x: 50, y: 560, width: 16, height: 16 })
  cb.check()
  // dropdown
  const dd = form.createDropdown('choice_dropdown')
  dd.addOptions(['Option A', 'Option B', 'Option C'])
  dd.addToPage(page, { x: 50, y: 510, width: 200, height: 24 })
  dd.select('Option A')
  // radio group
  const rg = form.createRadioGroup('radio_group')
  rg.addOptionToPage('Yes', page, { x: 50, y: 470, width: 16, height: 16 })
  rg.addOptionToPage('No', page, { x: 100, y: 470, width: 16, height: 16 })
  rg.select('Yes')
  // update appearances
  try { form.updateFieldAppearances(font) } catch {}
  const bytes = await pdf.save()
  fs.writeFileSync(path.join(outDir, 'form-acroform.pdf'), bytes)
  console.log('form-acroform.pdf', bytes.length)
}

async function xfaStub() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([612, 792])
  page.drawText('XFA Stub Fixture — should trigger unsupported badge', { x: 50, y: 750, size: 12, font })
  page.drawText('This PDF contains an XFA dictionary entry for detection testing.', { x: 50, y: 730, size: 10, font })
  // Inject fake /XFA entry into catalog
  const { PDFName } = await import('pdf-lib')
  try {
    const catalog = pdf.catalog
    catalog.set(PDFName.of('XFA'), pdf.context.obj([{ a: 1 }]))
  } catch {}
  // Also ensure bytes contain /XFA text somewhere — we inject via comment by adding an extra object with XFA string
  // pdf-lib will serialize the XFA entry as /XFA
  const bytes = await pdf.save()
  // Ensure detection via string search — if pdf-lib didn't include literal, append marker in trailer area (still parsable)
  // Append comment containing /XFA so detection head.slice includes it
  const marker = Buffer.from('\n% /XFA stub marker\n')
  const out = Buffer.concat([Buffer.from(bytes), marker])
  fs.writeFileSync(path.join(outDir, 'form-xfa-stub.pdf'), out)
  console.log('form-xfa-stub.pdf', out.length)
}

async function encryptedSample() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([612, 792])
  page.drawText('Encrypted Sample Fixture', { x: 50, y: 750, size: 14, font })
  page.drawText('This simulates a password-protected PDF for detection.', { x: 50, y: 730, size: 10, font })
  const bytes = await pdf.save()
  // Inject /Encrypt marker so detection finds it; true password encryption not implemented via pdf-lib easily
  // Append a fake Encrypt entry (detection scans head 60k)
  const fakeEncrypt = Buffer.from('\n1 0 obj\n<< /Filter /Standard /V 2 /R 3 /O (xxx) /U (xxx) /P -4 >>\nendobj\n% /Encrypt marker for test\n')
  // Insert after header so head scan finds it
  const headerEnd = bytes.indexOf(0x0A) // first newline after %PDF
  const before = Buffer.from(bytes.slice(0, headerEnd+1))
  const after = Buffer.from(bytes.slice(headerEnd+1))
  const marked = Buffer.concat([before, Buffer.from('% /Encrypt fake for detection\n'), after, fakeEncrypt])
  fs.writeFileSync(path.join(outDir, 'encrypted-sample.pdf'), marked)
  console.log('encrypted-sample.pdf', marked.length, '(fake encrypt marker injected)')
}

await simpleText()
await imageAndText()
await scannedImageOnly()
await acroform()
await xfaStub()
await encryptedSample()
console.log('All fixtures generated in', outDir)
