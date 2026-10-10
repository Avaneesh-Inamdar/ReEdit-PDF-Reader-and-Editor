import { Icon } from './Icon'
import { useState, useEffect } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useOcrStore } from '../stores/useOcrStore'
import { useDetectionStore } from '../stores/useDetectionStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { getOcrWorker, terminateOcr, bakeOcrToPdf } from '../lib/ocr'
import { pdfAssetOptions, pdfjsLib } from '../lib/pdfjs'
import { prepareDocument } from '../lib/documentActions'
import { parsePageRange } from '../lib/pageRange'

export function DetectionPanel(): React.JSX.Element {
  const { data, filePath, currentPage, numPages, setData } = usePdfStore()
  const det = useDetectionStore()
  const { setProcessing, setOcrResult, isProcessing, ocrResults, clearOcrResults, cancelOcr } =
    useOcrStore()
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [converting, setConverting] = useState(false)
  const [ocrScope, setOcrScope] = useState<'current' | 'all' | 'custom'>('current')
  const [customPagesInput, setCustomPagesInput] = useState('1')

  useEffect(() => {
    setStatus('')
    setProgress(0)
  }, [filePath])

  const hasOcrCurrent = !!ocrResults[currentPage]
  const totalOcred = Object.keys(ocrResults).length

  // Helper: render page to offscreen canvas at scale 2.5 (~300 DPI) for improved OCR quality
  const renderPageToCanvas = async (
    doc: import('pdfjs-dist').PDFDocumentProxy,
    pageNum: number,
    scale = 2.5
  ): Promise<HTMLCanvasElement> => {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale, rotation: 0 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')!
    await (
      page.render({ canvasContext: ctx as never, viewport } as never) as unknown as {
        promise: Promise<void>
      }
    ).promise
    ;(canvas as unknown as { _w: number })._w = canvas.width
    return canvas
  }

  const normaliseWords = (
    result: { words: { bbox: { x0: number; y0: number; x1: number; y1: number }; text: string }[] },
    canvasWidth: number,
    canvasHeight: number
  ): void => {
    const seen = new Set<object>()
    const normalize = (value: unknown): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      if (Array.isArray(value)) {
        value.forEach(normalize)
        return
      }
      const item = value as Record<string, unknown>
      const box = item.bbox as { x0: number; x1: number; y0: number; y1: number } | undefined
      if (box && !seen.has(box)) {
        seen.add(box)
        box.x0 /= canvasWidth
        box.x1 /= canvasWidth
        box.y0 /= canvasHeight
        box.y1 /= canvasHeight
      }
      for (const key of ['words', 'lines', 'paragraphs', 'blocks', 'symbols']) normalize(item[key])
    }
    normalize(result)
  }

  const onOcrComplete = async (
    completedResults: Record<number, import('tesseract.js').Page>
  ): Promise<void> => {
    if (!data) return
    const origFileName = usePdfStore.getState().fileName || 'document.pdf'
    const baseName = origFileName.replace(/\.[^/.]+$/, '')
    const ocrFileName = `${baseName}_ocr.pdf`

    setStatus('Embedding searchable text…')
    const baked = await bakeOcrToPdf(data.slice(0), completedResults)
    if (usePdfStore.getState().data !== data)
      throw new Error('The document changed during OCR. Please run OCR again.')
    usePdfStore.getState().pushHistory()
    setData(baked.slice().buffer as ArrayBuffer)
    setStatus('OCR complete. Text is selectable and searchable. Save to keep the result.')
    if (confirm(`Save the searchable PDF as ${ocrFileName}?`)) {
      const prepared = await prepareDocument()
      const savedPath = await window.api.saveFileAs(prepared, ocrFileName)
      if (savedPath) setStatus(`Saved searchable copy: ${savedPath}`)
    }
  }

  const handleStopOcr = async (): Promise<void> => {
    cancelOcr()
    setStatus('Stopping OCR…')
    await terminateOcr()
    setProcessing(false, null)
    setStatus('OCR stopped by user.')
  }

  const getPagesToOcr = (): number[] => {
    if (ocrScope === 'current') return [currentPage]
    if (ocrScope === 'all') return Array.from({ length: numPages }, (_, i) => i + 1)
    if (ocrScope === 'custom') {
      try {
        const indices = parsePageRange(customPagesInput, numPages)
        return indices.map((i) => i + 1)
      } catch (err) {
        alert('Invalid page range: ' + String(err))
        return []
      }
    }
    return [currentPage]
  }

  const handleStartOcr = async (pages?: number[]): Promise<void> => {
    if (!data) return alert('Open a PDF first')
    const targetPages = (pages || getPagesToOcr()).filter(
      (page) => !useOcrStore.getState().ocrResults[page]
    )
    if (!targetPages.length) {
      setStatus('Selected pages already have OCR results.')
      return
    }

    useOcrStore.getState().resetCancel()
    setProcessing(true, targetPages[0])
    setProgress(0)
    setStatus(`Starting OCR on ${targetPages.length} page(s)…`)

    const completedPages: Record<number, import('tesseract.js').Page> = {}
    let processedCount = 0
    let doc: import('pdfjs-dist').PDFDocumentProxy | null = null

    try {
      doc = await pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) }).promise
      const worker = await getOcrWorker((p) => setProgress(p))
      for (const p of targetPages) {
        if (useOcrStore.getState().isCancelled) {
          setStatus(`OCR stopped. Processed ${processedCount} of ${targetPages.length} page(s).`)
          break
        }
        setProcessing(true, p)
        setStatus(`OCR page ${p} (${processedCount + 1}/${targetPages.length})…`)
        const existing = await (await doc.getPage(p)).getTextContent()
        if (existing.items.some((item) => 'str' in item && item.str.trim())) {
          setStatus(`Page ${p} already has selectable text; skipped to avoid duplicating it.`)
          continue
        }
        const canvas = await renderPageToCanvas(doc, p, 2.5)
        if (useOcrStore.getState().isCancelled) break
        const { data: result } = await worker.recognize(canvas)

        if (useOcrStore.getState().isCancelled) break
        normaliseWords(result as never, canvas.width, canvas.height)
        setOcrResult(p, result as never)
        completedPages[p] = result as never
        processedCount++
        setProgress(Math.round((processedCount / targetPages.length) * 100))
      }

      const wasCancelled = useOcrStore.getState().isCancelled
      if (!wasCancelled && processedCount > 0) {
        setStatus(`OCR complete – ${processedCount} page(s) recognized.`)
        await onOcrComplete(completedPages)
      }
    } catch (e) {
      if (!useOcrStore.getState().isCancelled) {
        alert('OCR failed: ' + String(e))
        setStatus('Failed: ' + String(e))
      }
    } finally {
      await doc?.destroy()
      if (useOcrStore.getState().isCancelled) {
        const results = { ...useOcrStore.getState().ocrResults }
        for (const page of Object.keys(completedPages)) delete results[Number(page)]
        useOcrStore.setState({ ocrResults: results })
      }
      setProcessing(false, null)
    }
  }

  // Convert scanned PDF to editable: run OCR all then create editable text annotations for each word bbox
  const convertToEditable = async (): Promise<void> => {
    if (!data) return alert('Open a PDF first')
    if (!totalOcred) {
      const ok = confirm(
        'No OCR yet. Run OCR on all pages first, then convert to editable text?\n\nThis will create selectable text boxes from OCR results.'
      )
      if (!ok) return
      setOcrScope('all')
      await handleStartOcr(Array.from({ length: numPages }, (_, i) => i + 1))
    }
    setConverting(true)
    try {
      const store = useAnnotationStore.getState()
      const ocr = useOcrStore.getState().ocrResults
      let added = 0
      for (const [pageStr, pageData] of Object.entries(ocr)) {
        const pageNum = Number(pageStr)
        const words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] =
          (pageData as unknown as { words: typeof words }).words || []
        // Group words into lines? For simplicity create one annotation per word bounding box (editable individually)
        // But too many annotations clutter; instead create one FreeText per line / paragraph? Simpler: one per paragraph block
        // We'll create one text annotation per OCR line (approx by y proximity)
        const blocks = (
          pageData as unknown as {
            paragraphs?: {
              text: string
              bbox: { x0: number; y0: number; x1: number; y1: number }
            }[]
          }
        )?.paragraphs
        if (blocks && blocks.length) {
          for (const block of blocks) {
            if (!block.text?.trim()) continue
            const x = block.bbox.x0
            const y = block.bbox.y0
            const w = block.bbox.x1 - block.bbox.x0
            const h = block.bbox.y1 - block.bbox.y0
            if (w < 0.01 || h < 0.005) continue
            store.addAnnotation({
              id: `ocr-${pageNum}-${added++}`,
              page: pageNum,
              type: 'text',
              x,
              y,
              w,
              h: Math.max(h, 0.02),
              color: '#111827',
              strokeWidth: 1,
              opacity: 1,
              text: block.text.trim(),
              fontSize: Math.max(8, Math.min(18, Math.round(h * 700)))
            } as never)
          }
        } else {
          // Fallback: words -> line grouping by y
          const lines: (typeof words)[] = []
          const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0)
          let cur: typeof words = []
          let curY = -1
          for (const w of sorted) {
            if (curY < 0 || Math.abs(w.bbox.y0 - curY) < 0.012) {
              cur.push(w)
              curY = curY < 0 ? w.bbox.y0 : (curY + w.bbox.y0) / 2
            } else {
              lines.push(cur)
              cur = [w]
              curY = w.bbox.y0
            }
          }
          if (cur.length) lines.push(cur)
          for (const line of lines) {
            const text = line.map((w) => w.text).join(' ')
            if (!text.trim()) continue
            const x0 = Math.min(...line.map((w) => w.bbox.x0))
            const y0 = Math.min(...line.map((w) => w.bbox.y0))
            const x1 = Math.max(...line.map((w) => w.bbox.x1))
            const y1 = Math.max(...line.map((w) => w.bbox.y1))
            const w = x1 - x0,
              h = y1 - y0
            if (w < 0.01) continue
            store.addAnnotation({
              id: `ocr-${pageNum}-${added++}`,
              page: pageNum,
              type: 'text',
              x: x0,
              y: y0,
              w,
              h: Math.max(h, 0.018),
              color: '#111827',
              strokeWidth: 1,
              opacity: 1,
              text: text.trim(),
              fontSize: Math.max(8, Math.min(18, Math.round(h * 680)))
            } as never)
          }
        }
      }
      setStatus(
        `Converted OCR → ${added} editable text boxes. Click any text to edit Font/Size, right-click to remove.`
      )
      alert(
        `OCR converted to ${added} editable text elements. You can now select any text box, change fonts in Edit panel, or right-click to delete.`
      )
    } catch (e) {
      alert('Convert failed: ' + String(e))
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
          SCAN & OCR
        </h3>
        {det.textChars === 0 && !totalOcred && (
          <div className="mb-3 rounded p-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200">
            This document has no selectable text. Run OCR to make its scanned pages searchable.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {/* Page Scope Selection */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              PAGES TO OCR:
            </span>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                className={`tb-btn h-7 text-xs rounded justify-center ${ocrScope === 'current' ? 'bg-blue-600 text-white border-blue-600' : 'border border-zinc-300 dark:border-zinc-700'}`}
                onClick={() => setOcrScope('current')}
                disabled={isProcessing || !data}
              >
                Current ({currentPage})
              </button>
              <button
                type="button"
                className={`tb-btn h-7 text-xs rounded justify-center ${ocrScope === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border border-zinc-300 dark:border-zinc-700'}`}
                onClick={() => setOcrScope('all')}
                disabled={isProcessing || !data}
              >
                All ({numPages})
              </button>
              <button
                type="button"
                className={`tb-btn h-7 text-xs rounded justify-center ${ocrScope === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'border border-zinc-300 dark:border-zinc-700'}`}
                onClick={() => setOcrScope('custom')}
                disabled={isProcessing || !data}
              >
                Custom
              </button>
            </div>
          </div>

          {ocrScope === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 shrink-0">Range:</span>
              <input
                type="text"
                value={customPagesInput}
                onChange={(e) => setCustomPagesInput(e.target.value)}
                placeholder="e.g. 1-3, 5"
                disabled={isProcessing}
                className="flex-1 text-xs px-2 h-7 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                title="Specify custom pages (e.g. 1-3, 5)"
              />
            </div>
          )}

          {/* Action / Stop buttons */}
          {!isProcessing ? (
            <button
              onClick={() => {
                void handleStartOcr()
              }}
              disabled={converting || !data}
              className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 text-center shadow-sm"
            >
              <Icon name="search" size={14} />
              Run OCR (
              {ocrScope === 'current'
                ? `Page ${currentPage}`
                : ocrScope === 'all'
                  ? `All ${numPages} Pages`
                  : `Pages ${customPagesInput}`}
              )
            </button>
          ) : (
            <div className="flex flex-col gap-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
                <span>Recognizing: {progress}%</span>
                <span className="animate-pulse">In progress…</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                onClick={handleStopOcr}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                title="Stop OCR in progress"
              >
                <Icon name="stop" size={12} />
                Stop OCR
              </button>
            </div>
          )}

          <button
            onClick={convertToEditable}
            disabled={isProcessing || converting || !data}
            className="flex items-center gap-2 px-3 py-2 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 text-left"
          >
            <Icon name="edit" size={14} />
            {converting ? 'Converting…' : 'Convert OCR → Editable Text'}
          </button>
          {totalOcred > 0 && (
            <button
              onClick={() => {
                clearOcrResults()
                setStatus('Cleared OCR results')
              }}
              className="text-xs underline text-zinc-500 hover:text-zinc-300 text-left px-1"
            >
              Clear {totalOcred} page(s) OCR cache
            </button>
          )}
          {status && (
            <div
              className="text-xs mt-1 p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              style={{ color: 'var(--acrobat-pane-text)' }}
            >
              {status}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {hasOcrCurrent ? (
          <div className="rounded p-3 text-xs bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300">
            <strong>OCR Complete – page {currentPage}:</strong>{' '}
            {ocrResults[currentPage]?.text?.slice(0, 120)?.trim()
              ? `"${ocrResults[currentPage].text.slice(0, 120)}…" `
              : ''}
            Text is now selectable & searchable. Click “Convert → Editable” to make it editable
            (font/size/color in Edit panel).
          </div>
        ) : (
          <div className="rounded p-3 text-xs bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            Recognize English text in scanned pages offline. The original scan stays intact. Save
            the PDF to keep its searchable text layer.
          </div>
        )}
        <div className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>
          <div>
            Fonts detected: {det.fonts.length ? det.fonts.join(', ') : '— (scanned)'} (
            {det.numFonts})
          </div>
          <div className="mt-1">
            Text chars: {det.textChars} · avg/page: {det.avgCharsPerPage} · pages: {numPages}
          </div>
        </div>
      </div>
    </div>
  )
}
