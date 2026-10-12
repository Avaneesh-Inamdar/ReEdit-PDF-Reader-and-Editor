import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { usePdfStore } from '../stores/usePdfStore'
import { parsePageRange } from '../lib/pageRange'
import { prepareDocument } from '../lib/documentActions'
import { pdfAssetOptions, pdfjsLib } from '../lib/pdfjs'
import { printDocument } from '../lib/printDocument'
import type { PrintOptions, PrinterOption } from '../../../shared/printing'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import '../assets/document-operations.css'

export function PrintModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { currentPage, numPages, fileName } = usePdfStore()
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [options, setOptions] = useState<PrintOptions>({
    deviceName: '',
    copies: 1,
    color: true,
    duplex: 'simplex',
    paper: 'A4',
    landscape: false,
    scale: 'fit',
    pages: []
  })
  const [scope, setScope] = useState<'all' | 'current' | 'custom'>('all')
  const [range, setRange] = useState('1')
  const [parity, setParity] = useState('all')
  const [reverse, setReverse] = useState(false)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | undefined>()
  const [preview, setPreview] = useState(currentPage)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false,
      loaded: PDFDocumentProxy | undefined,
      loading: import('pdfjs-dist').PDFDocumentLoadingTask | undefined
    void window.api
      .getPrinters()
      .then((list) => {
        if (!cancelled) {
          setPrinters(list)
          setOptions((old) => ({
            ...old,
            deviceName: (list.find((p) => p.isDefault) || list[0])?.name || ''
          }))
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    void prepareDocument(true)
      .then(async (data) => {
        if (cancelled) return
        loading = pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice() })
        loaded = await loading.promise
        if (cancelled) {
          void loading.destroy()
          return
        }
        setBytes(data)
        setDoc(loaded)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
      void loading?.destroy()
    }
  }, [])
  useEffect(() => {
    if (!doc || !canvas.current) return
    let cancelled = false,
      task: import('pdfjs-dist').RenderTask | undefined
    void doc
      .getPage(preview)
      .then((page) => {
        if (cancelled || !canvas.current) return
        const size = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(700 / size.width, 900 / size.height) })
        canvas.current.width = Math.ceil(viewport.width)
        canvas.current.height = Math.ceil(viewport.height)
        task = page.render({ canvasContext: canvas.current.getContext('2d')!, viewport })
        return task.promise
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, preview])
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !progress) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [progress, onClose])
  let selected: number[] = [],
    rangeError = ''
  try {
    selected =
      scope === 'current'
        ? [currentPage]
        : scope === 'custom'
          ? parsePageRange(range, numPages).map((p) => p + 1)
          : Array.from({ length: numPages }, (_, i) => i + 1)
    selected = selected.filter(
      (page) => parity === 'all' || (page % 2 === 1 ? parity === 'odd' : parity === 'even')
    )
    if (reverse) selected.reverse()
    if (!selected.length) rangeError = 'Choose at least one page.'
  } catch (e) {
    rangeError = String(e).replace(/^Error: /, '')
  }
  const set = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]): void =>
    setOptions((old) => ({ ...old, [key]: value }))
  const print = async (): Promise<void> => {
    if (
      rangeError ||
      !bytes ||
      !options.deviceName ||
      !Number.isInteger(options.copies) ||
      options.copies < 1 ||
      options.copies > 999
    )
      return
    setError('')
    setProgress('Preparing print job…')
    try {
      await printDocument(setProgress, { ...options, pages: selected }, bytes)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setProgress(null)
    }
  }
  return (
    <div className="modal-overlay">
      <section className="print-dialog" role="dialog" aria-modal="true" aria-label="Print document">
        <header className="operation-dialog-header">
          <div>
            <h2>Print</h2>
            <p>{fileName}</p>
          </div>
          <button
            className="tb-btn"
            title="Close print dialog"
            disabled={!!progress}
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="print-dialog-body">
          <div className="print-settings">
            <fieldset disabled={!!progress}>
              <section>
                <h3>Printer</h3>
                <label>
                  Destination
                  <select
                    aria-label="Printer"
                    value={options.deviceName}
                    onChange={(e) => set('deviceName', e.target.value)}
                  >
                    {printers.length ? (
                      printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName}
                          {p.isDefault ? ' (default)' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="">No printers available</option>
                    )}
                  </select>
                </label>
                <div className="operation-field-row">
                  <label>
                    Copies
                    <input
                      aria-label="Copies"
                      type="number"
                      min="1"
                      max="999"
                      value={options.copies}
                      onChange={(e) => set('copies', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Output
                    <select
                      value={options.color ? 'color' : 'gray'}
                      onChange={(e) => set('color', e.target.value === 'color')}
                    >
                      <option value="color">Color</option>
                      <option value="gray">Grayscale</option>
                    </select>
                  </label>
                </div>
                <label>
                  Two-sided printing
                  <select
                    value={options.duplex}
                    onChange={(e) => set('duplex', e.target.value as PrintOptions['duplex'])}
                  >
                    <option value="simplex">One-sided</option>
                    <option value="longEdge">Two-sided · long edge</option>
                    <option value="shortEdge">Two-sided · short edge</option>
                  </select>
                </label>
              </section>
              <section>
                <h3>Pages to print</h3>
                <div className="operation-radio-group">
                  {(['all', 'current', 'custom'] as const).map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="print-scope"
                        checked={scope === value}
                        onChange={() => setScope(value)}
                      />
                      {value === 'all'
                        ? 'All pages'
                        : value === 'current'
                          ? `Current page (${currentPage})`
                          : 'Page range'}
                    </label>
                  ))}
                </div>
                {scope === 'custom' && (
                  <input
                    className="operation-range"
                    aria-label="Print page range"
                    value={range}
                    placeholder="1–3, 5, 8"
                    onChange={(e) => setRange(e.target.value)}
                  />
                )}
                <label>
                  Include
                  <select value={parity} onChange={(e) => setParity(e.target.value)}>
                    <option value="all">All selected pages</option>
                    <option value="odd">Odd pages only</option>
                    <option value="even">Even pages only</option>
                  </select>
                </label>
                <label className="operation-check">
                  <input
                    type="checkbox"
                    checked={reverse}
                    onChange={(e) => setReverse(e.target.checked)}
                  />
                  Reverse page order
                </label>
                {rangeError && (
                  <p role="alert" className="operation-error">
                    {rangeError}
                  </p>
                )}
              </section>
              <section>
                <h3>Page sizing & handling</h3>
                <div className="operation-field-row">
                  <label>
                    Paper
                    <select
                      value={options.paper}
                      onChange={(e) => set('paper', e.target.value as PrintOptions['paper'])}
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="original">Original page size</option>
                    </select>
                  </label>
                  <label>
                    Orientation
                    <select
                      value={options.landscape ? 'landscape' : 'portrait'}
                      onChange={(e) => set('landscape', e.target.value === 'landscape')}
                    >
                      <option value="portrait">Portrait / original</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                </div>
                <div className="operation-radio-group">
                  <label>
                    <input
                      type="radio"
                      name="print-scale"
                      checked={options.scale === 'fit'}
                      onChange={() => set('scale', 'fit')}
                    />
                    Fit to paper
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="print-scale"
                      checked={options.scale === 'actual'}
                      onChange={() => set('scale', 'actual')}
                    />
                    Actual size
                  </label>
                </div>
              </section>
            </fieldset>
          </div>
          <aside className="print-preview">
            <div className="print-preview-heading">
              <span>Document preview</span>
              <span>
                {selected.length} page{selected.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div className="print-preview-sheet">
              <canvas ref={canvas} />
              {!doc && !error && <span>Preparing preview…</span>}
            </div>
            <div className="print-preview-navigation">
              <button
                className="tb-btn"
                title="Previous preview page"
                disabled={preview <= 1}
                onClick={() => setPreview((p) => p - 1)}
              >
                <Icon name="previous" />
              </button>
              <span>
                Page {preview} of {numPages}
              </span>
              <button
                className="tb-btn"
                title="Next preview page"
                disabled={preview >= numPages}
                onClick={() => setPreview((p) => p + 1)}
              >
                <Icon name="next" />
              </button>
            </div>
            <p className="operation-caption">
              Preview shows the document content. Paper size and scaling apply to the print job.
            </p>
          </aside>
        </div>
        <footer className="operation-dialog-footer">
          <span role="status">
            {progress || error || (!printers.length ? 'Add a printer in system settings.' : '')}
          </span>
          <button className="operation-secondary" disabled={!!progress} onClick={onClose}>
            Cancel
          </button>
          <button
            className="operation-primary"
            disabled={
              !!progress ||
              !bytes ||
              !options.deviceName ||
              !!rangeError ||
              options.copies < 1 ||
              options.copies > 999
            }
            onClick={() => void print()}
          >
            Print
          </button>
        </footer>
      </section>
    </div>
  )
}
