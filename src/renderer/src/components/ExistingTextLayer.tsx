import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { usePdfStore } from '../stores/usePdfStore'
import { requestPdfText } from '../lib/textEditRequest'
import { previewFont, originalFontSelected, previewSpaceAdjustment } from '../lib/fonts'
import { encodedPreview } from '../lib/pdfTextStyle'
import { textMatrix, type PdfTextRun } from '../lib/pdfText'
import type { Annotation } from '../stores/useAnnotationStore'
import { registerPreviewFont } from '../lib/fontFaces'
import { trackInlineMutation } from '../lib/inlineText'
import { replacementSpacing } from '../lib/textSpacing'
import { connectedTextBox, textBoxText, textBoxSource } from '../lib/textLine'
import { wrapTextBox } from '../lib/textBoxLayout'

function ReplacementText({
  annotation,
  transform,
  editing
}: {
  annotation: Annotation
  transform: number[]
  editing: boolean
}): React.JSX.Element {
  const text = useRef<SVGTextElement>(null)
  const [bounds, setBounds] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const selected = useAnnotationStore((state) => state.selectedId === annotation.id)
  const source = annotation.sourceText!
  const [restoredFont, setRestoredFont] = useState<string>()
  useEffect(() => {
    let cancelled = false
    if (originalFontSelected(annotation) && source.fontData)
      void registerPreviewFont(source.fontData)
        .then((font) => {
          if (!cancelled) setRestoredFont(font.name)
        })
        .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [source.fontData, annotation])
  const size = annotation.fontSize || source.size
  const spacing = replacementSpacing(annotation)
  const [lines, setLines] = useState((annotation.text || '').split('\n'))
  useLayoutEffect(() => {
    let cancelled = false
    const measure = (): void => {
      if (!cancelled && text.current) {
        const canvas = document.createElement('canvas').getContext('2d')
        if (canvas) {
          const style = getComputedStyle(text.current)
          canvas.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`
          const next = wrapTextBox(annotation.text || '', source.textBox?.width, (value) => {
            const visible = originalFontSelected(annotation)
              ? encodedPreview(value, source.fontGlyphs)
              : value
            return (
              canvas.measureText(visible).width +
              Math.max(0, Array.from(visible).length - 1) * spacing.character +
              (value.match(/ /g)?.length || 0) * (spacing.word + previewSpaceAdjustment(annotation))
            )
          })
          setLines((previous) =>
            previous.length === next.length && previous.every((line, index) => line === next[index])
              ? previous
              : next
          )
        }
        const box = text.current.getBBox()
        setBounds({ x: box.x, y: box.y, width: box.width, height: box.height })
      }
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [
    annotation.text,
    size,
    annotation.fontFamily,
    annotation.bold,
    annotation.italic,
    restoredFont,
    annotation.previewFont,
    annotation,
    source.fontGlyphs,
    spacing.character,
    spacing.word,
    source.textBox?.width,
    lines
  ])
  const select = (): void => useAnnotationStore.getState().setSelected(annotation.id)
  const edit = (): Promise<void> =>
    trackInlineMutation(
      (async () => {
        select()
        const data = usePdfStore.getState().data
        const replacement = await requestPdfText(source, annotation.text || '', annotation)
        if (replacement !== null && data === usePdfStore.getState().data)
          useAnnotationStore
            .getState()
            .updateAnnotation(annotation.id, { text: replacement.text, ...replacement.style })
      })()
    )
  return (
    <g
      data-edited-text={annotation.id}
      transform={`matrix(${textMatrix(source, transform).join(' ')})`}
    >
      <rect
        x={bounds.x - 1}
        y={bounds.y - 1}
        width={Math.max(4, bounds.width + 2)}
        height={Math.max(size, bounds.height + 2)}
        fill="transparent"
        stroke={editing && selected ? '#1473e6' : 'none'}
        strokeWidth={0.6}
        style={{ pointerEvents: editing ? 'all' : 'none', cursor: 'text' }}
        onClick={() => {
          select()
          if (editing) void edit()
        }}
        onDoubleClick={() => {
          if (editing) void edit()
        }}
      />
      <text
        ref={text}
        data-replacement-text="true"
        fontSize={size}
        letterSpacing={spacing.character}
        wordSpacing={spacing.word + previewSpaceAdjustment(annotation)}
        fill={annotation.color}
        fontFamily={
          originalFontSelected(annotation) && restoredFont ? restoredFont : previewFont(annotation)
        }
        fontWeight={
          originalFontSelected(annotation) && source.fontData
            ? 'normal'
            : annotation.bold
              ? 'bold'
              : 'normal'
        }
        fontStyle={
          originalFontSelected(annotation) && source.fontData
            ? 'normal'
            : annotation.italic
              ? 'italic'
              : 'normal'
        }
        xmlSpace="preserve"
        style={{ pointerEvents: 'all', userSelect: 'text', cursor: 'text' }}
        onClick={() => {
          select()
          if (editing) void edit()
        }}
        onDoubleClick={() => {
          if (editing) void edit()
        }}
      >
        {lines.map((line, index) => (
          <tspan
            key={index}
            x={0}
            y={index * (annotation.lineHeight || source.textBox?.lineHeight || size * 1.2)}
          >
            {originalFontSelected(annotation)
              ? encodedPreview(line || ' ', source.fontGlyphs)
              : line || ' '}
          </tspan>
        ))}
      </text>
    </g>
  )
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
  const edits = useMemo(
    () => annotations.filter((a) => a.page === pageNumber && a.sourceText),
    [annotations, pageNumber]
  )

  const edit = useCallback(
    (run: PdfTextRun): Promise<void> =>
      trackInlineMutation(
        (async () => {
          if (!editing) return
          const data = usePdfStore.getState().data
          const existing = edits.find(
            (a) =>
              a.sourceText?.key === run.key ||
              a.maskTexts?.some(
                (mask) => mask.key === run.key || mask.key.startsWith(run.key + ':')
              )
          )
          const available = runs.filter(
            (item) =>
              !edits.some((annotation) =>
                annotation.maskTexts?.some(
                  (mask) => mask.key === item.key || mask.key.startsWith(item.key + ':')
                )
              )
          )
          const box = connectedTextBox(run, available)
          const group = box.flat()
          const original = textBoxText(box)
          const merged = existing?.sourceText || textBoxSource(box)
          const replacement = await requestPdfText(merged, existing?.text ?? original, existing)
          if (replacement === null || usePdfStore.getState().data !== data) return
          if (existing) {
            updateAnnotation(existing.id, { text: replacement.text, ...replacement.style })
            setSelected(existing.id)
            return
          }
          if (replacement.text === original && !Object.keys(replacement.style).length) return
          const id = `pdf-text-${crypto.randomUUID()}`
          addAnnotation({
            id,
            page: pageNumber,
            type: 'text',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            text: replacement.text,
            fontSize: group[0].size,
            fontFamily: group[0].fontFamily,
            color: run.color || '#000000',
            bold: run.bold,
            italic: run.italic,
            opacity: 1,
            strokeWidth: 0,
            sourceText: merged,
            maskTexts: group,
            lineHeight: merged.textBox?.lineHeight,

            ...replacement.style
          })
          setSelected(id)
        })()
      ),
    [editing, edits, runs, pageNumber, updateAnnotation, setSelected, addAnnotation]
  )

  useEffect(() => {
    const handle = (event: Event): void => {
      const detail = (event as CustomEvent<{ page: number; run: PdfTextRun }>).detail
      if (detail.page === pageNumber) void edit(detail.run)
    }
    window.addEventListener('pdf:editRun', handle)
    return () => window.removeEventListener('pdf:editRun', handle)
  }, [pageNumber, edit])

  return (
    <svg
      className="absolute inset-0 existing-text-layer"
      width={width}
      height={height}
      style={{ pointerEvents: 'none' }}
    >
      {edits.map((annotation) => (
        <ReplacementText
          key={annotation.id}
          annotation={annotation}
          transform={transform}
          editing={editing}
        />
      ))}
      {runs.map((run) => {
        const annotation = edits.find(
          (a) =>
            a.sourceText?.key === run.key ||
            a.maskTexts?.some((mask) => mask.key === run.key || mask.key.startsWith(run.key + ':'))
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
