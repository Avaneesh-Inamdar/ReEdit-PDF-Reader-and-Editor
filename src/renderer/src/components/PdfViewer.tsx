import { TextLayer } from 'pdfjs-dist'
import { installPdfDragSelection } from '../lib/pdfDragSelection'
import { pageText, outputScale, renderPage } from '../lib/rendering'
import { Icon, BrandLogo } from './Icon'
import { ExistingTextLayer } from './ExistingTextLayer'
import { type PdfTextRun } from '../lib/pdfText'
import { styledTextRuns } from '../lib/pdfTextStyle'
import { useTextRemovalPreview } from '../lib/useTextRemovalPreview'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { AnnotationLayer } from './AnnotationLayer'
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
  searchQuery,
  onSize
}: {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  rotation: number
  searchQuery: string
  onSize: (width: number, height: number) => void
}): React.JSX.Element {
  const [textRuns, setTextRuns] = useState<PdfTextRun[]>([])
  const annotations = useAnnotationStore(state => state.annotations)
  const removalPreview = useTextRemovalPreview(pageNumber)
  const [pageTransform, setPageTransform] = useState<number[]>([1, 0, 0, 1, 0, 0])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const linkLayerRef = useRef<HTMLDivElement>(null)
  const renderVersion = useRef(0)
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null)
  const nativeTextLayer = useRef<TextLayer | null>(null)
  const selectionCleanup = useRef<(() => void) | null>(null)
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    for (const span of textLayerRef.current?.querySelectorAll<HTMLElement & { pdfRun?: PdfTextRun }>('[data-pdf-run]') || []) {
      const run = span.pdfRun
      const removed = !!run && annotations.some(a => a.page === pageNumber && (a.maskTexts || (a.sourceText ? [a.sourceText] : [])).some(mask => mask.key === run.key || (mask.key.startsWith(run.key + ':') && mask.text === run.text)))
      span.dataset.removed = String(removed)
      span.style.visibility = removed ? 'hidden' : ''
    }
  }, [annotations, textRuns, pageNumber])

  const render = useCallback(async () => {
    const version = ++renderVersion.current
    const previous = renderTaskRef.current
    previous?.cancel()
    await previous?.promise.catch(() => {})
    if (version !== renderVersion.current) return
    nativeTextLayer.current?.cancel()
    const canvas = canvasRef.current
    if (!canvas) return
    const page = await pdfDoc.getPage(pageNumber)
    if (version !== renderVersion.current) return

    let scale = zoom
    if (!Number.isFinite(scale) || scale < 0.1) scale = 1
    if (scale > 10) scale = 10

    const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
    onSize(viewport.width / scale, viewport.height / scale)
    setPageTransform(viewport.transform)
    setViewportSize({ w: viewport.width, h: viewport.height })
    const dpr = outputScale(viewport.width, viewport.height, window.devicePixelRatio)
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext('2d')!
    await renderPage(async () => {
      if (version !== renderVersion.current) return
      const task = (removalPreview || page).render({ canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0] })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch (error) {
        if ((error as Error)?.name !== 'RenderingCancelledException') throw error
      }
    })

    if (version !== renderVersion.current) return
    if (textLayerRef.current) {
      const textContent = await pageText(pdfDoc, pageNumber)
      const styledRuns = await styledTextRuns(page, textContent, pageNumber)
      if (version !== renderVersion.current) return
      const container = textLayerRef.current
      selectionCleanup.current?.()
      container.replaceChildren()
      container.style.setProperty('--scale-factor', String(scale))
      const layer = new TextLayer({ textContentSource: textContent, container, viewport })
      nativeTextLayer.current = layer
      await layer.render()
      if (version !== renderVersion.current) return
      let spanIndex = 0
      textContent.items.forEach((item, index) => {
        if (!('str' in item)) return
        const span = layer.textDivs[spanIndex++]
        if (span) {
          span.dataset.pdfRun = `${pageNumber}:${index}`
          span.dataset.textIndex = String(index)
          const run = styledRuns.get(index)
          if (run) {
            ;(span as HTMLElement & { pdfRun?: PdfTextRun }).pdfRun = run

          }
        }
      })
      selectionCleanup.current = installPdfDragSelection(container)
      setTextRuns([...styledRuns.values()])
    }
    // Links layer – Using links : click underlined text / link annotation
    if (linkLayerRef.current) {
      const linkDiv = linkLayerRef.current
      linkDiv.innerHTML = ''
      linkDiv.style.width = `${viewport.width}px`
      linkDiv.style.height = `${viewport.height}px`
      try {
        const annos = await (
          page as unknown as {
            getAnnotations: () => Promise<
              { subtype: string; rect: number[]; url?: string; dest?: unknown }[]
            >
          }
        ).getAnnotations()
        for (const anno of annos) {
          if (anno.subtype !== 'Link' || !anno.rect) continue
          const [x1, y1, x2, y2] = anno.rect
          // rect is in PDF points, need to convert via viewport
          const rect = viewport.convertToViewportRectangle([x1, y1, x2, y2]) as unknown as number[]
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
                if (typeof dest === 'string')
                  destArr = await (
                    pdfDoc as unknown as { getDestination: (d: string) => Promise<unknown[]> }
                  ).getDestination(dest)
                else destArr = dest as unknown[]
                if (destArr && destArr[0]) {
                  const idx = await (
                    pdfDoc as unknown as { getPageIndex: (r: unknown) => Promise<number> }
                  ).getPageIndex(destArr[0])
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
  }, [pdfDoc, pageNumber, zoom, rotation, onSize, removalPreview])

  const currentMatch = usePdfStore(state => state.currentMatch)
  const searchMatches = usePdfStore(state => state.searchMatches)
  useEffect(() => {
    const container = textLayerRef.current
    if (!container) return
    container.querySelector('.pdf-search-highlights')?.remove()
    if (!searchQuery) return
    const overlay = document.createElement('div')
    overlay.className = 'pdf-search-highlights'
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    const root = container.getBoundingClientRect()
    searchMatches.forEach((match, matchIndex) => {
      if (match.page !== pageNumber) return
      for (const segment of match.segments || []) {
        const span = container.querySelector(`[data-text-index="${segment.index}"]`)
        const node = span?.firstChild
        if (!node || node.nodeType !== Node.TEXT_NODE) continue
        const range = document.createRange()
        range.setStart(node, Math.min(segment.start, node.textContent?.length || 0))
        range.setEnd(node, Math.min(segment.end, node.textContent?.length || 0))
        for (const rect of range.getClientRects()) {
          const mark = document.createElement('div')
          mark.className = 'search-highlight'
          mark.dataset.match = String(matchIndex)
          const active = matchIndex === currentMatch
          mark.style.cssText = `position:absolute;left:${rect.left-root.left}px;top:${rect.top-root.top}px;width:${rect.width}px;height:${rect.height}px;background:${active ? 'rgba(255,145,0,.5)' : 'rgba(255,220,0,.35)'};border-radius:2px;`
          overlay.append(mark)
        }
      }
    })
    container.append(overlay)
    overlay.querySelector(`[data-match="${currentMatch}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return () => overlay.remove()
  }, [searchQuery, searchMatches, currentMatch, textRuns, pageNumber])

  useEffect(() => {
    void render().catch((error) => {
      if (error?.name !== 'RenderingCancelledException') console.warn(error)
    })
    return () => {
      renderVersion.current++
      renderTaskRef.current?.cancel()
      nativeTextLayer.current?.cancel()
      selectionCleanup.current?.()
    }
  }, [render])

  useEffect(() => {
    return () => {
      if (renderTaskRef.current)
        try {
          renderTaskRef.current.cancel()
        } catch {}
    }
  }, [])

  return (
    <div
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
      <canvas draggable={false} ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 overflow-hidden"
        style={{ pointerEvents: 'auto' }}
      />
      <div
        ref={linkLayerRef}
        className="absolute inset-0 overflow-hidden"
        style={{ pointerEvents: 'none' }}
      />
      {viewportSize && (
        <ExistingTextLayer
          runs={textRuns}
          transform={pageTransform}
          pageNumber={pageNumber}
          width={viewportSize.w}
          height={viewportSize.h}
        />
      )}
      {viewportSize && (
        <AnnotationLayer pageNumber={pageNumber} width={viewportSize.w} height={viewportSize.h} />
      )}
    </div>
  )
}

const PageSlot = memo(function PageSlot({
  pdfDoc,
  pageNumber,
  zoom,
  rotation,
  searchQuery,
  visible,
  baseSize
}: {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  rotation: number
  searchQuery: string
  visible: boolean
  baseSize: { w: number; h: number }
}): React.JSX.Element {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => setSize(null), [pdfDoc, rotation])
  const onSize = useCallback(
    (w: number, h: number) =>
      setSize((previous) => (previous?.w === w && previous?.h === h ? previous : { w, h })),
    []
  )
  const dimensions = size || baseSize
  return (
    <div
      id={`page-${pageNumber}`}
      data-page-slot
      data-visible={visible}
      className="relative shrink-0 bg-white"
      style={{
        width: dimensions.w * zoom,
        height: dimensions.h * zoom,
        boxShadow: 'var(--acrobat-page-shadow)'
      }}
    >
      {visible && (
        <PageCanvas
          pdfDoc={pdfDoc}
          pageNumber={pageNumber}
          zoom={zoom}
          rotation={rotation}
          searchQuery={searchQuery}
          onSize={onSize}
        />
      )}
    </div>
  )
})

/* ── Floating HUD ── */
function FloatingHUD(): React.JSX.Element {
  const { currentPage, numPages, zoom, setZoom, setFitMode, setCurrentPage } = usePdfStore()

  return (
    <div className="hud-bar">
      <button
        className="tb-btn"
        style={{ width: 24, height: 24 }}
        onClick={() => {
          const p = Math.max(1, currentPage - 1)
          setCurrentPage(p)
          document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })
        }}
      >
        <Icon name="previous" size={14} />
      </button>
      <span
        className="text-xs tabular-nums px-1"
        style={{ color: 'var(--acrobat-text)', minWidth: 60, textAlign: 'center' }}
      >
        Page {currentPage} / {numPages}
      </span>
      <button
        className="tb-btn"
        style={{ width: 24, height: 24 }}
        onClick={() => {
          const p = Math.min(numPages, currentPage + 1)
          setCurrentPage(p)
          document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })
        }}
      >
        <Icon name="next" size={14} />
      </button>
      <div className="tb-sep" style={{ height: 16 }} />
      <button
        className="tb-btn"
        style={{ width: 24, height: 24 }}
        onClick={() => setZoom(Math.max(0.25, +(zoom - 0.15).toFixed(2)))}
      >
        <Icon name="minus" size={14} />
      </button>
      <span
        className="text-xs tabular-nums px-1"
        style={{ color: 'var(--acrobat-text)', minWidth: 36, textAlign: 'center' }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        className="tb-btn"
        style={{ width: 24, height: 24 }}
        onClick={() => setZoom(Math.min(5, +(zoom + 0.15).toFixed(2)))}
      >
        <Icon name="plus" size={14} />
      </button>
      <div className="tb-sep" style={{ height: 16 }} />
      <button
        className="tb-btn"
        style={{ width: 24, height: 24, fontSize: 10 }}
        onClick={() => setFitMode('width')}
        title="Fit Width"
      >
        <Icon name="fitWidth" size={14} />
      </button>
      <button
        className="tb-btn"
        style={{ width: 24, height: 24, fontSize: 10 }}
        onClick={() => setFitMode('page')}
        title="Fit Page"
      >
        <Icon name="fitPage" size={14} />
      </button>
    </div>
  )
}

export function PdfViewer({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { numPages, zoom, rotation, searchQuery, currentPage, setCurrentPage, fitMode } =
    usePdfStore()
  const { tool, deleteAnnotation, selectedId } = useAnnotationStore()
  const { pointerMode, spaceHeld, displayMode, isFullScreen, fullScreenBg } = useUIStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ page: HTMLElement; x: number; y: number; clientX: number; clientY: number } | null>(null)
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current, element = containerRef.current
    if (!anchor || !element || !anchor.page.isConnected) return
    const bounds = anchor.page.getBoundingClientRect(), root = element.getBoundingClientRect()
    element.scrollLeft += bounds.left - root.left + bounds.width * anchor.x - anchor.clientX
    element.scrollTop += bounds.top - root.top + bounds.height * anchor.y - anchor.clientY
    zoomAnchor.current = null
  }, [zoom])
  const [baseSize, setBaseSize] = useState({ w: 612, h: 792 })
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]))
  useEffect(() => {
    let cancelled = false
    if (pdfDoc)
      void pdfDoc.getPage(1).then((page) => {
        const size = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
        if (!cancelled) setBaseSize({ w: size.width, h: size.height })
      })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, rotation])
  useEffect(() => {
    const root = containerRef.current
    if (!root || !pdfDoc) return
    const nearby = new Set<number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number(entry.target.id.slice(5))
          if (entry.isIntersecting) nearby.add(page)
          else nearby.delete(page)
        }
        setVisiblePages((previous) =>
          previous.size === nearby.size && [...nearby].every((page) => previous.has(page))
            ? previous
            : new Set(nearby)
        )
      },
      { root, rootMargin: '600px 0px' }
    )
    root.querySelectorAll('[data-page-slot]').forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [pdfDoc, numPages, displayMode, displayMode === 'single' ? currentPage : 0])
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
    const copy = (event: ClipboardEvent): void => {
      const selection = getCurrentTextSelection()
      if (!selection?.annotationId || !event.clipboardData) return
      event.clipboardData.setData('text/plain', selection.text)
      event.preventDefault()
    }
    document.addEventListener('copy', copy)
    window.addEventListener('mouseup', checkSelection)
    return () => {
      document.removeEventListener('selectionchange', checkSelection)
      document.removeEventListener('copy', copy)
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

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Fit mode handling
  useEffect(() => {
    const element = containerRef.current
    if (!element || !pdfDoc) return
    let frame = 0
    let pendingZoom = usePdfStore.getState().zoom
    const onWheel = (event: WheelEvent): void => {
      // Chromium delivers precision-trackpad pinch as Ctrl+wheel. Ordinary
      // two-finger scrolling remains native, including horizontal scrolling.
      if (!event.ctrlKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const page = (event.target as Element).closest<HTMLElement>('[data-page-slot]') ||
        element.querySelector<HTMLElement>(`#page-${usePdfStore.getState().currentPage}`)
      if (page && !frame) {
        const bounds = page.getBoundingClientRect()
        zoomAnchor.current = { page, x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height,
          clientX: event.clientX - rect.left, clientY: event.clientY - rect.top }
        pendingZoom = usePdfStore.getState().zoom
      }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      pendingZoom = Math.max(0.1, Math.min(10, pendingZoom * Math.exp(-delta * 0.005)))
      if (!frame) frame = requestAnimationFrame(() => {
        usePdfStore.getState().setZoom(pendingZoom)
        frame = 0
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { element.removeEventListener('wheel', onWheel); cancelAnimationFrame(frame) }
  }, [pdfDoc])

  useEffect(() => {
    if (!pdfDoc || fitMode === 'none') return
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        if (containerRef.current?.querySelector('[data-selecting="true"]')) return
        const page = await pdfDoc.getPage(Math.max(1, Math.min(currentPage, pdfDoc.numPages)))
        const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
        const containerW =
          containerSize.width ||
          containerRef.current?.clientWidth ||
          Math.max(400, window.innerWidth - 560)
        const fitScaleW = (containerW - 32) / base.width
        let fitScale = fitScaleW
        if (fitMode === 'page') {
          const containerH = containerSize.height || Math.max(400, window.innerHeight - 160)
          const fitScaleH = (containerH - 32) / base.height
          fitScale = Math.min(fitScaleW, fitScaleH)
        }
        if (!cancelled && fitScale > 0.1 && fitScale < 10) {
          usePdfStore.setState({ zoom: +fitScale.toFixed(2) })
        }
      } catch {}
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, fitMode, rotation, currentPage, containerSize])

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
        const pages = el.querySelectorAll('[data-page-slot][data-visible="true"]')
        let best = usePdfStore.getState().currentPage
        let bestTop = Infinity
        const cRect = el.getBoundingClientRect()
        for (const p of pages) {
          const rect = p.getBoundingClientRect()
          const top = Math.abs(rect.top - cRect.top)
          if (rect.bottom > cRect.top + 40 && rect.top <= cRect.top + 120 && top < bestTop) {
            bestTop = top
            best = parseInt(p.id.replace('page-', ''), 10) || 1
          }
        }
        setCurrentPage(best)
      })
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [setCurrentPage, numPages, showHud, visiblePages])

  // Keyboard shortcuts for viewer
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable)
      )
        return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const active = document.activeElement as HTMLElement | null
        if (
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        )
          return
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
    if (!isHandMode || !containerRef.current || e.button !== 0) return
    e.preventDefault()
    window.getSelection()?.removeAllRanges()
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
  const onMouseMoveHud = useCallback(() => {
    showHud()
  }, [showHud])

  if (!pdfDoc) {
    return (
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: 'var(--acrobat-canvas)' }}
      >
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
            <BrandLogo size={56} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--acrobat-text)' }}>
            No PDF opened
          </h2>
          <p className="text-xs mt-2" style={{ color: 'var(--acrobat-text-muted)' }}>
            Open a PDF via File → Open, the toolbar, or drag & drop.
            <br />
            Use the Home tab to browse recent files.
          </p>
        </div>
      </div>
    )
  }

  const cursorStyle = isHandMode
    ? isPanning.current
      ? 'grabbing'
      : 'grab'
    : tool === 'select'
      ? 'default'
      : 'crosshair'

  // Determine pages to render – reactive (fixes stale getState bug)
  const pages =
    displayMode === 'single' ? [currentPage] : Array.from({ length: numPages }, (_, i) => i + 1)

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative"
      style={{
        background: isFullScreen ? fullScreenBg : 'var(--acrobat-canvas)',
        cursor: cursorStyle,
        userSelect: isHandMode ? 'none' : undefined
      }}
      data-pdf-viewer
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDownCapture={onMouseDown}
      onMouseMove={(e) => {
        onMouseMove(e)
        onMouseMoveHud()
      }}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="flex flex-col items-center gap-4 p-4 pb-20" style={{ minWidth: Math.max(baseSize.w * zoom + 32, containerSize.width) }}>
        {pages.map((n) => (
          <PageSlot
            key={n}
            visible={visiblePages.has(n)}
            baseSize={baseSize}
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
