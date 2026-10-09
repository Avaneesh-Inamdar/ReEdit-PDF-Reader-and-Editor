import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { usePdfStore } from '../src/renderer/src/stores/usePdfStore'
import { useTabStore } from '../src/renderer/src/stores/useTabStore'
import { useAnnotationStore, type Annotation } from '../src/renderer/src/stores/useAnnotationStore'
import { useFormStore } from '../src/renderer/src/stores/useFormStore'
import { restoreSession } from '../src/renderer/src/lib/documentSession'
import { saveDocument, closeDocument, prepareDocument } from '../src/renderer/src/lib/documentActions'
import { insertBlankPage } from '../src/renderer/src/lib/pdfEditing'

const annotation: Annotation = { id: 'note', page: 1, type: 'text', text: 'My edit', x: 0.1, y: 0.1, w: 0.3, h: 0.1, color: '#ff0000', opacity: 1, strokeWidth: 1 }
let source: ArrayBuffer
const api = { saveFile: vi.fn(), saveFileAs: vi.fn(), confirmClose: vi.fn() }

beforeEach(async () => {
  restoreSession()
  useTabStore.setState({ tabs: [], activeTabId: null })
  vi.clearAllMocks()
  vi.stubGlobal('window', { api })
  vi.stubGlobal('alert', vi.fn())
  api.saveFile.mockResolvedValue('C:\\first.pdf')
  api.saveFileAs.mockResolvedValue('C:\\renamed.pdf')
  const doc = await PDFDocument.create()
  doc.addPage()
  source = (await doc.save()).slice().buffer as ArrayBuffer
})

describe('document lifecycle', () => {
  it('undoes and redoes a page operation together with its annotation state', async () => {
    useTabStore.getState().openTab('C:\\first.pdf', source)
    useAnnotationStore.getState().addAnnotation(annotation)
    const bytes = await insertBlankPage((await prepareDocument()).slice().buffer as ArrayBuffer, 0)
    usePdfStore.getState().pushHistory()
    useAnnotationStore.setState({ annotations: [], past: [], future: [] })
    usePdfStore.getState().setData(bytes.slice().buffer as ArrayBuffer)
    expect((await PDFDocument.load(usePdfStore.getState().data!)).getPageCount()).toBe(2)
    usePdfStore.getState().undoPdf()
    expect(useAnnotationStore.getState().annotations).toHaveLength(1)
    expect((await PDFDocument.load(usePdfStore.getState().data!)).getPageCount()).toBe(1)
    usePdfStore.getState().redoPdf()
    expect(useAnnotationStore.getState().annotations).toHaveLength(0)
    const redone = await PDFDocument.load(usePdfStore.getState().data!)
    expect(redone.getPageCount()).toBe(2)
    expect(redone.getPage(1).node.Annots()?.size()).toBe(1)
  })

  it('keeps edits, form values, navigation and undo history isolated between tabs', () => {
    const first = useTabStore.getState().openTab('C:\\first.pdf', source)
    useAnnotationStore.getState().addAnnotation(annotation)
    useFormStore.getState().setFields([{ name: 'name', type: 'text', value: '' }])
    useFormStore.getState().updateField('name', 'Alice')
    usePdfStore.getState().setZoom(2)
    const second = useTabStore.getState().openTab('C:\\second.pdf', source.slice(0))
    expect(useAnnotationStore.getState().annotations).toHaveLength(0)
    expect(usePdfStore.getState().isDirty).toBe(false)
    useTabStore.getState().setActiveTab(first)
    expect(useAnnotationStore.getState().annotations[0].text).toBe('My edit')
    expect(useFormStore.getState().fields[0].value).toBe('Alice')
    expect(usePdfStore.getState().zoom).toBe(2)
    expect(usePdfStore.getState().isDirty).toBe(true)
    useAnnotationStore.getState().undo()
    expect(useAnnotationStore.getState().annotations).toHaveLength(0)
    useTabStore.getState().setActiveTab(second)
    expect(useAnnotationStore.getState().past).toHaveLength(0)
  })

  it('saves the selected document and does not duplicate annotations on repeated saves', async () => {
    const first = useTabStore.getState().openTab('C:\\first.pdf', source)
    useAnnotationStore.getState().addAnnotation(annotation)
    useTabStore.getState().openTab('C:\\second.pdf', source.slice(0))
    useTabStore.getState().setActiveTab(first)
    expect(await saveDocument()).toBe(true)
    expect(await saveDocument()).toBe(true)
    expect(api.saveFile.mock.calls[0][2]).toBe('C:\\first.pdf')
    const one = await PDFDocument.load(api.saveFile.mock.calls[0][0])
    const two = await PDFDocument.load(api.saveFile.mock.calls[1][0])
    expect(two.getPage(0).node.Annots()?.size()).toBe(one.getPage(0).node.Annots()?.size())
    expect(usePdfStore.getState().isDirty).toBe(false)
    useAnnotationStore.getState().updateAnnotation('note', { text: 'Changed text' })
    expect(usePdfStore.getState().isDirty).toBe(true)
  })

  it('Save As updates the name and subsequent save destination', async () => {
    useTabStore.getState().openTab('C:\\first.pdf', source)
    await saveDocument(true)
    expect(usePdfStore.getState().fileName).toBe('renamed.pdf')
    expect(useTabStore.getState().getActiveTab()?.fileName).toBe('renamed.pdf')
    await saveDocument()
    expect(api.saveFile.mock.calls[0][2]).toBe('C:\\renamed.pdf')
  })

  it('preserves pending changes after cancelling close or cancelling Save As', async () => {
    useTabStore.getState().openTab('drop.pdf', source)
    useAnnotationStore.getState().addAnnotation(annotation)
    api.confirmClose.mockResolvedValue('cancel')
    expect(await closeDocument()).toBe(false)
    api.confirmClose.mockResolvedValue('save')
    api.saveFileAs.mockResolvedValue(null)
    expect(await closeDocument()).toBe(false)
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(usePdfStore.getState().isDirty).toBe(true)
  })

  it('activates the neighboring document after closing and keeps exports separate', async () => {
    const first = useTabStore.getState().openTab('C:\\first.pdf', source)
    useTabStore.getState().openTab('C:\\second.pdf', source.slice(0))
    useAnnotationStore.getState().addAnnotation(annotation)
    await saveDocument(true, true)
    expect(usePdfStore.getState().filePath).toBe('C:\\second.pdf')
    expect(usePdfStore.getState().isDirty).toBe(true)
    api.confirmClose.mockResolvedValue('discard')
    await closeDocument()
    expect(useTabStore.getState().activeTabId).toBe(first)
    expect(usePdfStore.getState().filePath).toBe('C:\\first.pdf')
  })
})
