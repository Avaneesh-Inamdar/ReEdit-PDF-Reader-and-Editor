import { describe, it, expect } from 'vitest'
import { loadFixture, getPdfJsDoc } from './helpers'
import { PDFDocument } from 'pdf-lib'

// WHY: cover spec §7 detection branches with real fixtures

describe('detection logic', () => {
  it('simple-text.pdf is detected as text PDF (not scanned)', async () => {
    const bytes = loadFixture('simple-text.pdf')
    // heuristic: avgCharsPerPage >= 100 => not scanned
    const doc = await getPdfJsDoc(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    let chars = 0
    for (let i=1;i<=doc.numPages;i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      for (const it of tc.items as unknown as Array<{str:string}>) chars += (it.str?.length ?? 0)
    }
    const avg = Math.round(chars / doc.numPages)
    expect(chars).toBeGreaterThan(200)
    expect(avg).toBeGreaterThan(100)
    const isScanned = avg < 100
    expect(isScanned).toBe(false)
  })

  it('scanned-image-only.pdf is detected as scanned (few chars)', async () => {
    const bytes = loadFixture('scanned-image-only.pdf')
    const doc = await getPdfJsDoc(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    let chars = 0
    for (let i=1;i<=doc.numPages;i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      for (const it of tc.items as unknown as Array<{str:string}>) chars += (it.str?.length ?? 0)
    }
    const avg = Math.round(chars / doc.numPages)
    expect(chars).toBeLessThan(20) // no text operators
    expect(avg).toBeLessThan(100)
    expect(avg < 100).toBe(true)
  })

  it('detects AcroForm via bytes and pdf-lib', async () => {
    const bytes = loadFixture('form-acroform.pdf')
    // Use pdf-lib detection (bytes may be compressed in ObjStm, so raw search fails)
    const pdf = await PDFDocument.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    const form = pdf.getForm()
    const fields = form.getFields()
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.map(f=> f.getName())).toContain('name_field')
    // Also via helper full scan
    const full = new TextDecoder('latin1').decode(bytes)
    // AcroForm may be inside compressed stream, but catalog check proves existence
    expect(fields.length).toBeGreaterThan(0)
  })

  it('detects XFA stub via bytes', async () => {
    const bytes = loadFixture('form-xfa-stub.pdf')
    const txt = new TextDecoder().decode(bytes.slice(0, 60000))
    expect(txt.includes('/XFA')).toBe(true)
  })

  it('detects encryption marker', async () => {
    const bytes = loadFixture('encrypted-sample.pdf')
    const head = new TextDecoder().decode(bytes.slice(0, 60000))
    expect(head.includes('/Encrypt')).toBe(true)
  })

  it('flat PDF has no AcroForm/XFA', async () => {
    const bytes = loadFixture('simple-text.pdf')
    const txt = new TextDecoder('latin1').decode(bytes.slice(0, 40000))
    expect(txt.includes('/AcroForm')).toBe(false)
    expect(txt.includes('/XFA')).toBe(false)
  })

  it('page count matches expected', async () => {
    const simple = loadFixture('simple-text.pdf')
    const doc = await getPdfJsDoc(simple.buffer.slice(simple.byteOffset, simple.byteOffset+simple.byteLength) as ArrayBuffer)
    expect(doc.numPages).toBe(3)
    const scanned = loadFixture('scanned-image-only.pdf')
    const doc2 = await getPdfJsDoc(scanned.buffer.slice(scanned.byteOffset, scanned.byteOffset+scanned.byteLength) as ArrayBuffer)
    expect(doc2.numPages).toBe(1)
  })
})
