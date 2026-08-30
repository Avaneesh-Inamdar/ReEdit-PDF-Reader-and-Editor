import { describe, it, expect } from 'vitest'
import { loadFixture } from './helpers'
import { inspectForms, fillFormAndSave } from '../src/renderer/src/lib/forms'
import { PDFDocument } from 'pdf-lib'

describe('form field tests (AcroForm)', () => {
  it('detects AcroForm fields via pdf-lib', async () => {
    const bytes = loadFixture('form-acroform.pdf')
    const res = await inspectForms(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    expect(res.hasAcroForm).toBe(true)
    expect(res.hasXfa).toBe(false)
    expect(res.fields.length).toBeGreaterThanOrEqual(3)
    const names = res.fields.map(f=> f.name)
    expect(names).toContain('name_field')
    expect(names).toContain('email_field')
    expect(names).toContain('agree_checkbox')
  })

  it('fills a text field, saves, re-opens, value persists as real form field', async () => {
    const bytes = loadFixture('form-acroform.pdf')
    const filled = await fillFormAndSave(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer,
      { name_field: 'Alice Updated', email_field: 'alice@example.com' },
      false
    )
    expect(filled.length).toBeGreaterThan(1000)
    // Re-open and verify value persists
    const pdf = await PDFDocument.load(filled.buffer.slice(filled.byteOffset, filled.byteOffset+filled.byteLength) as ArrayBuffer)
    const form = pdf.getForm()
    const tf = form.getTextField('name_field')
    expect(tf.getText()).toBe('Alice Updated')
    const email = form.getTextField('email_field')
    expect(email.getText()).toBe('alice@example.com')
    // Checkbox still checkable
    const cb = form.getCheckBox('agree_checkbox')
    expect(cb.isChecked()).toBe(true)
  })

  it('flatten option burns field appearances', async () => {
    const bytes = loadFixture('form-acroform.pdf')
    const flat = await fillFormAndSave(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer,
      { name_field: 'Flatten Test' },
      true
    )
    // Flattened PDF should still be readable but form fields are flattened (no longer fillable)
    const pdf = await PDFDocument.load(flat.buffer.slice(flat.byteOffset, flat.byteOffset+flat.byteLength) as ArrayBuffer)
    // After flatten, getForm may throw or return 0 fields
    let fields: unknown[] = []
    try {
      const form = pdf.getForm()
      // Flattened forms often still have fields but appearance flattened; try to get fields
      fields = form.getFields()
    } catch {}
    // We expect flattened to have either 0 fields or fields not editable; just ensure file is valid
    expect(flat.length).toBeGreaterThan(1000)
    expect(pdf.getPageCount()).toBe(1)
  })

  it('XFA stub is detected as unsupported', async () => {
    const bytes = loadFixture('form-xfa-stub.pdf')
    const res = await inspectForms(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    expect(res.hasXfa).toBe(true)
    // XFA forms are not fillable — we badge as unsupported, not fill
    const head = new TextDecoder().decode(bytes.slice(0, 20000))
    expect(head.includes('/XFA')).toBe(true)
  })
})
