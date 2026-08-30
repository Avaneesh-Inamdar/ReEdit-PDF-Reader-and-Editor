import { useEffect, useState, useRef } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { pdfjsLib } from '../lib/pdfjs'
import { deletePages, rotatePages, insertBlankPage, reorderPages, splitPdf } from '../lib/pdfEditing'

// Organize Pages – real drag-drop reorder, rotate, delete, insert, extract
// refs: Stirling-PDF organize, pdf-lib reorderPages, Adobe Acrobat organize UI, MDN HTML5 DnD

export function OrganizePagesModal(): React.JSX.Element {
  const { data, numPages, rotation, setData, setNumPages, undoPdf, redoPdf, canUndo, canRedo } = usePdfStore()
  const { setActiveModal } = useUIStore()
  const [thumbs, setThumbs] = useState<string[]>([])
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
      setThumbs([])
      setSelected(new Set())
    }
  }

  const handleRedo = (): void => {
    if (redoPdf()) {
      setThumbs([])
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

  // Thumbnails
  useEffect(() => {
    if (!data) return
    let cancelled = false
    const gen = async (): Promise<void> => {
      try {
        const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
        const out: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale: 0.3, rotation })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          canvas.width = viewport.width
          canvas.height = viewport.height
          await (page.render({ canvasContext: ctx, viewport } as never) as unknown as { promise: Promise<void> }).promise
          out[i - 1] = canvas.toDataURL('image/jpeg', 0.8)
          if (!cancelled) setThumbs([...out])
        }
      } catch {}
    }
    gen()
    return () => { cancelled = true }
  }, [data, rotation])

  const applyBytes = async (bytes: Uint8Array): Promise<void> => {
    usePdfStore.getState().pushHistory()
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    setData(buf)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(buf)
      setNumPages(doc.getPageCount())
    } catch {}
    setThumbs([])
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
      const bytes = await reorderPages(data.slice(0), next)
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
      const bytes = await rotatePages(data.slice(0), idxs, deg)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onDelete = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    if (!confirm(`Delete ${idxs.length} page(s)?`)) return
    try {
      setBusy(true)
      const bytes = await deletePages(data.slice(0), idxs)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onInsert = async (): Promise<void> => {
    if (!data) return
    const idxs = getSelectedIndices()
    const at = idxs.length ? Math.max(...idxs) + 1 : numPages
    try {
      setBusy(true)
      const bytes = await insertBlankPage(data.slice(0), at)
      await applyBytes(bytes)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }
  const onExtract = async (): Promise<void> => {
    const idxs = getSelectedIndices()
    if (!idxs.length || !data) return
    try {
      setBusy(true)
      const bytes = await splitPdf(data.slice(0), idxs)
      const name = `extract-pages-${idxs.map(i=>i+1).join('_')}.pdf`
      await window.api.saveFileAs(new Uint8Array(bytes), name)
    } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }

  // Display order: order array maps display position -> original pdf index
  // But after we persist reorder, order resets to identity, so just display by index
  // Keep derived list for rendering
  const displayIndices = order.length === numPages ? order : Array.from({ length: numPages }, (_,i)=>i)

  return (
    <div className="modal-overlay" onClick={() => setActiveModal('none')}>
      <div className="modal-card flex flex-col" style={{ width: '90vw', maxWidth: 1000, height: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-4 shrink-0" style={{ height: 50, borderBottom: '1px solid var(--acrobat-border)', background: 'var(--acrobat-toolbar)' }}>
          <span className="text-sm font-semibold mr-6" style={{ color: 'var(--acrobat-text)' }}>Organize Pages</span>
          <div className="flex items-center gap-1">
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(90)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Rotate CW
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onRotate(-90)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              Rotate CCW
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 12px', color: selected.size ? '#ef5350' : 'inherit' }} disabled={selected.size === 0 || busy} onClick={() => void onDelete()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Delete
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={busy} onClick={() => void onInsert()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Insert
            </button>
            <button className="tb-btn" style={{ padding: '0 12px' }} disabled={selected.size === 0 || busy} onClick={() => void onExtract()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              Extract
            </button>
            <div className="tb-sep" />
            <button className="tb-btn" style={{ padding: '0 10px' }} disabled={!canUndo() || busy} onClick={handleUndo} title="Undo page change (Ctrl+Z)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              Undo
            </button>
            <button className="tb-btn" style={{ padding: '0 10px' }} disabled={!canRedo() || busy} onClick={handleRedo} title="Redo page change (Ctrl+Y)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Redo
            </button>
            {busy && <span className="text-xs ml-2" style={{ color: 'var(--acrobat-text-muted)' }}>Processing…</span>}
          </div>
          <div className="flex-1" />
          <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}>✕</button>
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
              const src = thumbs[origIdx]
              const isDragOver = dragOverIdx === displayPos
              return (
                <div key={`${origIdx}-${displayPos}`} className="flex flex-col items-center gap-2" onDragOver={(e)=> onDragOver(e, displayPos)} onDragLeave={onDragLeave} onDrop={(e)=> void onDropReorder(e, displayPos)}>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
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
