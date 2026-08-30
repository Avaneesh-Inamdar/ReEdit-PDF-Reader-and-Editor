import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { useOcrStore } from '../stores/useOcrStore'
import { AnnotationLayer } from './AnnotationLayer'
import { performUndo, performRedo } from '../lib/undoManager'
import { getCurrentTextSelection, type TextSelectionInfo } from '../lib/textSelection'
import { TextSelectionFloatingToolbar } from './TextSelectionFloatingToolbar'

/* ── Acrobat Document Viewer ── */
// - Authentic canvas background (#525659 classic / themed)
// - Realistic page drop shadows
// - Hand tool panning (click+drag with grab cursor)
// - Spacebar temporary hand toggle
// - Floating bottom HUD with page/zoom controls (auto-hide)
// - Single page vs continuous display mode

function PageCanvas({
  pdfDoc,
  pageNumber,
  zoom,
  rotation,
  searchQuery
}: {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  rotation: number
  searchQuery: string
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const linkLayerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number } | null>(null)

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const page = await pdfDoc.getPage(pageNumber)

    let scale = zoom
    if (!Number.isFinite(scale) || scale < 0.1) scale = 1
    if (scale > 10) scale = 10

    const viewport = page.getViewport({ scale, rotation })
    setViewportSize({ w: viewport.width, h: viewport.height })
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch {}
    }
    const task = page.render({ canvasContext: ctx as never, viewport } as never) as unknown as { promise: Promise<void>; cancel: () => void }
    renderTaskRef.current = task
    try {
      await task.promise
    } catch (e) {
      if ((e as Error)?.name !== 'RenderingCancelledException') console.warn(e)
    }

    if (textLayerRef.current) {
      const textContent = await page.getTextContent()
      textLayerRef.current.innerHTML = ''
      textLayerRef.current.style.width = `${viewport.width}px`
      textLayerRef.current.style.height = `${viewport.height}px`
      textLayerRef.current.style.lineHeight = '1'
      const textLayerDiv = textLayerRef.current
      try {
        const { searchMatches, currentMatch } = usePdfStore.getState()
        const query = searchQuery.toLowerCase()
        // Use pdf.js-like positioning: Util.transform(viewport.transform, item.transform)
        // Items already contain transform in PDF coords; viewport.transform converts to CSS.
        // y is baseline in CSS, top = y - fontSize*0.8 (ascent)
        for (let idx = 0; idx < (textContent.items as unknown as Array<{ str: string; transform: number[]; fontName?: string; width?: number }>).length; idx++) {
          const item = (textContent.items as unknown as Array<{ str: string; transform: number[]; fontName?: string; width?: number }>)[idx]
          if (!item.str) continue
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.position = 'absolute'
          span.style.whiteSpace = 'pre'
          span.style.cursor = 'text'
          span.style.transformOrigin = '0% 0%'
          span.style.lineHeight = '1'
          span.style.color = 'transparent'
          // Use actual font if available, fallback sans-serif – like pdf.js & Adobe
          const fontName = (item as unknown as { fontName?: string }).fontName
          span.style.fontFamily = fontName ? `${fontName}, sans-serif` : 'sans-serif'
          const [a, b, , , e, f] = item.transform
          const x = viewport.transform[0] * e + viewport.transform[2] * f + viewport.transform[4]
          const y = viewport.transform[1] * e + viewport.transform[3] * f + viewport.transform[5]
          const fontSize = Math.hypot(a, b) * scale
          // y is baseline (CSS), top is baseline - ascent
          span.style.left = `${x}px`
          span.style.top = `${y - fontSize * 0.8}px`
          span.style.fontSize = `${fontSize}px`
          span.style.userSelect = 'text'
          span.style.pointerEvents = 'auto'
          // Match pdf.js handling of width for accurate selection – set width if known
          const w = (item as unknown as { width?: number }).width
          if (w) span.style.width = `${w * scale}px`
          if (query && item.str.toLowerCase().includes(query)) {
            const isCurrent = searchMatches[currentMatch]?.page === pageNumber && searchMatches[currentMatch]?.index === idx
            span.style.background = isCurrent ? 'rgba(255, 193, 7, 0.75)' : 'rgba(255,238,88,0.45)'
            span.style.color = 'rgba(0,0,0,0.9)'
            span.style.borderRadius = '2px'
            if (isCurrent) {
              span.style.outline = '1px solid #ff9800'
              span.style.zIndex = '1'
            }
          }
          textLayerDiv.appendChild(span)
        }
      } catch {}
    }
    // Links layer – Using links (Adobe Guide p? ) : click underlined text / link annotation
    if (linkLayerRef.current) {
      const linkDiv = linkLayerRef.current
      linkDiv.innerHTML = ''
      linkDiv.style.width = `${viewport.width}px`
      linkDiv.style.height = `${viewport.height}px`
      try {
        const annos = await (page as unknown as { getAnnotations: () => Promise<{ subtype:string; rect:number[]; url?:string; dest?:unknown }[]> }).getAnnotations()
        for (const anno of annos) {
          if (anno.subtype !== 'Link' || !anno.rect) continue
          const [x1,y1,x2,y2] = anno.rect
          // rect is in PDF points, need to convert via viewport
          const rect = viewport.convertToViewportRectangle([x1,y1,x2,y2]) as unknown as number[]
          const [vx1, vy1, vx2, vy2] = rect
          const left = Math.min(vx1, vx2)
          const top = Math.min(vy1, vy2)
          const w = Math.abs(vx2 - vx1)
          const h = Math.abs(vy2 - vy1)
          const a = document.createElement('a')
          a.style.position = 'absolute'
          a.style.left = `${left}px`
          a.style.top = `${top}px`
          a.style.width = `${w}px`
          a.style.height = `${h}px`
          a.style.cursor = 'pointer'
          a.style.display = 'block'
          a.style.pointerEvents = 'auto'
          a.title = anno.url || 'Link'
          if (anno.url) {
            a.href = anno.url
            a.target = '_blank'
            a.rel = 'noopener'
            a.style.background = 'rgba(20,115,230,0.04)'
            a.addEventListener('click', (e) => {
              e.preventDefault()
              window.open(anno.url, '_blank')
              // push history for Go Back
              useUIStore.getState().pushNavHistory(pageNumber, zoom)
            })
          } else if (anno.dest) {
            a.href = '#'
            a.style.background = 'rgba(20,115,230,0.06)'
            a.style.border = '1px dashed rgba(20,115,230,0.3)'
            a.addEventListener('click', async (e) => {
              e.preventDefault()
              try {
                const dest = anno.dest as string | unknown[]
                let destArr: unknown[] | null = null
                if (typeof dest === 'string') destArr = await (pdfDoc as unknown as { getDestination: (d:string)=>Promise<unknown[]> }).getDestination(dest)
                else destArr = dest as unknown[]
                if (destArr && destArr[0]) {
                  const idx = await (pdfDoc as unknown as { getPageIndex: (r:unknown)=>Promise<number> }).getPageIndex(destArr[0])
                  const pg = idx + 1
                  usePdfStore.getState().setCurrentPage(pg)
                  document.getElementById(`page-${pg}`)?.scrollIntoView({ behavior: 'smooth' })
                  useUIStore.getState().pushNavHistory(pg, zoom)
                }
              } catch {}
            })
          }
          linkDiv.appendChild(a)
        }
      } catch {}
    }
  }, [pdfDoc, pageNumber, zoom, rotation, searchQuery])

  // Optional: render OCR overlay if present
  const ocrPage = useOcrStore((state) => state.ocrResults[pageNumber])
  const ocrLayerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ocrPage || !ocrLayerRef.current || !viewportSize) return
    const div = ocrLayerRef.current
    div.innerHTML = ''
    const { searchMatches, currentMatch, searchQuery: q } = usePdfStore.getState()
    const needle = q.toLowerCase()
    ocrPage.words.forEach((word, wIdx) => {
      const span = document.createElement('span')
      span.textContent = word.text + ' '
      span.style.position = 'absolute'
      span.style.color = 'transparent'
      span.style.userSelect = 'text'
      span.style.pointerEvents = 'auto'
      let { x0, y0, x1, y1 } = word.bbox
      // Bbox now normalized 0..1 (see DetectionPanel.normaliseWords). Fallback: if values look like pixels (>1.5), convert.
      const isNormalised = x1 <= 1.5 && y1 <= 1.5
      const left = isNormalised ? x0 * 100 : (x0 / viewportSize.w) * 100
      const top = isNormalised ? y0 * 100 : (y0 / viewportSize.h) * 100
      const width = isNormalised ? (x1 - x0) * 100 : ((x1 - x0) / viewportSize.w) * 100
      const height = isNormalised ? (y1 - y0) * 100 : ((y1 - y0) / viewportSize.h) * 100
      span.style.left = `${left}%`
      span.style.top = `${top}%`
      span.style.width = `${width}%`
      span.style.height = `${height}%`
      const hPx = isNormalised ? (y1 - y0) * viewportSize.h : (y1 - y0)
      span.style.fontSize = `${Math.max(8, hPx)}px`
      if (needle && word.text.toLowerCase().includes(needle)) {
        const isCurrent = searchMatches[currentMatch]?.page === pageNumber && searchMatches[currentMatch]?.index === 100000 + wIdx
        span.style.background = isCurrent ? 'rgba(255,193,7,0.75)' : 'rgba(255,238,88,0.45)'
        span.style.color = 'rgba(0,0,0,0.9)'
        span.style.borderRadius = '2px'
        if (isCurrent) span.style.outline = '1px solid #ff9800'
      }
      div.appendChild(span)
    })
  }, [ocrPage, viewportSize, searchQuery])

  useEffect(() => { render() }, [render])

  useEffect(() => {
    return () => { if (renderTaskRef.current) try { renderTaskRef.current.cancel() } catch {} }
  }, [])

  return (
    <div
      id={`page-${pageNumber}`}
      className="relative overflow-hidden mx-auto shrink-0"
      style={{
        width: viewportSize ? `${viewportSize.w}px` : undefined,
        height: viewportSize ? `${viewportSize.h}px` : undefined,
        minHeight: viewportSize ? `${viewportSize.h}px` : undefined,
        boxShadow: 'var(--acrobat-page-shadow)',
        borderRadius: 1,
        background: '#fff'
      }}
    >
      <canvas ref={canvasRef} className="block" />
      <div ref={textLayerRef} className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'auto' }} />
      <div ref={linkLayerRef} className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none' }} />
      <div ref={ocrLayerRef} className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'auto' }} />
      {viewportSize && <AnnotationLayer pageNumber={pageNumber} width={viewportSize.w} height={viewportSize.h} />}
    </div>
  )
}

/* ── Floating HUD ── */
function FloatingHUD(): React.JSX.Element {
  const { currentPage, numPages, zoom, setZoom, setFitMode, setCurrentPage } = usePdfStore()

  return (
    <div className="hud-bar">
      <button className="tb-btn" style={{ width: 24, height: 24 }} onClick={() => {
        const p = Math.max(1, currentPage - 1)
        setCurrentPage(p)
        document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6l-8 6 8 6z" /></svg>
      </button>
      <span className="text-xs tabular-nums px-1" style={{ color: 'var(--acrobat-text)', minWidth: 60, textAlign: 'center' }}>
        Page {currentPage} / {numPages}
      </span>
      <button className="tb-btn" style={{ width: 24, height: 24 }} onClick={() => {
        const p = Math.min(numPages, currentPage + 1)
        setCurrentPage(p)
        document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l8 6-8 6z" /></svg>
      </button>
      <div className="tb-sep" style={{ height: 16 }} />
      <button className="tb-btn" style={{ width: 24, height: 24 }} onClick={() => setZoom(Math.max(0.25, +(zoom - 0.15).toFixed(2)))}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <span className="text-xs tabular-nums px-1" style={{ color: 'var(--acrobat-text)', minWidth: 36, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button className="tb-btn" style={{ width: 24, height: 24 }} onClick={() => setZoom(Math.min(5, +(zoom + 0.15).toFixed(2)))}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <div className="tb-sep" style={{ height: 16 }} />
      <button className="tb-btn" style={{ width: 24, height: 24, fontSize: 10 }} onClick={() => setFitMode('width')} title="Fit Width">
        W
      </button>
      <button className="tb-btn" style={{ width: 24, height: 24, fontSize: 10 }} onClick={() => setFitMode('page')} title="Fit Page">
        P
      </button>
    </div>
  )
}

export function PdfViewer({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { numPages, zoom, rotation, searchQuery, currentPage, setCurrentPage, fitMode, setFitMode, setZoom } = usePdfStore()
  const { tool, deleteAnnotation, selectedId } = useAnnotationStore()
  const { pointerMode, spaceHeld, displayMode } = useUIStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hudVisible, setHudVisible] = useState(false)
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [textSelection, setTextSelection] = useState<TextSelectionInfo | null>(null)

  // Track text selection for floating toolbar
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const checkSelection = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const sel = getCurrentTextSelection()
        setTextSelection(sel)
      }, 60)
    }
    document.addEventListener('selectionchange', checkSelection)
    window.addEventListener('mouseup', checkSelection)
    return () => {
      document.removeEventListener('selectionchange', checkSelection)
      window.removeEventListener('mouseup', checkSelection)
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Hand tool panning
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const isHandMode = pointerMode === 'hand' || spaceHeld

  const showHud = useCallback(() => {
    setHudVisible(true)
    if (hudTimer.current) clearTimeout(hudTimer.current)
    hudTimer.current = setTimeout(() => setHudVisible(false), 2500)
  }, [])

  // Fit mode handling
  useEffect(() => {
    if (!pdfDoc || fitMode === 'none') return
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const page = await pdfDoc.getPage(1)
        const base = page.getViewport({ scale: 1, rotation })
        const containerW = containerRef.current?.clientWidth || Math.max(400, window.innerWidth - 560)
        const fitScaleW = (containerW - 32) / base.width
        let fitScale = fitScaleW
        if (fitMode === 'page') {
          const containerH = Math.max(400, window.innerHeight - 160)
          const fitScaleH = (containerH - 32) / base.height
          fitScale = Math.min(fitScaleW, fitScaleH)
        }
        if (!cancelled && fitScale > 0.1 && fitScale < 10) {
          setZoom(+fitScale.toFixed(2))
        }
      } catch {}
      if (!cancelled) setFitMode('none')
    }
    run()
    return () => { cancelled = true }
  }, [pdfDoc, fitMode, rotation, setFitMode, setZoom])

  // Scroll tracking for current page
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let ticking = false
    const onScroll = (): void => {
      showHud()
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const pages = el.querySelectorAll('[id^="page-"]')
        let best = 1
        let bestTop = Infinity
        for (const p of pages) {
          const rect = p.getBoundingClientRect()
          const cRect = el.getBoundingClientRect()
          const top = Math.abs(rect.top - cRect.top)
          if (rect.top <= cRect.top + 120 && top < bestTop) {
            bestTop = top
            best = parseInt(p.id.replace('page-', ''), 10) || 1
          }
        }
        setCurrentPage(best)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [setCurrentPage, numPages, showHud])

  // Keyboard shortcuts for viewer
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); performUndo() }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); performRedo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const active = document.activeElement as HTMLElement | null
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
        e.preventDefault()
        deleteAnnotation(selectedId)
      }
      if (e.key === 'Escape') useAnnotationStore.getState().setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteAnnotation])

  // Hand tool mouse handlers
  const onMouseDown = (e: React.MouseEvent): void => {
    if (!isHandMode || !containerRef.current) return
    isPanning.current = true
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    }
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!isPanning.current || !containerRef.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    containerRef.current.scrollLeft = panStart.current.scrollLeft - dx
    containerRef.current.scrollTop = panStart.current.scrollTop - dy
  }

  const onMouseUp = (): void => {
    isPanning.current = false
  }

  // Show HUD on mouse movement
  const onMouseMoveHud = useCallback(() => { showHud() }, [showHud])

  if (!pdfDoc) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--acrobat-canvas)' }}>
        <div
          className="rounded-xl p-8 text-center max-w-md w-full"
          style={{
            border: '1px solid var(--acrobat-border)',
            background: 'var(--acrobat-chrome-alt)'
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'var(--acrobat-red)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
              color: '#fff',
              fontWeight: 900,
              fontSize: 22
            }}
          >
            A
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--acrobat-text)' }}>No PDF opened</h2>
          <p className="text-xs mt-2" style={{ color: 'var(--acrobat-text-muted)' }}>
            Open a PDF via File → Open, the toolbar, or drag & drop.<br />
            Use the Home tab to browse recent files.
          </p>
        </div>
      </div>
    )
  }

  const cursorStyle = isHandMode
    ? (isPanning.current ? 'grabbing' : 'grab')
    : tool === 'select' ? 'default' : 'crosshair'

  // Determine pages to render – reactive (fixes stale getState bug)
  const pages = displayMode === 'single'
    ? [currentPage]
    : Array.from({ length: numPages }, (_, i) => i + 1)

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative"
      style={{
        background: 'var(--acrobat-canvas)',
        cursor: cursorStyle
      }}
      onMouseDown={onMouseDown}
      onMouseMove={(e) => { onMouseMove(e); onMouseMoveHud() }}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="flex flex-col items-center gap-4 p-4 pb-20">
        {pages.map((n) => (
          <PageCanvas
            key={`${n}-${tool}`}
            pdfDoc={pdfDoc}
            pageNumber={n}
            zoom={zoom}
            rotation={rotation}
            searchQuery={searchQuery}
          />
        ))}
      </div>

      {/* Floating HUD */}
      {hudVisible && numPages > 0 && (
        <div
          className="fixed z-50"
          style={{ bottom: 40, left: '50%', transform: 'translateX(-50%)' }}
        >
          <FloatingHUD />
        </div>
      )}

      {/* Floating Text Selection Toolbar */}
      {textSelection && (
        <TextSelectionFloatingToolbar
          selection={textSelection}
          onClose={() => {
            setTextSelection(null)
            window.getSelection()?.removeAllRanges()
          }}
        />
      )}
    </div>
  )
}
