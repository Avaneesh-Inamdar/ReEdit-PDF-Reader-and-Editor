import { Icon } from './Icon'
import { requestText } from '../lib/requestText'
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
        className="document-toolbar flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto select-none"
        style={{
          height: 36,
          background: 'var(--acrobat-toolbar)',
          borderBottom: '1px solid var(--acrobat-toolbar-border)'
        }}
      >
        {/* Adobe Guide: Page Only | Bookmarks and Page | Thumbnails and Page */}
        <button className={`tb-btn ${leftPane!=='closed'?'active':''}`} onClick={()=> useUIStore.getState().toggleLeftPane()} disabled={!hasDoc} title="Toggle navigation sidebar (F4)" aria-label="Toggle navigation sidebar" aria-expanded={leftPane!=='closed'}>
          <Icon name="pageOnly" />
        </button>
        <button className={`tb-btn ${leftPane==='bookmarks'?'active':''}`} onClick={()=> setLeftPane('bookmarks')} disabled={!hasDoc} title="Bookmarks and Page – show bookmarks">
          <Icon name="bookmark" />
        </button>
        <button className={`tb-btn ${leftPane==='thumbnails'?'active':''}`} onClick={()=> setLeftPane('thumbnails')} disabled={!hasDoc} title="Thumbnails and Page – show thumbnails">
          <Icon name="thumbnails" />
        </button>
        <div className="tb-sep" />
        {/* Group 1: File */}
        <button className="tb-btn" onClick={onOpen} title="Open (Ctrl+O)">
          <Icon name="open" />
        </button>
        <button className="tb-btn" onClick={onSave} disabled={!hasDoc} title="Save (Ctrl+S)">
          <Icon name="save" />
        </button>
        <button className="tb-btn" onClick={() => window.dispatchEvent(new CustomEvent('acrobat:print'))} disabled={!hasDoc} title="Print (Ctrl+P)">
          <Icon name="print" />
        </button>
        <div className="tb-sep" />

        {/* Group 2: Page navigation */}
        <button className="tb-btn" onClick={() => { setCurrentPage(1); document.getElementById('page-1')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage <= 1} title="First Page">
          <Icon name="first" />
        </button>
        <button className="tb-btn" onClick={() => { const p = Math.max(1, currentPage - 1); setCurrentPage(p); document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage <= 1} title="Previous Page">
          <Icon name="previous" />
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
          <Icon name="next" />
        </button>
        <button className="tb-btn" onClick={() => { setCurrentPage(numPages); document.getElementById(`page-${numPages}`)?.scrollIntoView({ behavior: 'smooth' }) }} disabled={!hasDoc || currentPage >= numPages} title="Last Page">
          <Icon name="last" />
        </button>
        <div className="tb-sep" />

        {/* Go Back / Forward – per Adobe Guide */}
        <button className="tb-btn" onClick={()=> {
          const h = useUIStore.getState().goBack()
          if(h){ setCurrentPage(h.page); setZoom(h.zoom); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) }
        }} disabled={!hasDoc} title="Go Back (retrace steps)">
          <Icon name="undo" />
        </button>
        <button className="tb-btn" onClick={()=> {
          const h = useUIStore.getState().goForward()
          if(h){ setCurrentPage(h.page); setZoom(h.zoom); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) }
        }} disabled={!hasDoc} title="Go Forward">
          <Icon name="redo" />
        </button>
        <div className="tb-sep" />

        {/* Group 3: Pointer & Hand + Select Text/Graphics per guide */}
        <button className={`tb-btn ${pointerMode === 'select' && tool === 'select' ? 'active' : ''}`} onClick={() => { setPointerMode('select'); setTool('select') }} title="Select Text tool (V) – select text to Copy">
          <Icon name="select" />
        </button>
        <button className={`tb-btn ${pointerMode === 'selectGraphics' ? 'active' : ''}`} onClick={() => { setPointerMode('selectGraphics'); setTool('select') }} title="Select placed images and annotations">
          <Icon name="image" />
        </button>
        <button className={`tb-btn ${pointerMode === 'hand' ? 'active' : ''}`} onClick={() => setPointerMode('hand')} title="Hand Tool (H) – drag to move page">
          <Icon name="hand" />
        </button>
        <div className="tb-sep" />

        {/* Group 4: Zoom – factor 2 per guide + Actual/Fit Page/Width/Visible */}
        <button className="tb-btn" onClick={() => setZoom( +(zoom/2).toFixed(2) )} disabled={!hasDoc} title="Zoom Out – reduce by factor 2">
          <Icon name="zoomOut" />
        </button>
        <div className="relative" ref={zoomRef}>
          <button
            className="tb-btn"
            onClick={() => setZoomOpen(!zoomOpen)}
            disabled={!hasDoc}
            style={{ minWidth: 56, fontSize: 11 }}
          >
            {Math.round(zoom * 100)}%
            <Icon name="down" />
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
              <div className="zoom-item" onClick={async () => { const v = await requestText('Zoom To:', String(Math.round(zoom*100))); if(v){ const n=parseInt(v,10); if(n>=25&&n<=400) setZoom(n/100) } setZoomOpen(false) }}>Other… (Zoom To)</div>
            </div>
          )}
        </div>
        <button className="tb-btn" onClick={() => setZoom( +(zoom*2).toFixed(2) )} disabled={!hasDoc} title="Zoom In – magnify by factor 2">
          <Icon name="zoomIn" />
        </button>
        <button className="tb-btn" onClick={()=> setZoom(1)} disabled={!hasDoc} title="Actual Size – 100%">1:1</button>
        <button className="tb-btn" onClick={()=> setFitMode('page')} disabled={!hasDoc} title="Fit Page – scale to fit window"><Icon name="fitPage" /></button>
        <button className="tb-btn" onClick={()=> setFitMode('width')} disabled={!hasDoc} title="Fit Width – fill window width"><Icon name="fitWidth" /></button>


        {/* Display mode */}
        <button className={`tb-btn ${displayMode === 'single' ? 'active' : ''}`} onClick={() => setDisplayMode(displayMode === 'single' ? 'continuous' : 'single')} disabled={!hasDoc} title={displayMode === 'single' ? 'Continuous Scroll' : 'Single Page'}>
          <Icon name="pages" />
        </button>
        {/* Rotate */}
        <button className="tb-btn" onClick={() => usePdfStore.getState().setRotation((usePdfStore.getState().rotation + 90) % 360)} disabled={!hasDoc} title="Rotate CW">
          <Icon name="rotate" />
        </button>
        <div className="tb-sep" />

        {/* Group 5: Annotations */}
        <button className={`tb-btn ${tool === 'note' ? 'active' : ''}`} onClick={() => setTool(tool === 'note' ? 'select' : 'note')} disabled={!hasDoc} title="Sticky Note">
          <Icon name="comment" />
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
          <Icon name="highlight" />
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
          <Icon name="underline" />
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
          <Icon name="strike" />
        </button>
        <button className={`tb-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool(tool === 'text' ? 'select' : 'text')} disabled={!hasDoc} title="Add Text Comment">
          <Icon name="text" />
        </button>
        <button className={`tb-btn ${tool === 'draw' ? 'active' : ''}`} onClick={() => setTool(tool === 'draw' ? 'select' : 'draw')} disabled={!hasDoc} title="Freehand Draw">
          <Icon name="draw" />
        </button>
        <button className={`tb-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool(tool === 'eraser' ? 'select' : 'eraser')} disabled={!hasDoc} title="Eraser">
          <Icon name="eraser" />
        </button>

        {/* Shapes dropdown */}
        <div className="relative" ref={shapesRef}>
          <button
            className={`tb-btn ${['rect', 'ellipse', 'arrow'].includes(tool) ? 'active' : ''}`}
            onClick={() => setShapesOpen(!shapesOpen)}
            disabled={!hasDoc}
            title="Shapes"
          >
            <Icon name="rectangle" />
            <Icon name="down" />
          </button>
          {shapesOpen && (
            <div className="zoom-dropdown absolute top-full left-0 mt-1">
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('rect'); setShapesOpen(false) }}>
                <Icon name="rectangle" />
                Rectangle
              </div>
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('ellipse'); setShapesOpen(false) }}>
                <Icon name="ellipse" />
                Ellipse
              </div>
              <div className="zoom-item flex items-center gap-2" onClick={() => { setTool('arrow'); setShapesOpen(false) }}>
                <Icon name="arrow" />
                Arrow
              </div>
            </div>
          )}
        </div>
        <div className="tb-sep" />

        {/* Group 6: Search & Undo/Redo */}
        <button className="tb-btn" onClick={onToggleSearch} disabled={!hasDoc} title="Find (Ctrl+F)">
          <Icon name="search" />
        </button>
        <button className="tb-btn" onClick={performUndo} disabled={!canPerformUndo()} title="Undo (Ctrl+Z)">
          <Icon name="rotateLeft" />
        </button>
        <button className="tb-btn" onClick={performRedo} disabled={!canPerformRedo()} title="Redo (Ctrl+Y)">
          <Icon name="rotate" />
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
