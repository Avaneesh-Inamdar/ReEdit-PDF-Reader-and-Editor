import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { usePdfStore } from '../stores/usePdfStore'
import { requestText } from '../lib/requestText'
import { previewFont, originalFontSelected, previewSpaceAdjustment } from '../lib/fonts'
import { encodedPreview } from '../lib/pdfTextStyle'
import { textMatrix, type PdfTextRun } from '../lib/pdfText'
import type { Annotation } from '../stores/useAnnotationStore'

function ReplacementText({ annotation, transform, editing }: { annotation: Annotation; transform: number[]; editing: boolean }): React.JSX.Element {
  const text = useRef<SVGTextElement>(null)
  const [bounds, setBounds] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const selected = useAnnotationStore(state => state.selectedId === annotation.id)
  const source = annotation.sourceText!
  const size = annotation.fontSize || source.size
  useLayoutEffect(() => {
    let cancelled = false
    const measure = (): void => { if (!cancelled && text.current) { const box = text.current.getBBox(); setBounds({ x: box.x, y: box.y, width: box.width, height: box.height }) } }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { cancelled = true; document.fonts.removeEventListener('loadingdone', measure) }
  }, [annotation.text, size, annotation.fontFamily, annotation.bold, annotation.italic])
  const select = (): void => useAnnotationStore.getState().setSelected(annotation.id)
  const edit = async (): Promise<void> => {
    select()
    const data = usePdfStore.getState().data
    const replacement = await requestText('Edit PDF text', annotation.text || '')
    if (replacement !== null && data === usePdfStore.getState().data)
      useAnnotationStore.getState().updateAnnotation(annotation.id, { text: replacement })
  }
  return <g data-edited-text={annotation.id} transform={`matrix(${textMatrix(source, transform).join(' ')})`}>
    <rect x={bounds.x - 1} y={bounds.y - 1} width={Math.max(4, bounds.width + 2)} height={Math.max(size, bounds.height + 2)} fill="transparent" stroke={selected ? '#1473e6' : 'none'} strokeWidth={0.6}
      style={{ pointerEvents: 'all', cursor: 'text' }} onClick={() => { select(); if (editing) void edit() }} onDoubleClick={() => { if (!editing) void edit() }} />
    <text ref={text} data-replacement-text="true" fontSize={size}
      letterSpacing={(source.characterSpacing || 0) * size / source.size}
      wordSpacing={(source.wordSpacing || 0) * size / source.size + previewSpaceAdjustment(annotation)}
      fill={annotation.color} fontFamily={previewFont(annotation)}
      fontWeight={originalFontSelected(annotation) && source.fontData ? 'normal' : annotation.bold ? 'bold' : 'normal'}
      fontStyle={originalFontSelected(annotation) && source.fontData ? 'normal' : annotation.italic ? 'italic' : 'normal'} xmlSpace="preserve"
      style={{ pointerEvents: 'all', userSelect: 'text', cursor: 'text' }} onClick={() => { select(); if (editing) void edit() }} onDoubleClick={() => { if (!editing) void edit() }}>
      {(annotation.text || '').split('\n').map((line, index) => <tspan key={index} x={0} y={index * (annotation.lineHeight || size * 1.2)}>{originalFontSelected(annotation) ? encodedPreview(line || ' ', source.fontGlyphs) : line || ' '}</tspan>)}
    </text>
  </g>
}

export function ExistingTextLayer({
  runs,
  transform,
  pageNumber,
  width,
  height
}: {
  runs: PdfTextRun[]
  transform: number[]
  pageNumber: number
  width: number
  height: number
}): React.JSX.Element {
  const { annotations, selectedId, addAnnotation, updateAnnotation, setSelected } =
    useAnnotationStore()
  const { rightPane, pointerMode, spaceHeld } = useUIStore()
  const editing = rightPane === 'edit' && pointerMode !== 'hand' && !spaceHeld
  const edits = annotations.filter((a) => a.page === pageNumber && a.sourceText)

  const edit = async (run: PdfTextRun): Promise<void> => {
    if (!editing) return
    const data = usePdfStore.getState().data
    const existing = edits.find(
      (a) =>
        a.sourceText?.key === run.key ||
        a.maskTexts?.some((mask) => mask.key.startsWith(run.key + ':'))
    )
    const replacement = await requestText('Edit PDF text', existing?.text ?? run.text)
    if (replacement === null || usePdfStore.getState().data !== data) return
    if (existing) {
      updateAnnotation(existing.id, { text: replacement })
      setSelected(existing.id)
      return
    }
    if (replacement === run.text) return
    const id = `pdf-text-${crypto.randomUUID()}`
    addAnnotation({
      id,
      page: pageNumber,
      type: 'text',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      text: replacement,
      fontSize: run.size,
      fontFamily: run.fontFamily,
      color: run.color || '#000000',
      bold: run.bold,
      italic: run.italic,
      opacity: 1,
      strokeWidth: 0,
      sourceText: run
    })
    setSelected(id)
  }

  useEffect(() => {
    const handle = (event: Event): void => {
      const detail = (event as CustomEvent<{ page: number; run: PdfTextRun }>).detail
      if (detail.page === pageNumber) void edit(detail.run)
    }
    window.addEventListener('pdf:editRun', handle)
    return () => window.removeEventListener('pdf:editRun', handle)
  }, [editing, edits, pageNumber])

  return (
    <svg
      className="absolute inset-0 existing-text-layer"
      width={width}
      height={height}
      style={{ pointerEvents: 'none' }}
    >
      {edits.map(annotation => <ReplacementText key={annotation.id} annotation={annotation} transform={transform} editing={editing} />)}
      {runs.map((run) => {
        const annotation = edits.find(
          (a) =>
            a.sourceText?.key === run.key ||
            a.maskTexts?.some((mask) => mask.key.startsWith(run.key + ':'))
        )
        const selected = annotation?.id === selectedId
        return (
          <g key={run.key} transform={`matrix(${textMatrix(run, transform).join(' ')})`}>
            {editing && (
              <rect
                data-pdf-text={run.key}
                aria-label={`Edit text: ${run.text}`}
                role="button"
                tabIndex={0}
                x={-0.5}
                y={-run.ascent - 0.5}
                width={run.width + 1}
                height={run.ascent + run.descent + 1}
                fill="transparent"
                stroke={selected ? '#1473e6' : 'transparent'}
                strokeWidth={0.6}
                style={{ pointerEvents: 'none', cursor: 'text' }}
                onClick={() => {
                  void edit(run)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void edit(run)
                  }
                }}
              >
                <title>Click to edit text</title>
              </rect>
            )}
          </g>
        )
      })}
    </svg>
  )
}
