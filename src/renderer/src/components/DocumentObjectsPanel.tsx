import { useEffect, useState } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { pdfjsLib, pdfAssetOptions } from '../lib/pdfjs'
import { removeDocumentAnnotation } from '../lib/documentObjects'
import { commitInlineEdit } from '../lib/inlineText'
import { inspectForms } from '../lib/forms'
import { useFormStore } from '../stores/useFormStore'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Item = {
  id: string
  subtype: string
  contentsObj?: { str?: string }
  fieldName?: string
  fieldType?: string
}
export function DocumentObjectsPanel({
  pdfDoc
}: {
  pdfDoc?: PDFDocumentProxy | null
}): React.JSX.Element {
  const { data, currentPage } = usePdfStore(),
    [items, setItems] = useState<Item[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    const task =
      !pdfDoc && data
        ? pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) })
        : undefined
    setItems([])
    setMessage('')
    void (async () => {
      try {
        if (!task && !pdfDoc) return
        const doc = pdfDoc || (await task!.promise),
          page = await doc.getPage(currentPage),
          annotations = await page.getAnnotations()
        if (!cancelled)
          setItems(
            annotations.filter((a) => a.subtype !== 'Popup' && a.subtype !== 'Link') as Item[]
          )
      } catch (e) {
        if (!cancelled) setMessage(String(e))
      } finally {
        void task?.destroy()
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [data, currentPage, pdfDoc])
  const remove = async (item: Item): Promise<void> => {
    if (!data) return
    setBusy(true)
    try {
      if (!(await commitInlineEdit())) return
      const bytes = await removeDocumentAnnotation(data.slice(0), currentPage, item.id)
      const forms = await inspectForms(bytes.slice().buffer as ArrayBuffer)
      if (usePdfStore.getState().data !== data)
        throw new Error('Document changed; select the object again.')
      usePdfStore.getState().pushHistory()
      usePdfStore.getState().setData(bytes.slice().buffer as ArrayBuffer)
      const edits = useAnnotationStore.getState()
      useAnnotationStore.setState({
        annotations: edits.annotations.filter(
          (annotation) =>
            annotation.sourceText?.pdfAnnotationId !== item.id &&
            !annotation.maskTexts?.some((mask) => mask.pdfAnnotationId === item.id)
        ),
        selectedId: null
      })
      const previous = useFormStore.getState()
      previous.setFields(
        forms.fields.map((field) => ({
          ...field,
          value: previous.fields.find((old) => old.name === field.name)?.value ?? field.value
        }))
      )
      previous.setFlags(forms)
      setMessage('Object removed. Undo is available.')
    } catch (e) {
      setMessage(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="document-objects" aria-label="Existing document objects">
      <h3>Existing marks and annotations</h3>
      <p>Select an existing object to remove it without painting over the page.</p>
      {items.length ? (
        items.map((item) => (
          <div key={item.id} className="document-object-row">
            <span title={item.contentsObj?.str || item.fieldName}>
              {item.fieldType === 'Sig' ? 'Signature field' : item.subtype}
              {item.fieldName ? ` · ${item.fieldName}` : ''}
            </span>
            <button
              className="operation-secondary"
              disabled={busy}
              onClick={() => void remove(item)}
              aria-label={`Remove ${item.subtype}`}
            >
              Remove
            </button>
          </div>
        ))
      ) : (
        <p>No separate annotation objects on this page.</p>
      )}
      <button
        className="operation-secondary"
        onClick={() => {
          useUIStore.getState().setPointerMode('select')
          useAnnotationStore.getState().setTool('eraser')
          setMessage(
            'Drag a tight rectangle around a scanned mark or flattened underline. This also removes content inside the rectangle.'
          )
        }}
      >
        Remove a scanned or flattened mark
      </button>
      <p className="operation-caption">
        Scanned backgrounds are reconstructed from nearby paper. Review complex backgrounds before
        saving. Removing a signature field or editing signed content changes the document and may
        invalidate signatures.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  )
}
