import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { usePdfStore } from '../stores/usePdfStore'
import { parsePageRange } from '../lib/pageRange'
import { prepareDocument } from '../lib/documentActions'
import { pdfAssetOptions, pdfjsLib } from '../lib/pdfjs'
import { printDocument } from '../lib/printDocument'
import type { PrintOptions, PrinterOption } from '../../../shared/printing'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import '../assets/document-operations.css'
import { connectedPrinter, PDF_DESTINATION } from '../lib/printerDestination'

export function PrintModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { currentPage, numPages, fileName, authenticationId } = usePdfStore()
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [options, setOptions] = useState<PrintOptions>({
    deviceName: PDF_DESTINATION,
    copies: 1,
    collate: true,
    color: true,
    duplex: 'simplex',
    paper: 'A4',
    landscape: false,
    scale: 'fit',
    customScale: 100,
    handling: 'size',
    columns: 2,
    rows: 2,
    pageOrder: 'horizontal',
    printPageBorder: false,
    bookletBinding: 'left',
    bookletSubset: 'both',
    tileScale: 100,
    overlap: 0,
    autoRotate: true,
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
  const [session, setSession] = useState<string | null>(null)
  const [sheetCount, setSheetCount] = useState(numPages)
  const [previewReady, setPreviewReady] = useState(false)
  const autoDestination = useRef(true)
  const preferredDestination = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false,
      loaded: PDFDocumentProxy | undefined,
      loading: import('pdfjs-dist').PDFDocumentLoadingTask | undefined,
      sessionId: string | undefined
    let checking = false
    const refresh = (): void => {
      if (checking) return
      checking = true
      void window.api
        .getPrinters()
        .then((list) => {
          if (!cancelled) {
            setPrinters(list)
            setOptions((old) => {
              const preferred = preferredDestination.current
              const deviceName = autoDestination.current
                ? connectedPrinter(list)
                : preferred === PDF_DESTINATION
                  ? PDF_DESTINATION
                  : list.some((p) => p.name === preferred && p.available !== false)
                    ? preferred!
                    : PDF_DESTINATION
              return deviceName === old.deviceName
                ? old
                : { ...old, deviceName, color: deviceName === PDF_DESTINATION ? true : old.color }
            })
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPrinters([])
            setOptions((old) => ({ ...old, deviceName: PDF_DESTINATION }))
          }
        })
        .finally(() => {
          checking = false
        })
    }
    refresh()
    const poll = setInterval(refresh, 5000)
    void prepareDocument(true)
      .then(async (data) => {
        if (cancelled) return
        if (window.api.beginPrint) {
          sessionId = await window.api.beginPrint(data)
          if (cancelled) {
            void window.api.closePrint?.(sessionId)
            return
          }
          setBytes(data)
          setSession(sessionId)
          return
        }
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
      clearInterval(poll)
      if (sessionId) void window.api.closePrint?.(sessionId)
      void loading?.destroy()
    }
  }, [])
  useEffect(() => {
    if (!doc || !canvas.current || window.api.beginPrint) return
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
  const { selected, rangeError } = useMemo(() => {
    try {
      let selected =
        scope === 'current'
          ? [currentPage]
          : scope === 'custom'
            ? parsePageRange(range, numPages).map((p) => p + 1)
            : Array.from({ length: numPages }, (_, i) => i + 1)
      selected = selected.filter(
        (page) => parity === 'all' || (page % 2 === 1 ? parity === 'odd' : parity === 'even')
      )
      if (reverse) selected.reverse()
      return { selected, rangeError: selected.length ? '' : 'Choose at least one page.' }
    } catch (e) {
      return { selected: [], rangeError: String(e).replace(/^Error: /, '') }
    }
  }, [scope, currentPage, range, numPages, parity, reverse])
  const nativeLayout = !!window.api.beginPrint
  const handling = options.handling || 'size'
  const validPercent = (value: number | undefined): boolean =>
    value !== undefined && Number.isFinite(value) && value >= 1 && value <= 1000
  const layoutError =
    handling === 'size' && options.scale === 'custom' && !validPercent(options.customScale)
      ? 'Custom scale must be between 1 and 1000%.'
      : handling === 'multiple' &&
          ![options.columns, options.rows].every((v) => Number.isInteger(v) && v! >= 1 && v! <= 8)
        ? 'Choose between 1 and 8 rows and columns.'
        : handling === 'poster' && !validPercent(options.tileScale)
          ? 'Tile scale must be between 1 and 1000%.'
          : handling === 'poster' &&
              (!Number.isFinite(options.overlap) ||
                options.overlap! < 0 ||
                options.overlap! >= ((options.paper === 'Letter' ? 612 : 595.276) - 36) / 2)
            ? 'Overlap must be nonnegative and less than half the printable paper width.'
            : ''
  useEffect(() => {
    if (!session || !window.api.previewPrint || rangeError || layoutError) return
    let cancelled = false
    const timer = setTimeout(() => {
      setPreviewReady(false)
      void window.api.previewPrint!(session, { ...options, pages: selected }, preview - 1)
        .then((result) => {
          if (cancelled) return
          setError('')
          setSheetCount(result.sheets)
          if (preview > result.sheets) {
            setPreview(result.sheets)
            return
          }
          const image = new Image()
          image.onload = () => {
            if (cancelled || !canvas.current) return
            const target = canvas.current
            target.width = image.naturalWidth
            target.height = image.naturalHeight
            target.dataset.paperWidth = String(result.width)
            target.dataset.paperHeight = String(result.height)
            target.getContext('2d')!.drawImage(image, 0, 0)
            setPreviewReady(true)
          }
          image.src = result.image
        })
        .catch((e) => {
          if (!cancelled) setError(String(e))
        })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [session, options, preview, selected, rangeError, layoutError])
  const set = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]): void =>
    setOptions((old) => ({ ...old, [key]: value }))
  const print = async (): Promise<void> => {
    if (
      rangeError ||
      layoutError ||
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
      if (session && options.deviceName === PDF_DESTINATION && window.api.exportPrint) {
        const output = await window.api.exportPrint(session, { ...options, pages: selected })
        const saved = await window.api.saveAttachment(
          output,
          (fileName || 'document.pdf').replace(/\.pdf$/i, '') + '-printed.pdf'
        )
        if (!saved) return
      } else if (session && window.api.submitPrint) {
        await window.api.submitPrint(session, { ...options, pages: selected })
      } else await printDocument(setProgress, { ...options, pages: selected }, bytes)
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
                    onChange={(e) => {
                      autoDestination.current = false
                      preferredDestination.current = e.target.value
                      setOptions((old) => ({
                        ...old,
                        deviceName: e.target.value,
                        color: e.target.value === PDF_DESTINATION ? true : old.color
                      }))
                    }}
                  >
                    <option value={PDF_DESTINATION}>Save as PDF</option>
                    {printers.length
                      ? printers.map((p) => (
                          <option key={p.name} value={p.name} disabled={p.available === false}>
                            {p.displayName}
                            {p.isDefault ? ' (default)' : ''}
                            {p.available === false ? ' · offline' : ''}
                          </option>
                        ))
                      : null}
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
                      <option value="gray" disabled={options.deviceName === PDF_DESTINATION}>
                        Grayscale · printer output
                      </option>
                    </select>
                  </label>
                </div>
                {nativeLayout && options.copies > 1 && options.deviceName !== PDF_DESTINATION && (
                  <label className="operation-check">
                    <input
                      type="checkbox"
                      checked={options.collate}
                      disabled={options.copies < 2 || options.deviceName === PDF_DESTINATION}
                      onChange={(e) => set('collate', e.target.checked)}
                    />
                    Collate copies (1, 2, 3 · 1, 2, 3)
                  </label>
                )}
                <label>
                  Two-sided printing
                  <select
                    value={options.duplex}
                    disabled={handling === 'booklet' && options.bookletSubset !== 'both'}
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
                {nativeLayout && (
                  <div className="operation-radio-group print-handling" aria-label="Page handling">
                    {(['size', 'poster', 'multiple', 'booklet'] as const).map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="print-handling"
                          checked={handling === value}
                          onChange={() =>
                            setOptions((old) => ({
                              ...old,
                              handling: value,
                              paper:
                                value !== 'size' && old.paper === 'original' ? 'A4' : old.paper,
                              ...(value === 'booklet'
                                ? {
                                    landscape: true,
                                    duplex:
                                      old.bookletSubset === 'both'
                                        ? ('shortEdge' as const)
                                        : ('simplex' as const)
                                  }
                                : {})
                            }))
                          }
                        />
                        {value === 'size'
                          ? 'Size'
                          : value === 'poster'
                            ? 'Poster'
                            : value === 'multiple'
                              ? 'Multiple'
                              : 'Booklet'}
                      </label>
                    ))}
                  </div>
                )}
                <div className="operation-field-row">
                  <label>
                    Paper
                    <select
                      value={options.paper}
                      onChange={(e) => set('paper', e.target.value as PrintOptions['paper'])}
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="original" disabled={handling !== 'size'}>
                        Original page size
                      </option>
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
                {handling === 'size' && (
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
                    {nativeLayout && (
                      <>
                        <label>
                          <input
                            type="radio"
                            name="print-scale"
                            checked={options.scale === 'shrink'}
                            onChange={() => set('scale', 'shrink')}
                          />
                          Shrink oversized pages
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="print-scale"
                            checked={options.scale === 'custom'}
                            onChange={() => set('scale', 'custom')}
                          />
                          Custom scale
                        </label>
                      </>
                    )}
                  </div>
                )}
                {handling === 'size' && options.scale === 'custom' && (
                  <label>
                    Scale (%)
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={options.customScale}
                      onChange={(e) => set('customScale', Number(e.target.value))}
                    />
                  </label>
                )}
                {handling === 'multiple' && (
                  <>
                    <div className="operation-field-row">
                      <label>
                        Columns
                        <input
                          type="number"
                          min="1"
                          max="8"
                          step="1"
                          value={options.columns}
                          onChange={(e) => set('columns', Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Rows
                        <input
                          type="number"
                          min="1"
                          max="8"
                          step="1"
                          value={options.rows}
                          onChange={(e) => set('rows', Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <label>
                      Page order
                      <select
                        value={options.pageOrder}
                        onChange={(e) =>
                          set('pageOrder', e.target.value as PrintOptions['pageOrder'])
                        }
                      >
                        <option value="horizontal">Horizontal</option>
                        <option value="horizontalReversed">Horizontal reversed</option>
                        <option value="vertical">Vertical</option>
                        <option value="verticalReversed">Vertical reversed</option>
                      </select>
                    </label>
                    <label className="operation-check">
                      <input
                        type="checkbox"
                        checked={options.printPageBorder}
                        onChange={(e) => set('printPageBorder', e.target.checked)}
                      />
                      Print page border
                    </label>
                  </>
                )}
                {handling === 'poster' && (
                  <div className="operation-field-row">
                    <label>
                      Tile scale (%)
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={options.tileScale}
                        onChange={(e) => set('tileScale', Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Overlap (points)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={options.overlap}
                        onChange={(e) => set('overlap', Number(e.target.value))}
                      />
                    </label>
                  </div>
                )}
                {handling === 'booklet' && (
                  <>
                    <div className="operation-field-row">
                      <label>
                        Booklet subset
                        <select
                          value={options.bookletSubset}
                          onChange={(e) =>
                            setOptions((old) => ({
                              ...old,
                              bookletSubset: e.target.value as PrintOptions['bookletSubset'],
                              duplex:
                                e.target.value === 'both'
                                  ? old.landscape
                                    ? 'shortEdge'
                                    : 'longEdge'
                                  : 'simplex'
                            }))
                          }
                        >
                          <option value="both">Both sides</option>
                          <option value="front">Front side only</option>
                          <option value="back">Back side only</option>
                        </select>
                      </label>
                      <label>
                        Binding
                        <select
                          value={options.bookletBinding}
                          onChange={(e) =>
                            set('bookletBinding', e.target.value as PrintOptions['bookletBinding'])
                          }
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </div>
                    <p className="operation-caption">
                      Blank pages complete each group of four. For manual two-sided printing, print
                      front sides, reinsert the sheets following your printer&apos;s instructions,
                      then print back sides.
                    </p>
                  </>
                )}
                {nativeLayout && handling !== 'poster' && (
                  <label className="operation-check">
                    <input
                      type="checkbox"
                      checked={options.autoRotate}
                      onChange={(e) => set('autoRotate', e.target.checked)}
                    />
                    Auto-rotate pages within each sheet
                  </label>
                )}
                {layoutError && (
                  <p role="alert" className="operation-error">
                    {layoutError}
                  </p>
                )}
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
              {!doc && !previewReady && !error && <span>Preparing preview…</span>}
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
                Preview {preview} of {sheetCount}
              </span>
              <button
                className="tb-btn"
                title="Next preview page"
                disabled={preview >= sheetCount}
                onClick={() => setPreview((p) => p + 1)}
              >
                <Icon name="next" />
              </button>
            </div>
            <p className="operation-caption">
              Preview shows the selected pages on the chosen paper, with orientation and scaling
              applied.
            </p>
          </aside>
        </div>
        <footer className="operation-dialog-footer">
          <span role="status">
            {progress ||
              error ||
              (options.deviceName === PDF_DESTINATION
                ? authenticationId
                  ? 'Save an unencrypted copy of this print layout.'
                  : 'Save a PDF of this print layout.'
                : '')}
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
              !!layoutError ||
              !Number.isInteger(options.copies) ||
              options.copies < 1 ||
              options.copies > 999
            }
            onClick={() => void print()}
          >
            {options.deviceName === PDF_DESTINATION ? 'Save PDF' : 'Print'}
          </button>
        </footer>
      </section>
    </div>
  )
}
