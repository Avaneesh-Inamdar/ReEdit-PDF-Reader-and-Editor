import { PDFDocument } from 'pdf-lib'
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
        const type = (f as unknown as { constructor: { name: string } }).constructor.name
        let value = ''
        try {
          const t = f as unknown as { getText?: () => string; getSelected?: () => string; isChecked?: () => boolean }
          if (t.getText) value = t.getText() ?? ''
          else if (t.getSelected) value = t.getSelected() ?? ''
          else if (t.isChecked) value = String(t.isChecked())
        } catch {}
        return { name, type, value }
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
    try {
      const field = form.getFieldMaybe(name as never)
      if (!field) continue
      void field
      // try text field
      try {
        const tf = form.getTextField(name)
        tf.setText(val)
        continue
      } catch {}
      try {
        const cb = form.getCheckBox(name)
        if (val === 'true' || val === 'yes' || val === '1') cb.check(); else cb.uncheck()
        continue
      } catch {}
      try {
        const dd = form.getDropdown(name)
        dd.select(val)
        continue
      } catch {}
      try {
        const rb = form.getRadioGroup(name)
        rb.select(val)
        continue
      } catch {}
    } catch {}
  }
  if (flatten) form.flatten()
  // ensure appearances
  try { form.updateFieldAppearances() } catch {}
  return await pdf.save()
}
