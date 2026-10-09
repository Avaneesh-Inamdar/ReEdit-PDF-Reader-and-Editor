import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useFormStore } from '../stores/useFormStore'
import { useEditStore } from '../stores/useEditStore'
import { useTabStore } from '../stores/useTabStore'
import { useUIStore } from '../stores/useUIStore'
import { useOcrStore } from '../stores/useOcrStore'
import { captureSession } from './documentSession'
import { bakeAnnotationsToPdf } from './pdfEditing'
import { fillFormAndSave } from './forms'
import type { RemovalRegion } from '../../../shared/pdfOperations'

export async function prepareDocument(flatten = false): Promise<Uint8Array> {
  const data = usePdfStore.getState().data
  if (!data) throw new Error('Open a PDF first.')
  const annotations = useAnnotationStore.getState().annotations
  const redactions = [...useEditStore.getState().redactions, ...annotations.filter(a => a.type === 'redact')]
  const fields = useFormStore.getState().fields
  let bytes: Uint8Array = new Uint8Array(data.slice(0))
  const masks: RemovalRegion[] = annotations.flatMap(a => (a.maskTexts || (a.sourceText ? [a.sourceText] : [])).map(r => {
    const c=Math.cos(r.angle), s=Math.sin(r.angle)
    const x=r.x-s*r.ascent, y=r.y+c*r.ascent
    const bx=r.x+s*r.descent, by=r.y-c*r.descent
    return {page:a.page,quad:[x,y,x+c*r.width,y+s*r.width,bx,by,bx+c*r.width,by+s*r.width] as RemovalRegion['quad']}
  }))
  if (masks.length) bytes = new Uint8Array(await window.api.removePdfContent(bytes, masks, false))
  const normal=annotations.filter(a => a.type !== 'redact')
  if (normal.length) bytes = new Uint8Array(await bakeAnnotationsToPdf(bytes.slice().buffer as ArrayBuffer, normal, [], {flatten}))
  if (fields.length) {
    bytes = await fillFormAndSave(
      bytes.slice().buffer as ArrayBuffer,
      Object.fromEntries(fields.map((f) => [f.name, f.value])),
      flatten
    )
  }
  if (redactions.length) {
    if (usePdfStore.getState().rotation !== 0) throw new Error('Reset view rotation before applying redactions.')
    bytes = new Uint8Array(await window.api.removePdfContent(bytes, redactions.map(a => ({page:a.page,x:a.x,y:a.y,w:a.w,h:a.h})), true))
  }
  return bytes
}

let saving = false
export async function saveDocument(saveAs = false, flatten = false): Promise<boolean> {
  if (saving || !usePdfStore.getState().data) return false
  saving = true
  const id = useTabStore.getState().activeTabId
  const before = captureSession()
  try {
    const bytes = await prepareDocument(flatten)
    const name =
      (before.pdf.fileName || 'document.pdf').replace(/\.pdf$/i, '') +
      (flatten ? '-flat.pdf' : '.pdf')
    const path = before.pdf.filePath
    const hasDiskPath = !!path && /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)
    const saved =
      saveAs || flatten || !hasDiskPath
        ? await window.api.saveFileAs(bytes, name)
        : await window.api.saveFile(bytes, name, path!)
    if (!saved) return false
    // Flatten is an export. Keep the original editable document and its dirty state.
    if (flatten) return true
    if (id)
      useTabStore
        .getState()
        .updateTab(id, { filePath: saved, fileName: saved.split(/[\\/]/).pop()! })
    const unchanged = (session: ReturnType<typeof captureSession>): boolean =>
      session.pdf.data === before.pdf.data &&
      session.annotations.annotations === before.annotations.annotations &&
      session.forms.fields === before.forms.fields &&
      session.edits.redactions === before.edits.redactions
    if (useTabStore.getState().activeTabId === id) {
      usePdfStore.setState({
        filePath: saved,
        fileName: saved.split(/[\\/]/).pop()!,
        isDirty: !unchanged(captureSession())
      })
    } else if (id) {
      const tab = useTabStore.getState().tabs.find((t) => t.id === id)
      if (tab?.session) {
        const clean = unchanged(tab.session)
        useTabStore
          .getState()
          .updateTab(id, {
            isDirty: !clean,
            session: {
              ...tab.session,
              pdf: {
                ...tab.session.pdf,
                filePath: saved,
                fileName: saved.split(/[\\/]/).pop()!,
                isDirty: !clean
              }
            }
          })
      }
    }
    // Keep the source bytes and editable overlays separate: rebaking saved bytes duplicates annotations.
    return true
  } catch (error) {
    alert('Save failed: ' + String(error))
    return false
  } finally {
    saving = false
  }
}

export async function closeDocument(id = useTabStore.getState().activeTabId): Promise<boolean> {
  if (!id || saving || useOcrStore.getState().isProcessing) return false
  useTabStore.getState().setActiveTab(id)
  if (usePdfStore.getState().isDirty) {
    const choice = await window.api.confirmClose(usePdfStore.getState().fileName || 'document.pdf')
    if (choice === 'cancel') return false
    if (choice === 'save' && (!(await saveDocument()) || usePdfStore.getState().isDirty))
      return false
  }
  useTabStore.getState().closeTab(id)
  useUIStore.getState().setActiveView(useTabStore.getState().activeTabId ? 'document' : 'home')
  return true
}
