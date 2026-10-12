import { useState, useEffect, useRef } from 'react'
import type { OcrPage } from '../lib/ocrTypes'
import { OPS } from 'pdfjs-dist'
import { PSM } from 'tesseract.js'
import { Icon } from './Icon'
import { usePdfStore } from '../stores/usePdfStore'
import { useOcrStore } from '../stores/useOcrStore'
import { getOcrWorker, terminateOcr, bakeOcrToPdf, preprocessCanvasForOcr } from '../lib/ocr'
import { pdfAssetOptions, pdfjsLib } from '../lib/pdfjs'
import { saveDocument } from '../lib/documentActions'
import { parsePageRange } from '../lib/pageRange'
import { openTool } from '../lib/toolActions'
import { bundledFontData } from '../lib/fonts'
import '../assets/document-operations.css'

export function DetectionPanel(): React.JSX.Element {
  const { data, filePath, currentPage, numPages, setData } = usePdfStore()
  const { setProcessing, setOcrResult, isProcessing, ocrResults, clearOcrResults, cancelOcr } =
    useOcrStore()
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [scope, setScope] = useState<'current' | 'all' | 'custom'>('current')
  const [range, setRange] = useState('1')
  const [quality, setQuality] = useState<'accurate' | 'fast'>('accurate')
  const [layout, setLayout] = useState<'auto' | 'column' | 'block'>('auto')
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const ownsJob = useRef(false)
  useEffect(
    () => () => {
      if (ownsJob.current) {
        cancelOcr()
        void terminateOcr()
      }
    },
    []
  )
  useEffect(() => {
    setStatus('')
    setProgress(0)
    setComplete(false)
  }, [filePath])
  const total = Object.keys(ocrResults).length
  const save = async (copy: boolean): Promise<void> => {
    setSaving(true)
    try {
      const name =
        (usePdfStore.getState().fileName || 'document.pdf').replace(/\.pdf$/i, '') + '_ocr.pdf'
      if (await saveDocument(copy, false, copy ? name : undefined))
        setStatus(
          copy ? 'Searchable copy saved.' : 'Current file overwritten with the searchable PDF.'
        )
    } finally {
      setSaving(false)
    }
  }
  const start = async (): Promise<void> => {
    if (!data) return
    let pages: number[]
    try {
      pages =
        scope === 'current'
          ? [currentPage]
          : scope === 'custom'
            ? parsePageRange(range, numPages).map((p) => p + 1)
            : Array.from({ length: numPages }, (_, i) => i + 1)
    } catch (e) {
      setStatus(String(e))
      return
    }
    ownsJob.current = true
    useOcrStore.getState().resetCancel()
    setProcessing(true, pages[0])
    setComplete(false)
    setProgress(0)
    let doc: import('pdfjs-dist').PDFDocumentProxy | undefined
    const completed: Record<number, OcrPage> = {}
    try {
      doc = await pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) }).promise
      const worker = await getOcrWorker((p) => setProgress(p), quality)
      await worker.setParameters({
        tessedit_pageseg_mode:
          layout === 'column' ? PSM.SINGLE_COLUMN : layout === 'block' ? PSM.SINGLE_BLOCK : PSM.AUTO
      })
      for (let i = 0; i < pages.length; i++) {
        if (useOcrStore.getState().isCancelled) break
        const number = pages[i],
          page = await doc.getPage(number)
        setProcessing(true, number)
        setStatus(`Recognizing page ${number} · ${i + 1} of ${pages.length}`)
        const existing = await page.getTextContent(),
          operators = await page.getOperatorList()
        const hasImage = operators.fnArray.some((op) =>
          [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(
            op
          )
        )
        if (!hasImage && existing.items.some((item) => 'str' in item && item.str.trim())) continue
        const base = page.getViewport({ scale: 1, rotation: 0 })
        const scale = Math.min(
          (quality === 'accurate' ? 300 : 200) / 72,
          Math.sqrt(16000000 / (base.width * base.height))
        )
        const viewport = page.getViewport({ scale, rotation: 0 }),
          canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        try {
          await page.render({
            canvasContext: canvas.getContext('2d')!,
            viewport,
            background: '#ffffff'
          }).promise
          const processed = preprocessCanvasForOcr(canvas)
          let result: import('tesseract.js').Page
          try {
            result = (await worker.recognize(processed)).data
          } finally {
            if (processed !== canvas) processed.width = processed.height = 0
          }
          if (useOcrStore.getState().isCancelled) break
          const seen = new Set<object>()
          const normalize = (value: unknown): void => {
            if (!value || typeof value !== 'object' || seen.has(value)) return
            seen.add(value)
            if (Array.isArray(value)) {
              value.forEach(normalize)
              return
            }
            const item = value as Record<string, unknown>,
              box = item.bbox as { x0: number; x1: number; y0: number; y1: number } | undefined
            if (box && !seen.has(box)) {
              seen.add(box)
              box.x0 /= canvas.width
              box.x1 /= canvas.width
              box.y0 /= canvas.height
              box.y1 /= canvas.height
            }
            for (const key of ['words', 'lines', 'paragraphs', 'blocks', 'symbols'])
              normalize(item[key])
          }
          normalize(result)
          const native = existing.items.flatMap((item) => {
            if (!('str' in item) || !item.str.trim()) return []
            const [x, y] = base.convertToViewportPoint(item.transform[4], item.transform[5]),
              height = Math.max(item.height, Math.abs(item.transform[3]))
            return [
              {
                text: item.str.toLocaleLowerCase(),
                x0: x / base.width,
                x1: (x + item.width) / base.width,
                y0: (y - height) / base.height,
                y1: (y + height * 0.25) / base.height
              }
            ]
          })
          result.words = result.words.filter((word) => {
            const box = word.bbox
            return (
              word.text.trim() &&
              !native.some(
                (item) =>
                  item.text.includes(word.text.toLocaleLowerCase()) &&
                  Math.min(box.x1, item.x1) > Math.max(box.x0, item.x0) &&
                  Math.min(box.y1, item.y1) > Math.max(box.y0, item.y0)
              )
            )
          })
          if (result.words.length)
            completed[number] = {
              text: result.words.map((word) => word.text).join(' '),
              confidence: result.confidence,
              words: result.words.map((word) => ({
                text: word.text,
                bbox: { ...word.bbox },
                confidence: word.confidence
              }))
            }
        } finally {
          canvas.width = canvas.height = 0
          page.cleanup()
        }
        setProgress(Math.round(((i + 1) / pages.length) * 100))
      }
      if (useOcrStore.getState().isCancelled) {
        setStatus('Recognition stopped. The original document is unchanged.')
        return
      }
      if (!Object.keys(completed).length) {
        setStatus('Selected pages already contain usable text, or no additional words were found.')
        return
      }
      setStatus('Embedding searchable text…')
      const baked = await bakeOcrToPdf(
        data.slice(0),
        completed,
        (await bundledFontData('Source Sans 3')) || undefined
      )
      if (usePdfStore.getState().data !== data)
        throw new Error('The document changed during OCR. Run recognition again.')
      usePdfStore.getState().pushHistory()
      setData(baked.slice().buffer as ArrayBuffer)
      for (const [number, result] of Object.entries(completed)) setOcrResult(Number(number), result)
      setComplete(true)
      setProgress(100)
      setStatus('OCR complete. Text is selectable and searchable. Save to keep the result.')
    } catch (e) {
      if (!useOcrStore.getState().isCancelled) setStatus('Recognition failed: ' + String(e))
    } finally {
      await doc?.destroy()
      await terminateOcr()
      ownsJob.current = false
      setProcessing(false, null)
    }
  }
  return (
    <div className="ocr-workflow">
      <section>
        <h3>Recognize text</h3>
        <p className="operation-caption">
          Create a searchable text layer while keeping the scan. Existing digital text is preserved.
        </p>
        <label>
          Pages
          <select
            aria-label="OCR pages"
            value={scope}
            disabled={isProcessing}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="current">Current page ({currentPage})</option>
            <option value="all">All pages ({numPages})</option>
            <option value="custom">Page range</option>
          </select>
        </label>
        {scope === 'custom' && (
          <label>
            Page range
            <input
              type="text"
              aria-label="OCR page range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="1–3, 5"
              disabled={isProcessing}
            />
          </label>
        )}
        <label>
          Recognition quality
          <select
            aria-label="Recognition quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as typeof quality)}
            disabled={isProcessing}
          >
            <option value="accurate">Accurate · best English model</option>
            <option value="fast">Fast · standard English model</option>
          </select>
        </label>
        <label>
          Page layout
          <select
            aria-label="OCR page layout"
            value={layout}
            onChange={(e) => setLayout(e.target.value as typeof layout)}
            disabled={isProcessing}
          >
            <option value="auto">Automatic · columns and blocks</option>
            <option value="column">Single column</option>
            <option value="block">Single text block</option>
          </select>
        </label>
        <p className="operation-caption">English · offline recognition · up to 300 DPI</p>
        {isProcessing ? (
          <>
            <progress value={progress} max="100" aria-label="Recognition progress" />
            <button
              className="operation-secondary"
              onClick={() => {
                cancelOcr()
                void terminateOcr()
                setStatus('Stopping recognition…')
              }}
            >
              <Icon name="stop" size={14} /> Stop recognition
            </button>
          </>
        ) : (
          <button
            className="operation-primary"
            disabled={!data || saving}
            onClick={() => void start()}
          >
            Run OCR (
            {scope === 'current'
              ? 'Page ' + currentPage
              : scope === 'all'
                ? 'All ' + numPages + ' Pages'
                : 'Pages ' + range}
            )
          </button>
        )}
        {status && (
          <div className="ocr-status" role="status" aria-live="polite">
            {status}
          </div>
        )}
      </section>
      {(complete || total > 0) && (
        <section>
          <h3>Save searchable PDF</h3>
          <button
            className="operation-primary"
            disabled={isProcessing || saving}
            onClick={() => void save(true)}
          >
            Save searchable copy
          </button>
          <button
            className="operation-secondary"
            disabled={isProcessing || saving || !filePath}
            onClick={() => void save(false)}
          >
            Overwrite current file
          </button>
          <p className="operation-caption">
            Overwrite saves the recognized document at its current path. Undo remains available in
            this session.
          </p>
          <button
            className="operation-secondary"
            disabled={isProcessing}
            onClick={() => void openTool('edit')}
          >
            Edit recognized text
          </button>
        </section>
      )}
      <section>
        <p className="operation-caption">
          Scan text uses estimated typography. Editing removes the old scan pixels in the selected
          text area; review the replacement before sharing.
        </p>
        {total > 0 && (
          <button
            className="operation-secondary"
            disabled={isProcessing}
            onClick={() => {
              clearOcrResults()
              setComplete(false)
              setStatus('Recognition cache cleared. The searchable PDF is unchanged.')
            }}
          >
            Clear recognition cache
          </button>
        )}
      </section>
    </div>
  )
}
