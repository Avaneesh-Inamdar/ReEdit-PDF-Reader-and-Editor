import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useThumbnails } from '../lib/useThumbnails'
import { Icon } from './Icon'
import { prepareDocument } from '../lib/documentActions'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useEditStore } from '../stores/useEditStore'
import { useEffect, useState, useRef } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { pdfjsLib, pdfAssetOptions } from '../lib/pdfjs'
import { deletePages, rotatePages, insertBlankPage, reorderPages, splitPdf } from '../lib/pdfEditing'

// Organize Pages – real drag-drop reorder, rotate, delete, insert, extract
// refs: Stirling-PDF organize, pdf-lib reorderPages, Adobe Acrobat organize UI, MDN HTML5 DnD

export function OrganizePagesModal(): React.JSX.Element {
  const { data, numPages, rotation, setData, setNumPages, undoPdf, redoPdf, canUndo, canRedo } = usePdfStore()
  const { setActiveModal } = useUIStore()
  const [thumbnailDoc, setThumbnailDoc] = useState<PDFDocumentProxy | null>(null)
  const thumbnailRoot = useRef<HTMLDivElement>(null)
  const thumbs = useThumbnails(thumbnailDoc, rotation, 0.3, thumbnailRoot)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [order, setOrder] = useState<number[]>([])
  const dragIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Keep order in sync with numPages
  useEffect(() => {
    setOrder(Array.from({ length: numPages }, (_, i) => i))
  }, [numPages])

  const handleUndo = (): void => {
    if (undoPdf()) {
      setSelected(new Set())
    }
  }

  const handleRedo = (): void => {
    if (redoPdf()) {
      setSelected(new Set())
    }
  }

  // Keyboard shortcut for Undo / Redo within Organize Pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
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
    // Mark dirty like normal editors (Stirling-PDF, PDFsam) – page ops need save
    try { usePdfStore.getState().setDirty(true) } catch {}
    const tabId = useTabStore.getState().activeTabId
    if (tabId) useTabStore.getState().markDirty(tabId)
  }

  const toggleSelect = (pageIdx: number, multi: boolean): void => {
    const s = new Set(multi ? selected : [])
    if (s.has(pageIdx)) s.delete(pageIdx)
    else s.add(pageIdx)
    setSelected(s)
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
  const onDelete = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    if (!confirm(`Delete ${idxs.length} page(s)?`)) return
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
      await window.api.saveFileAs(new Uint8Array(bytes), name)
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
          <div className="flex items-center gap-1">
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(90)}>
              <Icon name="rotate" />
              Rotate CW
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(-90)}>
              <Icon name="rotateLeft" />
              Rotate CCW
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
            Drag pages to reorder · Click to select (Ctrl+click multi) · Selected actions affect highlighted pages
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
                    onClick={(e) => toggleSelect(origIdx, e.ctrlKey || e.metaKey || e.shiftKey)}
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
      </div>
    </div>
  )
}
