import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } from 'pdf-lib'
import type { FormField } from '../stores/useFormStore'

export async function inspectForms(data: ArrayBuffer): Promise<{ fields: FormField[]; hasXfa: boolean; hasAcroForm: boolean; isEncrypted: boolean }> {
  try {
    const pdf = await PDFDocument.load(data, { ignoreEncryption: true })
    const isEncrypted = pdf.isEncrypted ?? false
    // XFA detection: catalog has XFA entry — pdf-lib exposes via context
    let hasXfa = false
    try {
      // raw inspect via context lookup
      // fallback: check raw bytes for /XFA string
      const text = new TextDecoder().decode(new Uint8Array(data).slice(0, 20000))
      if (text.includes('/XFA')) hasXfa = true
    } catch {}
    // Try to get form fields
    let fields: FormField[] = []
    let hasAcroForm = false
    try {
      const form = pdf.getForm()
      const flds = form.getFields()
      hasAcroForm = flds.length > 0
      fields = flds.map((f) => {
        const name = f.getName()
        const type = f instanceof PDFTextField ? 'PDFTextField' : f instanceof PDFCheckBox ? 'PDFCheckBox' : f instanceof PDFDropdown ? 'PDFDropdown' : f instanceof PDFRadioGroup ? 'PDFRadioGroup' : f instanceof PDFOptionList ? 'PDFOptionList' : 'Unsupported'
        let value = ''
        try {
          const t = f as unknown as { getText?: () => string; getSelected?: () => string | string[]; isChecked?: () => boolean }
          if (t.getText) value = t.getText() ?? ''
          else if (t.getSelected) { const selected = t.getSelected(); value = Array.isArray(selected) ? selected.join('\n') : selected || '' }
          else if (t.isChecked) value = String(t.isChecked())
        } catch {}
        const choices = f instanceof PDFDropdown || f instanceof PDFRadioGroup || f instanceof PDFOptionList ? f.getOptions() : undefined
        return { name, type, value, options: choices, multiple: f instanceof PDFDropdown || f instanceof PDFOptionList ? f.isMultiselect() : false, required: f.isRequired(), readOnly: f.isReadOnly() || type === 'Unsupported' }
      })
    } catch {
      hasAcroForm = false
    }
    // also brute check for /AcroForm
    if (!hasAcroForm) {
      const head = new TextDecoder().decode(new Uint8Array(data).slice(0, 40000))
      if (head.includes('/AcroForm')) hasAcroForm = true
    }
    return { fields, hasXfa, hasAcroForm, isEncrypted }
  } catch (e) {
    // if encrypted and can't load, mark encrypted
    const msg = String(e)
    if (msg.toLowerCase().includes('encrypt')) return { fields: [], hasXfa: false, hasAcroForm: false, isEncrypted: true }
    throw e
  }
}

export async function fillFormAndSave(data: ArrayBuffer, values: Record<string, string>, flatten: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const form = pdf.getForm()
  for (const [name, val] of Object.entries(values)) {
    const field = form.getFieldMaybe(name)
    if (!field || field.isReadOnly()) continue
    if (field instanceof PDFTextField) field.setText(val)
    else if (field instanceof PDFCheckBox) {
      if (['true', 'yes', '1'].includes(val)) field.check(); else field.uncheck()
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (val) field.select(val.split('\n')); else field.clear()
    } else if (field instanceof PDFRadioGroup) {
      if (val) field.select(val); else field.clear()
    }
  }
  form.updateFieldAppearances()
  if (flatten) form.flatten()
  return await pdf.save()
}
