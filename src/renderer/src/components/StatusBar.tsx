import { Icon } from './Icon'
import { requestText } from '../lib/requestText'
import { useState, useEffect, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'

// Adobe Guide p8: Status bar fields and controls
// - window splitter (adjusts overview/document width – drag)
// - page number box (current page, Go to Page dialog)
// - magnification box (current zoom, Zoom To dialog)
// - page size box (size using units from Preferences)

export function StatusBar({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { currentPage, numPages, zoom, setCurrentPage, setZoom, setFitMode, data, isDirty } = usePdfStore()
  const { leftPaneWidth, setLeftPaneWidth, pageUnits, leftPane } = useUIStore()
  const [pageInput, setPageInput] = useState(String(currentPage))
  const [zoomInputOpen, setZoomInputOpen] = useState(false)
  const [pageSize, setPageSize] = useState<{ w:number; h:number } | null>(null)
  const dragRef = useRef<{ startX:number; startW:number } | null>(null)

  useEffect(() => setPageInput(String(currentPage)), [currentPage])

  // Fetch page size for current page (like Acrobat's page size box)
  useEffect(() => {
    if (!pdfDoc) { setPageSize(null); return }
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const page = await pdfDoc.getPage(currentPage)
        const vp = page.getViewport({ scale: 1 })
        if (!cancelled) setPageSize({ w: vp.width, h: vp.height })
      } catch { if(!cancelled) setPageSize(null) }
    }
    run()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage])

  const formatSize = (): string => {
    if (!pageSize) return '--'
    const w = pageSize.w, h = pageSize.h
    if (pageUnits === 'inches') return `${(w/72).toFixed(2)}" x ${(h/72).toFixed(2)}" `
    if (pageUnits === 'millimeters') return `${(w*25.4/72).toFixed(1)} x ${(h*25.4/72).toFixed(1)} mm`
    return `${Math.round(w)} x ${Math.round(h)} pts`
  }

  const onPageGo = (): void => {
    const n = parseInt(pageInput, 10)
    if (n>=1 && n<=numPages) {
      setCurrentPage(n)
      document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth' })
      useUIStore.getState().pushNavHistory(n, zoom)
    } else {
      setPageInput(String(currentPage))
    }
  }

  const onSplitterDown = (e: React.MouseEvent): void => {
    if (leftPane === 'closed') return
    dragRef.current = { startX: e.clientX, startW: leftPaneWidth }
    const onMove = (ev: MouseEvent): void => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const next = Math.max(160, Math.min(420, dragRef.current.startW + dx))
      setLeftPaneWidth(next)
    }
    const onUp = (): void => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const zoomPresets = [0.5,0.75,1,1.25,1.5,2,3,4]

  return (
    <div className="flex items-center h-6 shrink-0 select-none" style={{ background: 'var(--acrobat-chrome)', borderTop: '1px solid var(--acrobat-border)', color: 'var(--acrobat-text-muted)', fontSize: 11 }}>
      {/* Window splitter – drag to adjust overview/document split */}
      <div
        onMouseDown={onSplitterDown}
        title="Drag to adjust overview width (Window splitter)"
        className="flex items-center justify-center shrink-0"
        style={{ width: 12, height: '100%', cursor: leftPane==='closed'?'default':'ew-resize', borderRight: '1px solid var(--acrobat-border)', background: 'var(--acrobat-chrome-alt)' }}
      >
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--acrobat-border-light)' }} />
      </div>

      {/* Page number box – Go to Page dialog on click/Enter */}
      <div className="flex items-center gap-1 px-2">
        <span style={{ color: 'var(--acrobat-text-dim)' }}>Page</span>
        <input
          value={pageInput}
          onChange={e=> setPageInput(e.target.value)}
          onKeyDown={e=> { if(e.key==='Enter') onPageGo(); if(e.key==='Escape') setPageInput(String(currentPage)) }}
          onBlur={onPageGo}
          onClick={e=> (e.target as HTMLInputElement).select()}
          title="Click to Go to Page"
          className="text-center tabular-nums"
          style={{ width: 42, height: 18, borderRadius: 3, border: '1px solid var(--acrobat-input-border)', background: 'var(--acrobat-input-bg)', color: 'var(--acrobat-text)', outline:'none', fontSize: 11 }}
        />
        <span>of {numPages || '--'}</span>
        <button className="tb-btn" style={{ width:22, height:18, fontSize:10 }} onClick={async ()=> {
          const nStr = await requestText(`Go to Page (1-${numPages}):`, String(currentPage))
          if(!nStr) return
          const n = parseInt(nStr,10)
          if(n>=1 && n<=numPages) { setCurrentPage(n); document.getElementById(`page-${n}`)?.scrollIntoView({behavior:'smooth'}) }
        }} title="Go to Page…"><Icon name="external" size={12} /></button>
      </div>

      <div className="w-px h-4 mx-1" style={{ background:'var(--acrobat-border-light)' }} />

      {/* Magnification box – Zoom To dialog */}
      <div className="relative flex items-center gap-1 px-2">
        <span style={{ color:'var(--acrobat-text-dim)' }}>Zoom</span>
        <button
          onClick={()=> setZoomInputOpen(v=>!v)}
          className="tb-btn"
          style={{ height:18, minWidth:64, fontSize:11, border:'1px solid var(--acrobat-input-border)', background:'var(--acrobat-input-bg)' }}
          title="Magnification box – choose or Other… (Zoom To)"
        >
          {Math.round(zoom*100)}%
          <Icon name="down" size={8} />
        </button>
        {zoomInputOpen && (
          <div className="zoom-dropdown absolute bottom-full left-0 mb-1" style={{ minWidth:120 }} onMouseLeave={()=> setZoomInputOpen(false)}>
            {zoomPresets.map(v=> (
              <div key={v} className="zoom-item" onClick={()=> { setZoom(v); setZoomInputOpen(false) }}>{Math.round(v*100)}%</div>
            ))}
            <div className="acrobat-menu-sep" />
            <div className="zoom-item" onClick={()=> { setFitMode('page'); setZoomInputOpen(false) }}>Fit Page</div>
            <div className="zoom-item" onClick={()=> { setFitMode('width'); setZoomInputOpen(false) }}>Fit Width</div>
            <div className="zoom-item" onClick={()=> { setFitMode('page'); setZoomInputOpen(false) }}>Fit Visible</div>
            <div className="zoom-item" onClick={async ()=> {
              const v = await requestText('Zoom To (25-400%):', String(Math.round(zoom*100)))
              if(!v) return
              const n = parseInt(v,10)
              if(n>=25 && n<=400) setZoom(n/100)
              setZoomInputOpen(false)
            }}>Other… (Zoom To)</div>
          </div>
        )}
      </div>

      <div className="w-px h-4 mx-1" style={{ background:'var(--acrobat-border-light)' }} />

      {/* Page size box – units from Preferences */}
      <div className="flex items-center gap-1 px-2" title="Page size box – units from Preferences">
        <span style={{ color:'var(--acrobat-text-dim)' }}>Size:</span>
        <span className="tabular-nums" style={{ color:'var(--acrobat-text)' }}>{formatSize()}</span>
        <span style={{ color:'var(--acrobat-text-dim)', fontSize:10 }}>({pageUnits})</span>
      </div>

      <div className="flex-1" />
      {isDirty && (
        <div className="px-2 text-xs flex items-center gap-1" style={{ color: '#f59e0b' }}>
          • Modified
          <button className="tb-btn" style={{ height:18, fontSize:10, background:'var(--acrobat-accent)', color:'#fff' }} onClick={()=> window.dispatchEvent(new CustomEvent('acrobat:save'))} title="Save – where? Overwrites original if opened via File→Open, otherwise Save As dialog to choose location">Save</button>
        </div>
      )}

      {/* Right: status hints */}
      <div className="px-2 text-[10px] hidden sm:flex items-center gap-2" style={{ color:'var(--acrobat-text-dim)' }}>
        {data ? `${numPages} page${numPages!==1?'s':''} · ${useUIStore.getState().leftPane==='closed'?'Page Only':'Overview on'} · ${useUIStore.getState().displayMode==='single'?'Single':'Continuous'}` : 'No document'}
      </div>
      <div className="w-px h-4 mx-1 hidden sm:block" style={{ background:'var(--acrobat-border-light)' }} />
      <button className="tb-btn hidden sm:flex" style={{ width:22, height:18, fontSize:10 }} onClick={()=> useUIStore.getState().setActiveModal('preferences')} title="Preferences…"><Icon name="settings" /></button>
    </div>
  )
}
