import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useThumbnails } from '../lib/useThumbnails'
import { Icon } from './Icon'
import {appConfirm} from '../lib/appDialogs'
import { prepareDocument } from '../lib/documentActions'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useEditStore } from '../stores/useEditStore'
import { useEffect, useState, useRef } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { pdfjsLib, pdfAssetOptions } from '../lib/pdfjs'
import { deletePages, rotatePages, insertBlankPage, reorderPages, splitPdf, cropPages, restorePageBounds, addPageNumbers } from '../lib/pdfEditing'
import type { PageNumberOptions } from '../lib/pdfEditing'
import { selectPage } from '../lib/pageSelection'
import { CropPreview } from './CropPreview'

// Organize Pages – real drag-drop reorder, rotate, delete, insert, extract
// refs: Stirling-PDF organize, pdf-lib reorderPages, Adobe Acrobat organize UI, MDN HTML5 DnD

export function OrganizePagesModal(): React.JSX.Element {
  const { data, numPages, rotation, setData, setNumPages, undoPdf, redoPdf, canUndo, canRedo } = usePdfStore()
  const { setActiveModal } = useUIStore()
  const [thumbnailDoc, setThumbnailDoc] = useState<PDFDocumentProxy | null>(null)
  const thumbnailRoot = useRef<HTMLDivElement>(null)
  const thumbs = useThumbnails(thumbnailDoc, rotation, 0.3, thumbnailRoot)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const selectionAnchor = useRef<number | null>(null)
  const [order, setOrder] = useState<number[]>([])
  const dragIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropMargins, setCropMargins] = useState({ left: '0', right: '0', top: '0', bottom: '0' })
  const [cropError, setCropError] = useState('')
  const [numberingOpen, setNumberingOpen] = useState(false)
  const [firstPageNumber, setFirstPageNumber] = useState('1')
  const [numberingError, setNumberingError] = useState('')
  const [numberOptions, setNumberOptions] = useState<PageNumberOptions>({ position: 'bottom', alignment: 'center', template: '{page}' })

  // Keep order in sync with numPages
  useEffect(() => {
    setOrder(Array.from({ length: numPages }, (_, i) => i))
    selectionAnchor.current = null
  }, [numPages])

  const handleUndo = (): void => {
    if (undoPdf()) {
      setSelected(new Set())
      selectionAnchor.current = null
    }
  }

  const handleRedo = (): void => {
    if (redoPdf()) {
      setSelected(new Set())
      selectionAnchor.current = null
    }
  }

  // Keyboard shortcut for Undo / Redo within Organize Pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof Element && e.target.closest('[aria-modal="true"]')) return
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        e.stopPropagation()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!data) return
    const task = pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) })
    let cancelled = false
    setThumbnailDoc(null)
    void task.promise.then(doc => { if (!cancelled) setThumbnailDoc(doc) }).catch(error => { if (!cancelled) console.warn(error) })
    return () => { cancelled = true; void task.destroy() }
  }, [data])

  const applyBytes = async (bytes: Uint8Array): Promise<void> => {
    usePdfStore.getState().pushHistory()
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    useAnnotationStore.setState({ annotations: [], past: [], future: [], selectedId: null })
    useEditStore.setState({ redactions: [] })
    setData(buf)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(buf)
      setNumPages(doc.getPageCount())
      usePdfStore.getState().setCurrentPage(Math.min(usePdfStore.getState().currentPage, doc.getPageCount()))
      setOrder(Array.from({ length: doc.getPageCount() }, (_, i) => i))
    } catch {}
    setSelected(new Set())
    selectionAnchor.current = null
    // Mark dirty like normal editors (Stirling-PDF, PDFsam) – page ops need save
    try { usePdfStore.getState().setDirty(true) } catch {}
    const tabId = useTabStore.getState().activeTabId
    if (tabId) useTabStore.getState().markDirty(tabId)
  }

  const toggleSelect = (pageIdx: number, toggle: boolean, range: boolean): void => {
    const anchor = selectionAnchor.current
    setSelected((current) => selectPage(current, pageIdx, anchor, { toggle, range }))
    if (!range || selectionAnchor.current === null) selectionAnchor.current = pageIdx
  }

  // Drag-drop reorder (like PDFsam, Stirling-PDF)
  const onDragStart = (e: React.DragEvent, idx: number): void => {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
    // prevent App-level file drop overlay
    e.stopPropagation()
  }
  const onDragOver = (e: React.DragEvent, idx: number): void => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }
  const onDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIdx(null)
  }
  const onDropReorder = async (e: React.DragEvent, targetIdx: number): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIdx(null)
    const src = dragIdx.current
    if (src === null || src === targetIdx || !data) { dragIdx.current = null; return }
    // Reorder display order array (which mirrors pdf page indices 0..n-1)
    const next = [...order]
    const [moved] = next.splice(src, 1)
    next.splice(targetIdx, 0, moved)
    setOrder(next)
    dragIdx.current = null
    // Persist to pdf via pdf-lib (reorderPages) – like PDFtk, qpdf
    try {
      setBusy(true)
      const bytes = await reorderPages((await prepareDocument()).slice().buffer as ArrayBuffer, next)
      await applyBytes(bytes)
      // After reorder, reset order to identity (now pdf is already reordered)
      // keep order as identity; selection maps to new positions
    } catch (err) {
      alert('Reorder failed: ' + String(err))
    } finally {
      setBusy(false)
    }
  }

  const getSelectedIndices = (): number[] => [...selected].sort((a,b)=>a-b)

  const onRotate = async (deg: number): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    try {
      setBusy(true)
      const bytes = await rotatePages((await prepareDocument()).slice().buffer as ArrayBuffer, idxs, deg)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onCrop = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    const values = Object.values(cropMargins)
    if (values.some((value) => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setCropError('Enter a non-negative number for each margin.')
      return
    }
    try {
      setBusy(true)
      setCropError('')
      const bytes = await cropPages((await prepareDocument()).slice().buffer as ArrayBuffer, idxs, {
        left: Number(cropMargins.left), right: Number(cropMargins.right),
        top: Number(cropMargins.top), bottom: Number(cropMargins.bottom)
      })
      await applyBytes(bytes)
      setCropOpen(false)
    } catch (error) {
      setCropError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  const onRestorePageBounds = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    try {
      setBusy(true)
      setCropError('')
      const bytes = await restorePageBounds((await prepareDocument()).slice().buffer as ArrayBuffer, idxs)
      await applyBytes(bytes)
      setCropMargins({ left: '0', right: '0', top: '0', bottom: '0' })
      setCropOpen(false)
    } catch (error) {
      setCropError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  const onAddPageNumbers = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    const first = Number(firstPageNumber)
    if (firstPageNumber.trim() === '' || !Number.isSafeInteger(first) || first < 1) {
      setNumberingError('Enter a positive whole number.')
      return
    }
    try {
      setBusy(true)
      setNumberingError('')
      const bytes = await addPageNumbers((await prepareDocument()).slice().buffer as ArrayBuffer, idxs, first, numberOptions)
      await applyBytes(bytes)
      setNumberingOpen(false)
    } catch (error) {
      setNumberingError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  const onDelete = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    if (!(await appConfirm(`Delete ${idxs.length} page(s)?`))) return
    try {
      setBusy(true)
      const bytes = await deletePages((await prepareDocument()).slice().buffer as ArrayBuffer, idxs)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onInsert = async (): Promise<void> => {
    if (!data) return
    const idxs = getSelectedIndices()
    const at = idxs.length ? Math.max(...idxs) + 1 : numPages
    try {
      setBusy(true)
      const bytes = await insertBlankPage((await prepareDocument()).slice().buffer as ArrayBuffer, at)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onExtract = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    try {
      setBusy(true)
      const bytes = await splitPdf((await prepareDocument()).slice().buffer as ArrayBuffer, idxs)
      const name = `extract-pages-${idxs.map(i=>i+1).join('_')}.pdf`
      const authenticationId = usePdfStore.getState().authenticationId
      if (authenticationId) await window.api.saveFileAs(new Uint8Array(bytes), name, authenticationId)
      else await window.api.saveFileAs(new Uint8Array(bytes), name)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }

  // Display order: order array maps display position -> original pdf index
  // But after we persist reorder, order resets to identity, so just display by index
  // Keep derived list for rendering
  const displayIndices = order.length === numPages ? order : Array.from({ length: numPages }, (_,i)=>i)

  return (
    <div ref={thumbnailRoot} className="modal-overlay" onClick={() => setActiveModal('none')}>
      <div className="modal-card flex flex-col" style={{ width: '90vw', maxWidth: 1000, height: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-4 shrink-0" style={{ height: 50, borderBottom: '1px solid var(--acrobat-border)', background: 'var(--acrobat-toolbar)' }}>
          <span className="text-sm font-semibold mr-6" style={{ color: 'var(--acrobat-text)' }}>Organize Pages</span>
          <div className="flex items-center gap-1" style={{ overflowX: 'auto', minWidth: 0 }}>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(90)}>
              <Icon name="rotate" />
              Rotate CW
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(-90)}>
              <Icon name="rotateLeft" />
              Rotate CCW
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => { setCropError(''); setCropOpen(true) }}>
              Crop
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => { setNumberingError(''); setNumberingOpen(true) }}>
              Page numbers
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 12px', color: selected.size ? '#ef5350' : 'inherit' }} disabled={selected.size === 0 || busy} onClick={() => void onDelete()}>
              <Icon name="delete" />
              Delete
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={busy} onClick={() => void onInsert()}>
              <Icon name="plus" />
              Insert
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onExtract()}>
              <Icon name="document" />
              Extract
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 10px' }} disabled={!canUndo() || busy} onClick={handleUndo} title="Undo page change (Ctrl+Z)">
              <Icon name="undo" />
              Undo
            </button>
            <button className="tb-btn" style={{ padding: '0 10px' }} disabled={!canRedo() || busy} onClick={handleRedo} title="Redo page change (Ctrl+Y)">
              <Icon name="redo" />
              Redo
            </button>
            {busy && <span className="text-xs ml-2" style={{ color: 'var(--acrobat-text-muted)' }}>Processing…</span>}
          </div>
          <div className="flex-1" />
          <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}><Icon name="close" /></button>
        </div>

        <div className="flex-1 overflow-auto p-8" style={{ background: 'var(--acrobat-canvas)' }}>
          <div className="text-xs mb-4 text-center" style={{ color: 'var(--acrobat-text-muted)' }}>
            Drag pages to reorder · Ctrl+click toggles pages · Shift+click selects a range
          </div>
          <div
            className="flex flex-wrap gap-6 justify-center max-w-6xl mx-auto"
            onDragOver={(e)=> { e.preventDefault(); e.stopPropagation() }}
            onDrop={(e)=> { e.preventDefault(); e.stopPropagation() }}
          >
            {displayIndices.map((origIdx, displayPos) => {
              const active = selected.has(origIdx)
              const src = thumbs[origIdx+1]
              const isDragOver = dragOverIdx === displayPos
              return (
                <div key={`${origIdx}-${displayPos}`} data-thumbnail={origIdx+1} className="flex flex-col items-center gap-2" onDragOver={(e)=> onDragOver(e, displayPos)} onDragLeave={onDragLeave} onDrop={(e)=> void onDropReorder(e, displayPos)}>
                  <div
                    draggable
                    role="button"
                    aria-label={`Select page ${origIdx + 1}`}
                    aria-pressed={active}
                    tabIndex={busy ? -1 : 0}
                    onKeyDown={(e) => {
                      if (!busy && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault()
                        toggleSelect(origIdx, e.ctrlKey || e.metaKey, e.shiftKey)
                      }
                    }}
                    onDragStart={(e)=> onDragStart(e, displayPos)}
                    onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null) }}
                    className="org-page-card"
                    style={{
                      width: 160,
                      height: 220,
                      borderColor: active ? 'var(--acrobat-accent)' : isDragOver ? '#22c55e' : 'transparent',
                      borderWidth: isDragOver ? 3 : 2,
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      opacity: busy ? 0.6 : 1
                    }}
                    onClick={(e) => { if (!busy) toggleSelect(origIdx, e.ctrlKey || e.metaKey, e.shiftKey) }}
                    title="Drag to reorder, click to select"
                  >
                    {src ? (
                      <img src={src} alt={`Page ${origIdx + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                    ) : (
                      <div style={{ width: '80%', height: '80%', background: 'var(--acrobat-pane-hover)' }} />
                    )}
                    {active && (
                      <div className="absolute top-2 left-2 bg-blue-600 rounded-sm w-5 h-5 flex items-center justify-center border border-blue-700">
                        <Icon name="check" />
                      </div>
                    )}
                    {isDragOver && <div className="absolute inset-0 pointer-events-none" style={{ border: '2px dashed #22c55e' }} />}
                  </div>
                  <span className="text-xs font-medium" style={{ color: active ? 'var(--acrobat-accent)' : 'var(--acrobat-text)' }}>
                    {origIdx + 1}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 44, borderTop: '1px solid var(--acrobat-border)', background: 'var(--acrobat-chrome)' }}>
          <span className="text-xs" style={{ color: 'var(--acrobat-text-muted)' }}>
            {selected.size} page{selected.size !== 1 ? 's' : ''} selected · {numPages} total · drag to reorder
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveModal('none')}
              className="rounded text-xs font-medium text-white px-4"
              style={{ height: 30, background: 'var(--acrobat-accent)' }}
            >
              Done
            </button>
          </div>
        </div>
        {cropOpen && (
          <div className="modal-overlay" onClick={(event) => event.stopPropagation()}>
            <form className="modal-card p-5" role="dialog" aria-modal="true" aria-labelledby="crop-title" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); setCropOpen(false) } }} onSubmit={(event) => { event.preventDefault(); void onCrop() }} style={{ width: 760, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
              <h2 id="crop-title" className="text-lg font-semibold">Crop selected pages</h2>
              <p className="text-sm my-3">Drag the edges or enter margins in PDF points (72 points per inch). Preview shows the first selected page in its unrotated orientation. Cropping hides content; it does not remove it. Restore full page reveals content within the original page bounds.</p>
              <div style={{ display: 'flex', gap: 24, alignItems: 'start', flexWrap: 'wrap' }}>
              <CropPreview pdf={thumbnailDoc} pageNumber={Math.min(...selected) + 1} margins={cropMargins} onChange={(side, value) => setCropMargins((current) => ({ ...current, [side]: value }))} />
              <div style={{ flex: '1 1 220px' }}>
              <div className="grid grid-cols-2 gap-3">
                {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
                  <label key={side} className="flex flex-col gap-1 text-sm">
                    {side[0].toUpperCase() + side.slice(1)}
                    <input type="number" min="0" step="any" required autoFocus={side === 'left'} value={cropMargins[side]} onChange={(event) => setCropMargins({ ...cropMargins, [side]: event.target.value })} style={{ color: 'var(--acrobat-text)', background: 'var(--acrobat-pane-bg)', border: '1px solid var(--acrobat-border)', padding: 6 }} />
                  </label>
                ))}
              </div>
              {cropError && <p role="alert" className="text-sm my-2" style={{ color: '#d33' }}>{cropError}</p>}
              </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" className="operation-secondary" disabled={busy} onClick={() => void onRestorePageBounds()}>Restore full page</button>
                <button type="button" className="operation-secondary" disabled={busy} onClick={() => setCropOpen(false)}>Cancel</button>
                <button type="submit" className="operation-primary" disabled={busy}>Crop {selected.size} page{selected.size === 1 ? '' : 's'}</button>
              </div>
            </form>
          </div>
        )}
        {numberingOpen && (
          <div className="modal-overlay" onClick={(event) => event.stopPropagation()}>
            <form className="modal-card p-5" role="dialog" aria-modal="true" aria-labelledby="page-numbers-title" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); setNumberingOpen(false) } }} onSubmit={(event) => { event.preventDefault(); void onAddPageNumbers() }} style={{ width: 440, maxWidth: '90vw' }}>
              <h2 id="page-numbers-title" className="text-lg font-semibold">Add page numbers</h2>
              <p className="text-sm my-3">Add a header or footer to {selected.size} selected page{selected.size === 1 ? '' : 's'}. The first page of the document uses the number below; unselected pages retain their positions in the sequence. Adding again creates another label.</p>
              <label className="flex flex-col gap-1 text-sm">First page number
                <input type="number" min="1" step="1" required autoFocus value={firstPageNumber} onChange={(event) => setFirstPageNumber(event.target.value)} style={{ color: 'var(--acrobat-text)', background: 'var(--acrobat-pane-bg)', border: '1px solid var(--acrobat-border)', padding: 6 }} />
              </label>
              <label className="flex flex-col gap-1 text-sm mt-3">Label text
                <input type="text" maxLength={120} required value={numberOptions.template} onChange={(event) => { const template = event.target.value; setNumberOptions((current) => ({ ...current, template })) }} style={{ color: 'var(--acrobat-text)', background: 'var(--acrobat-pane-bg)', border: '1px solid var(--acrobat-border)', padding: 6 }} />
              </label>
              <p className="text-xs mt-1">Use {'{page}'} for the page number and {'{total}'} for the document page count.</p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className="flex flex-col gap-1 text-sm">Position
                  <select value={numberOptions.position} onChange={(event) => { const position = event.target.value as PageNumberOptions['position']; setNumberOptions((current) => ({ ...current, position })) }} style={{ color: 'var(--acrobat-text)', background: 'var(--acrobat-pane-bg)', border: '1px solid var(--acrobat-border)', padding: 6 }}>
                    <option value="bottom">Footer</option><option value="top">Header</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">Alignment
                  <select value={numberOptions.alignment} onChange={(event) => { const alignment = event.target.value as PageNumberOptions['alignment']; setNumberOptions((current) => ({ ...current, alignment })) }} style={{ color: 'var(--acrobat-text)', background: 'var(--acrobat-pane-bg)', border: '1px solid var(--acrobat-border)', padding: 6 }}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                </label>
              </div>
              {numberingError && <p role="alert" className="text-sm my-2" style={{ color: '#d33' }}>{numberingError}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" className="operation-secondary" disabled={busy} onClick={() => setNumberingOpen(false)}>Cancel</button>
                <button type="submit" className="operation-primary" disabled={busy}>Add page numbers</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
