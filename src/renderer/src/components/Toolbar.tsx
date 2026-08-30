import { useState, useRef, useEffect } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { performUndo, performRedo, canPerformUndo, canPerformRedo } from '../lib/undoManager'
import {
  getCurrentTextSelection,
  applyHighlightToSelection,
  applyUnderlineSelection,
  applyStrikeSelection,
  applyTextColorToSelection
} from '../lib/textSelection'

/* ── Acrobat Command Bar ── */
// Group 1: File ops  |  Group 2: Page nav  |  Group 3: Pointer/Hand  |
// Group 4: Zoom/View  |  Group 5: Annotation tools  |  Group 6: Search/Tools
// + Secondary context bar when annotation tool is active

const ZOOM_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
  { label: '300%', value: 3 },
  { label: '400%', value: 4 }
]

const PALETTE = ['#ffee58', '#66bb6a', '#42a5f5', '#ef5350', '#ab47bc', '#ffa726', '#212121']

export function Toolbar({
  onOpen,
  onSave,
  onSaveAs: _onSaveAs,
  onToggleSearch
}: {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleSearch: () => void
}): React.JSX.Element | null {
  const { numPages, currentPage, zoom, setZoom, setFitMode, setCurrentPage, data } = usePdfStore()
  const { tool, setTool, color, setColor, strokeWidth, setStrokeWidth, clearAll, annotations } =
    useAnnotationStore()
  const { pointerMode, setPointerMode, displayMode, setDisplayMode } = useUIStore()
  const [zoomOpen, setZoomOpen] = useState(false)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const zoomRef = useRef<HTMLDivElement>(null)
  const shapesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  // Close dropdowns on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) setZoomOpen(false)
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) setShapesOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const onPageInputKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      const n = parseInt(pageInput, 10)
      if (n >= 1 && n <= numPages) {
        setCurrentPage(n)
        document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  const isAnnotTool = tool !== 'select'
  const hasDoc = !!data
  const leftPane = useUIStore(s=> s.leftPane)
  const setLeftPane = useUIStore(s=> s.setLeftPane)
  const toolbarVisible = useUIStore(s=> s.toolbarVisible)

  if (!toolbarVisible) return null

  return (
    <>
      <div
        className="flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto select-none"
        style={{
          height: 36,
          background: 'var(--acrobat-toolbar)',
          borderBottom: '1px solid var(--acrobat-toolbar-border)'
        }}
      >
        {/* Adobe Guide: Page Only | Bookmarks and Page | Thumbnails and Page */}
        <button className={`tb-btn ${leftPane==='closed'?'active':''}`} onClick={()=> setLeftPane('closed')} disabled={!hasDoc} title="Page Only – close overview area (Adobe Guide)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="9" y1="3" x2="9" y2="21" opacity="0.3"/></svg>
        </button>
        <button className={`tb-btn ${leftPane==='bookmarks'?'active':''}`} onClick={()=> setLeftPane('bookmarks')} disabled={!hasDoc} title="Bookmarks and Page – show bookmarks (Adobe Guide)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><line x1="12" y1="7" x2="12" y2="13"/></svg>
        </button>
        <button className={`tb-btn ${leftPane==='thumbnails'?'active':''}`} onClick={()=> setLeftPane('thumbnails')} disabled={!hasDoc} title="Thumbnails and Page – show thumbnails (Adobe Guide)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
        <div className="tb-sep" />
        {/* Group 1: File */}
        <button className="tb-btn" onClick={onOpen} title="Open (Ctrl+O)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        </button>
        <button className="tb-btn" onClick={onSave} disabled={!hasDoc} title="Save (Ctrl+S)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
        </button>
        <button className="tb-btn" onClick={() => window.dispatchEvent(new CustomEvent('acrobat:print'))} disabled={!hasDoc} title="Print (Ctrl+P)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        </button>
        <div className="tb-sep" />

        {/* Group 2: Page navigation */}
        <button className="tb-btn" onClick={() => { setCurrentPage(1); document.getElementById('page-1')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage <= 1} title="First Page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3 6l8-6v12z" /></svg>
        </button>
        <button className="tb-btn" onClick={() => { const p = Math.max(1, currentPage - 1); setCurrentPage(p); document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage <= 1} title="Previous Page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6l-8 6 8 6z" /></svg>
        </button>
        <div className="flex items-center gap-1">
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={onPageInputKeyDown}
            onBlur={() => setPageInput(String(currentPage))}
            disabled={!hasDoc}
            className="text-center text-xs tabular-nums"
            style={{
              width: 40,
              height: 22,
              borderRadius: 3,
              border: '1px solid var(--acrobat-input-border)',
              background: 'var(--acrobat-input-bg)',
              color: 'var(--acrobat-text)',
              outline: 'none'
            }}
          />
          <span className="text-xs" style={{ color: 'var(--acrobat-text-muted)' }}>/ {numPages || 0}</span>
        </div>
        <button className="tb-btn" onClick={() => { const p = Math.min(numPages, currentPage + 1); setCurrentPage(p); document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage >= numPages} title="Next Page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l8 6-8 6z" /></svg>
        </button>
        <button className="tb-btn" onClick={() => { setCurrentPage(numPages); document.getElementById(`page-${numPages}`)?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage >= numPages} title="Last Page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6l8 6-8 6zm9 0h2v12h-2z" /></svg>
        </button>
        <div className="tb-sep" />

        {/* Go Back / Forward – per Adobe Guide */}
        <button className="tb-btn" onClick={()=> {
          const h = useUIStore.getState().goBack()
          if(h){ setCurrentPage(h.page); setZoom(h.zoom); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) }
        }} disabled={!hasDoc} title="Go Back (retrace steps)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
        </button>
        <button className="tb-btn" onClick={()=> {
          const h = useUIStore.getState().goForward()
          if(h){ setCurrentPage(h.page); setZoom(h.zoom); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) }
        }} disabled={!hasDoc} title="Go Forward">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
        </button>
        <div className="tb-sep" />

        {/* Group 3: Pointer & Hand + Select Text/Graphics per guide */}
        <button className={`tb-btn ${pointerMode === 'select' && tool === 'select' ? 'active' : ''}`} onClick={() => { setPointerMode('select'); setTool('select') }} title="Select Text tool (V) – select text to Copy">
          <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1l4.5 14 2-5.5L13 7z" /></svg>
        </button>
        <button className={`tb-btn ${pointerMode === 'selectGraphics' ? 'active' : ''}`} onClick={() => setPointerMode('selectGraphics')} title="Select Graphics – select graphics (Tools → Select Graphics)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
        </button>
        <button className={`tb-btn ${pointerMode === 'hand' ? 'active' : ''}`} onClick={() => setPointerMode('hand')} title="Hand Tool (H) – drag to move page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v1" /><path d="M10 10.5V5a2 2 0 0 0-4 0v9" /><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
        </button>
        <div className="tb-sep" />

        {/* Group 4: Zoom – factor 2 per guide + Actual/Fit Page/Width/Visible */}
        <button className="tb-btn" onClick={() => setZoom( +(zoom/2).toFixed(2) )} disabled={!hasDoc} title="Zoom Out – reduce by factor 2 (Adobe Guide)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
        <div className="relative" ref={zoomRef}>
          <button
            className="tb-btn"
            onClick={() => setZoomOpen(!zoomOpen)}
            disabled={!hasDoc}
            style={{ minWidth: 56, fontSize: 11 }}
          >
            {Math.round(zoom * 100)}%
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" style={{ marginLeft: 4 }}><path d="M0 0l4 5 4-5z" /></svg>
          </button>
          {zoomOpen && (
            <div className="zoom-dropdown absolute top-full left-0 mt-1">
              {ZOOM_PRESETS.map((p) => (
                <div key={p.label} className="zoom-item" onClick={() => { setZoom(p.value); setZoomOpen(false); useUIStore.getState().pushNavHistory(currentPage, p.value) }}>{p.label}</div>
              ))}
              <div className="acrobat-menu-sep" />
              <div className="zoom-item" onClick={() => { setZoom(1); setZoomOpen(false) }}>Actual Size (100%)</div>
              <div className="zoom-item" onClick={() => { setFitMode('page'); setZoomOpen(false) }}>Fit Page</div>
              <div className="zoom-item" onClick={() => { setFitMode('width'); setZoomOpen(false) }}>Fit Width</div>
              <div className="zoom-item" onClick={() => { const v = prompt('Zoom To:', String(Math.round(zoom*100))); if(v){ const n=parseInt(v,10); if(n>=25&&n<=400) setZoom(n/100) } setZoomOpen(false) }}>Other… (Zoom To)</div>
            </div>
          )}
        </div>
        <button className="tb-btn" onClick={() => setZoom( +(zoom*2).toFixed(2) )} disabled={!hasDoc} title="Zoom In – magnify by factor 2 (Adobe Guide)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
        <button className="tb-btn" onClick={()=> setZoom(1)} disabled={!hasDoc} title="Actual Size – 100% (Adobe Guide)">1:1</button>
        <button className="tb-btn" onClick={()=> setFitMode('page')} disabled={!hasDoc} title="Fit Page – scale to fit window">⊡</button>
        <button className="tb-btn" onClick={()=> setFitMode('width')} disabled={!hasDoc} title="Fit Width – fill window width">↔</button>
        <button className="tb-btn" onClick={()=> {
          // Fit Visible – with Control fills visible text/graphics only (Adobe Guide: Ctrl + Fit Width)
          // Simplified: same as fitWidth but at maxFitVisibleMag limit
          setFitMode('width')
        }} disabled={!hasDoc} title="Fit Visible (Ctrl+Fit Width) – Max Fit Visible mag">◧</button>

        {/* Display mode */}
        <button className={`tb-btn ${displayMode === 'single' ? 'active' : ''}`} onClick={() => setDisplayMode(displayMode === 'single' ? 'continuous' : 'single')} disabled={!hasDoc} title={displayMode === 'single' ? 'Continuous Scroll' : 'Single Page'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" />{displayMode === 'continuous' && <line x1="3" y1="12" x2="21" y2="12" />}</svg>
        </button>
        {/* Rotate */}
        <button className="tb-btn" onClick={() => usePdfStore.getState().setRotation((usePdfStore.getState().rotation + 90) % 360)} disabled={!hasDoc} title="Rotate CW">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>
        <div className="tb-sep" />

        {/* Group 5: Annotations */}
        <button className={`tb-btn ${tool === 'note' ? 'active' : ''}`} onClick={() => setTool(tool === 'note' ? 'select' : 'note')} disabled={!hasDoc} title="Sticky Note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill={tool === 'note' ? '#fef08a' : 'none'} stroke={tool === 'note' ? '#eab308' : 'currentColor'} strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </button>
        <button
          className={`tb-btn ${tool === 'highlight' ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (applyHighlightToSelection(color || '#ffee58')) return
            setTool(tool === 'highlight' ? 'select' : 'highlight')
            setColor('#ffee58')
          }}
          disabled={!hasDoc}
          title="Highlight Text"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tool === 'highlight' ? '#ffee58' : 'currentColor'} strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <button
          className={`tb-btn ${tool === 'underline' ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (applyUnderlineSelection(color || '#66bb6a')) return
            setTool(tool === 'underline' ? 'select' : 'underline')
            setColor('#66bb6a')
          }}
          disabled={!hasDoc}
          title="Underline"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="4" y1="21" x2="20" y2="21" stroke={tool === 'underline' ? '#66bb6a' : 'currentColor'} /></svg>
        </button>
        <button
          className={`tb-btn ${tool === 'strike' ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (applyStrikeSelection(color || '#ef5350')) return
            setTool(tool === 'strike' ? 'select' : 'strike')
            setColor('#ef5350')
          }}
          disabled={!hasDoc}
          title="Strikethrough"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tool === 'strike' ? '#ef5350' : 'currentColor'} strokeWidth="2"><line x1="4" y1="12" x2="20" y2="12" /><path d="M17.5 6.5C17 4.5 15 3 12 3c-3 0-5 2-5 4 0 4 12 4 12 8 0 2.5-2 4.5-5 4.5s-5-2-5-4.5" /></svg>
        </button>
        <button className={`tb-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool(tool === 'text' ? 'select' : 'text')} disabled={!hasDoc} title="Add Text Comment">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
        </button>
        <button className={`tb-btn ${tool === 'draw' ? 'active' : ''}`} onClick={() => setTool(tool === 'draw' ? 'select' : 'draw')} disabled={!hasDoc} title="Freehand Draw">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
        </button>
        <button className={`tb-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool(tool === 'eraser' ? 'select' : 'eraser')} disabled={!hasDoc} title="Eraser">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>
        </button>

        {/* Shapes dropdown */}
        <div className="relative" ref={shapesRef}>
          <button
            className={`tb-btn ${['rect', 'ellipse', 'arrow'].includes(tool) ? 'active' : ''}`}
            onClick={() => setShapesOpen(!shapesOpen)}
            disabled={!hasDoc}
            title="Shapes"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
            <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor" style={{ marginLeft: 2 }}><path d="M0 0l3 4 3-4z" /></svg>
          </button>
          {shapesOpen && (
            <div className="zoom-dropdown absolute top-full left-0 mt-1">
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('rect'); setShapesOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                Rectangle
              </div>
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('ellipse'); setShapesOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="8" /></svg>
                Ellipse
              </div>
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('arrow'); setShapesOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                Arrow
              </div>
            </div>
          )}
        </div>
        <div className="tb-sep" />

        {/* Group 6: Search & Undo/Redo */}
        <button className="tb-btn" onClick={onToggleSearch} disabled={!hasDoc} title="Find (Ctrl+F)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
        <button className="tb-btn" onClick={performUndo} disabled={!canPerformUndo()} title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
        <button className="tb-btn" onClick={performRedo} disabled={!canPerformRedo()} title="Redo (Ctrl+Y)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>

        <div className="flex-1" />
        <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--acrobat-text-dim)' }}>
          {numPages ? `${annotations.length} annotations` : ''}
        </span>
      </div>
      {/* Secondary context bar — when annotation tool active */}
      {isAnnotTool && (
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{
            height: 32,
            background: 'var(--acrobat-chrome-alt)',
            borderBottom: '1px solid var(--acrobat-toolbar-border)'
          }}
        >
          <span className="text-xs" style={{ color: 'var(--acrobat-text-muted)', textTransform: 'capitalize' }}>
            {tool}:
          </span>
          {/* Color palette */}
          <div className="flex items-center gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`color-swatch ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setColor(c)
                  const sel = getCurrentTextSelection()
                  if (sel) {
                    if (tool === 'highlight') applyHighlightToSelection(c)
                    else if (tool === 'underline') applyUnderlineSelection(c)
                    else if (tool === 'strike') applyStrikeSelection(c)
                    else void applyTextColorToSelection(c)
                  }
                }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                const sel = getCurrentTextSelection()
                if (sel) {
                  if (tool === 'highlight') applyHighlightToSelection(e.target.value)
                  else if (tool === 'underline') applyUnderlineSelection(e.target.value)
                  else if (tool === 'strike') applyStrikeSelection(e.target.value)
                  else void applyTextColorToSelection(e.target.value)
                }
              }}
              style={{ width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }}
              title="Custom color"
            />
          </div>
          <div className="tb-sep" />
          {/* Stroke width */}
          <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>Width:</span>
          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="text-xs"
            style={{
              height: 22,
              borderRadius: 3,
              border: '1px solid var(--acrobat-input-border)',
              background: 'var(--acrobat-input-bg)',
              color: 'var(--acrobat-text)',
              padding: '0 4px',
              outline: 'none'
            }}
          >
            <option value={1}>1pt</option>
            <option value={2}>2pt</option>
            <option value={3}>3pt</option>
            <option value={5}>5pt</option>
            <option value={8}>8pt</option>
          </select>
          <div className="tb-sep" />
          <button className="tb-btn" onClick={() => { if (confirm('Clear all annotations?')) clearAll() }} disabled={!annotations.length} style={{ fontSize: 11, color: '#ef5350' }}>
            Clear All
          </button>
        </div>
      )}
    </>
  )
}
