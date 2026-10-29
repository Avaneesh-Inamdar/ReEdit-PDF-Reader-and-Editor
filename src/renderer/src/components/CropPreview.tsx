import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from '../lib/rendering'

type Side = 'left' | 'right' | 'top' | 'bottom'
export type CropInputs = Record<Side, string>

/** Render the first selected page without rotation so the handles match PDF coordinates. */
export function CropPreview({
  pdf,
  pageNumber,
  margins,
  onChange
}: {
  pdf: PDFDocumentProxy | null
  pageNumber: number
  margins: CropInputs
  onChange: (side: Side, value: string) => void
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | undefined
    if (!pdf) return
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled || !canvas.current) return
      setError('')
      const [x1, y1, x2, y2] = page.view
      setSize({ width: x2 - x1, height: y2 - y1 })
      const base = page.getViewport({ scale: 1, rotation: 0 })
      const viewport = page.getViewport({
        scale: Math.min(300 / base.width, 340 / base.height),
        rotation: 0
      })
      const target = canvas.current
      const ratio = Math.max(2, window.devicePixelRatio || 1)
      target.width = Math.ceil(viewport.width * ratio)
      target.height = Math.ceil(viewport.height * ratio)
      await renderPage(async () => {
        if (cancelled) return
        const rendering = page.render({
          canvasContext: target.getContext('2d')!,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0]
        })
        task = rendering
        await rendering.promise
      })
    })().catch(() => {
      if (!cancelled) setError('Unable to render this page preview.')
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber])

  const number = (side: Side): number => {
    const value = Number(margins[side])
    return Number.isFinite(value) && value >= 0 ? value : 0
  }
  const left = size ? Math.min(100, (number('left') / size.width) * 100) : 0
  const right = size ? Math.min(100 - left, (number('right') / size.width) * 100) : 0
  const top = size ? Math.min(100, (number('top') / size.height) * 100) : 0
  const bottom = size ? Math.min(100 - top, (number('bottom') / size.height) * 100) : 0
  const drag = (side: Side, event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!size || !frame.current) return
    const rect = frame.current.getBoundingClientRect()
    const horizontal = side === 'left' || side === 'right'
    const fraction = horizontal
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height
    const dimension = horizontal ? size.width : size.height
    const opposite: Side =
      side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top'
    const fromEdge = side === 'right' || side === 'bottom' ? 1 - fraction : fraction
    const maximum = Math.max(0, dimension - number(opposite) - 1)
    onChange(
      side,
      String(Math.round(Math.max(0, Math.min(maximum, fromEdge * dimension)) * 10) / 10)
    )
  }

  return (
    <div style={{ minWidth: 200, textAlign: 'center' }}>
      <p className="text-sm mb-2">Preview: page {pageNumber} (unrotated)</p>
      {error && <p role="alert">{error}</p>}
      <div
        ref={frame}
        style={{
          position: 'relative',
          display: 'inline-block',
          overflow: 'hidden',
          lineHeight: 0,
          maxWidth: '100%'
        }}
      >
        <canvas
          ref={canvas}
          aria-label={`Preview of page ${pageNumber}`}
          style={{
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 340,
            background: 'white'
          }}
        />
        {size && (
          <div
            style={{
              position: 'absolute',
              inset: `${top}% ${right}% ${bottom}% ${left}%`,
              border: '2px solid #1473e6',
              boxShadow: '0 0 0 999px rgba(0,0,0,.45)'
            }}
          >
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-label={`Drag ${side} crop edge`}
                title={`Drag ${side} crop edge; use the margin fields for keyboard input`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag(side, event)
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) drag(side, event)
                }}
                style={{
                  position: 'absolute',
                  touchAction: 'none',
                  background: '#1473e6',
                  border: '1px solid white',
                  borderRadius: 2,
                  width: side === 'left' || side === 'right' ? 10 : 28,
                  height: side === 'top' || side === 'bottom' ? 10 : 28,
                  left: side === 'left' ? -6 : side === 'right' ? 'auto' : '50%',
                  right: side === 'right' ? -6 : 'auto',
                  top: side === 'top' ? -6 : side === 'bottom' ? 'auto' : '50%',
                  bottom: side === 'bottom' ? -6 : 'auto',
                  transform:
                    side === 'left' || side === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
                  cursor: side === 'left' || side === 'right' ? 'ew-resize' : 'ns-resize'
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
