import { PDFDocument, PDFName, PDFRef, PDFDict } from 'pdf-lib'

export async function removeDocumentAnnotation(
  data: ArrayBuffer,
  pageNumber: number,
  id: string
): Promise<Uint8Array> {
  const match = /^(\d+)R(\d*)$/.exec(id)
  if (!match) throw new Error('This annotation has no removable PDF reference.')
  const pdf = await PDFDocument.load(data),
    page = pdf.getPages()[pageNumber - 1]
  if (!page) throw new Error('Annotation page no longer exists.')
  const ref = PDFRef.of(Number(match[1]), Number(match[2] || 0)),
    annots = page.node.Annots()
  if (!annots?.asArray().some((value) => value.toString() === ref.toString()))
    throw new Error('Annotation no longer exists.')
  const dictionary = pdf.context.lookup(ref)
  if (
    dictionary instanceof PDFDict &&
    dictionary.get(PDFName.of('Subtype'))?.toString() === '/Widget'
  ) {
    const form = pdf.getForm(),
      field = form
        .getFields()
        .find((field) =>
          field.acroField
            .getWidgets()
            .some((widget) => pdf.context.getObjectRef(widget.dict)?.toString() === ref.toString())
        )
    if (!field) throw new Error('This signature or form field cannot be removed safely.')
    const signature = field.acroField.dict.get(PDFName.of('V'))
    const permissions = pdf.catalog.lookupMaybe(PDFName.of('Perms'), PDFDict)
    if (signature && permissions?.get(PDFName.of('DocMDP'))?.toString() === signature.toString()) {
      permissions.delete(PDFName.of('DocMDP'))
      if (!permissions.keys().length) pdf.catalog.delete(PDFName.of('Perms'))
    }
    // pdf-lib's public removeField assumes every widget has a normal appearance.
    // Unsigned/empty signature fields often have none. Remove the actual widget
    // references and field tree directly, without flattening a visual cover-up.
    const widgetRefs = field.acroField
      .getWidgets()
      .map((widget) => pdf.context.getObjectRef(widget.dict))
      .filter((ref): ref is PDFRef => !!ref)
    for (const documentPage of pdf.getPages())
      for (const widgetRef of widgetRefs) documentPage.node.removeAnnot(widgetRef)
    form.acroForm.removeField(field.acroField)
    for (const widgetRef of widgetRefs) pdf.context.delete(widgetRef)
    pdf.context.delete(field.ref)
  } else {
    for (let i = annots.size() - 1; i >= 0; i--) {
      const entry = annots.get(i),
        object = pdf.context.lookup(entry)
      if (
        entry.toString() === ref.toString() ||
        (object instanceof PDFDict &&
          object.get(PDFName.of('Parent'))?.toString() === ref.toString())
      )
        annots.remove(i)
    }
  }
  return pdf.save()
}
