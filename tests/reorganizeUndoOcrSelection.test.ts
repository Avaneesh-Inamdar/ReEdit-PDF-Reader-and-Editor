import { describe, it, expect, beforeEach } from 'vitest'
import { loadFixture, countImagesRaw, getImageByteLengths, getPdfJsDoc } from './helpers'
import { usePdfStore } from '../src/renderer/src/stores/usePdfStore'
import { useAnnotationStore } from '../src/renderer/src/stores/useAnnotationStore'
import { useOcrStore } from '../src/renderer/src/stores/useOcrStore'
import { reorderPages, deletePages } from '../src/renderer/src/lib/pdfEditing'
import { bakeOcrToPdf, preprocessCanvasForOcr } from '../src/renderer/src/lib/ocr'
import { performUndo, performRedo, canPerformUndo, canPerformRedo } from '../src/renderer/src/lib/undoManager'
import { parsePageRange } from '../src/renderer/src/lib/pageRange'
import { PDFDocument } from 'pdf-lib'

describe('Reorganize pages & Undo', () => {
  beforeEach(() => {
    usePdfStore.getState().closeFile()
    useAnnotationStore.getState().clearAll()
  })

  it('pushHistory and undoPdf successfully reverts reordered pages', async () => {
    const fixture = loadFixture('simple-text.pdf')
    const originalBuf = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer

    // Create a 3-page test doc to reorder
    const doc = await PDFDocument.create()
    const p1 = doc.addPage([200, 200])
    p1.drawText('Page 1')
    const p2 = doc.addPage([200, 200])
    p2.drawText('Page 2')
    const p3 = doc.addPage([200, 200])
    p3.drawText('Page 3')
    const threePageBytes = await doc.save()
    const threePageBuf = threePageBytes.buffer.slice(threePageBytes.byteOffset, threePageBytes.byteOffset + threePageBytes.byteLength) as ArrayBuffer

    usePdfStore.getState().openFile('three.pdf', threePageBuf)
    usePdfStore.getState().setNumPages(3)
    expect(usePdfStore.getState().canUndo()).toBe(false)

    // User reorganizes pages (e.g. reorder [2, 0, 1] or delete page)
    usePdfStore.getState().pushHistory()
    const reorderedBytes = await reorderPages(threePageBuf.slice(0), [2, 0, 1])
    const reorderedBuf = reorderedBytes.buffer.slice(reorderedBytes.byteOffset, reorderedBytes.byteOffset + reorderedBytes.byteLength) as ArrayBuffer
    usePdfStore.getState().setData(reorderedBuf)

    expect(usePdfStore.getState().canUndo()).toBe(true)
    expect(usePdfStore.getState().isDirty).toBe(true)

    // Perform Undo
    const undid = usePdfStore.getState().undoPdf()
    expect(undid).toBe(true)

    // Verify current data is back to original
    const restoredDoc = await PDFDocument.load(usePdfStore.getState().data!)
    expect(restoredDoc.getPageCount()).toBe(3)
    expect(usePdfStore.getState().canRedo()).toBe(true)

    // Perform Redo
    const redid = usePdfStore.getState().redoPdf()
    expect(redid).toBe(true)
    expect(usePdfStore.getState().canUndo()).toBe(true)
  })

  it('pushHistory and undoPdf successfully reverts deleted pages', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    doc.addPage([200, 200])
    const bytes = await doc.save()
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

    usePdfStore.getState().openFile('two.pdf', buf)
    usePdfStore.getState().setNumPages(2)

    usePdfStore.getState().pushHistory()
    const deletedBytes = await deletePages(buf.slice(0), [1])
    const deletedBuf = deletedBytes.buffer.slice(deletedBytes.byteOffset, deletedBytes.byteOffset + deletedBytes.byteLength) as ArrayBuffer
    usePdfStore.getState().setData(deletedBuf)
    usePdfStore.getState().setNumPages(1)

    expect(usePdfStore.getState().canUndo()).toBe(true)

    // Undo deletion
    const ok = usePdfStore.getState().undoPdf()
    expect(ok).toBe(true)

    const check = await PDFDocument.load(usePdfStore.getState().data!)
    expect(check.getPageCount()).toBe(2)
  })

  it('unified performUndo coordinates between annotation and PDF history', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const bytes = await doc.save()
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

    usePdfStore.getState().openFile('doc.pdf', buf)
    usePdfStore.getState().setNumPages(1)

    // 1. Add an annotation
    useAnnotationStore.getState().addAnnotation({
      id: 'anno-1',
      page: 1,
      type: 'highlight',
      x: 0.1, y: 0.1, w: 0.5, h: 0.05,
      color: '#ffee58', strokeWidth: 1, opacity: 0.4
    })
    expect(useAnnotationStore.getState().annotations.length).toBe(1)
    expect(canPerformUndo()).toBe(true)

    // 2. Perform undo -> reverts annotation
    performUndo()
    expect(useAnnotationStore.getState().annotations.length).toBe(0)

    // 3. Reorganize pages
    usePdfStore.getState().pushHistory()
    const reorderedBytes = await deletePages(buf.slice(0), [0])
    usePdfStore.getState().setData(reorderedBytes.buffer.slice(0) as ArrayBuffer)
    expect(canPerformUndo()).toBe(true)

    // 4. Perform undo -> reverts PDF change
    performUndo()
    const check = await PDFDocument.load(usePdfStore.getState().data!)
    expect(check.getPageCount()).toBe(1)
  })
})

describe('OCR enhancements', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcrResults()
  })

  it('cancelOcr sets isCancelled and stops processing', () => {
    const ocrStore = useOcrStore.getState()
    expect(ocrStore.isCancelled).toBe(false)
    ocrStore.setProcessing(true, 1)
    ocrStore.cancelOcr()
    expect(useOcrStore.getState().isCancelled).toBe(true)
  })

  it('parsePageRange supports custom page selections for OCR', () => {
    const pages = parsePageRange('1-2, 4', 5).map(i => i + 1)
    expect(pages).toEqual([1, 2, 4])
  })

  it('bakeOcrToPdf embeds searchable text while preserving original images', async () => {
    const fixture = loadFixture('scanned-image-only.pdf')
    const origLens = await getImageByteLengths(fixture)
    const origCount = await countImagesRaw(fixture)

    const mockPageData = {
      words: [
        { text: 'Invoice', bbox: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.15 } },
        { text: 'Total', bbox: { x0: 0.1, y0: 0.2, x1: 0.25, y1: 0.25 } },
        { text: '$500', bbox: { x0: 0.3, y0: 0.2, x1: 0.4, y1: 0.25 } }
      ]
    } as unknown as import('tesseract.js').Page

    const baked = await bakeOcrToPdf(
      fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer,
      { 1: mockPageData }
    )

    // Check images byte preservation
    const afterLens = await getImageByteLengths(baked)
    const afterCount = await countImagesRaw(baked)
    expect(afterCount).toBe(origCount)
    expect(afterLens).toEqual(origLens)

    // Check that text is now extractable by pdf.js
    const pdfJsDoc = await getPdfJsDoc(baked.buffer.slice(baked.byteOffset, baked.byteOffset + baked.byteLength) as ArrayBuffer)
    const textContent = await (await pdfJsDoc.getPage(1)).getTextContent()
    const extractedWords = (textContent.items as unknown as Array<{ str: string }>).map(it => it.str).join(' ')
    expect(extractedWords).toContain('Invoice')
    expect(extractedWords).toContain('Total')
    expect(extractedWords).toContain('$500')
  })
})
