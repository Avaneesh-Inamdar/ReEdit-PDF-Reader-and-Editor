import { useEffect } from 'react'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { usePdfStore } from '../stores/usePdfStore'
import { requestText } from '../lib/requestText'
import { textMatrix, type PdfTextRun } from '../lib/pdfText'

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
      color: '#000000',
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
      {edits.map((annotation) => {
        const source = annotation.sourceText!
        const size = annotation.fontSize || source.size
        return (
          <g key={annotation.id}>
            {(annotation.maskTexts || [source]).map((mask) => (
              <rect
                key={mask.key}
                transform={`matrix(${textMatrix(mask, transform).join(' ')})`}
                x={-0.5}
                y={-mask.ascent - 0.5}
                width={mask.width + 1}
                height={mask.ascent + mask.descent + 1}
                fill="white"
              />
            ))}
            <text
              transform={`matrix(${textMatrix(source, transform).join(' ')})`}
              fontSize={size}
              fill={annotation.color}
              fontFamily={
                annotation.fontFamily?.includes('Times')
                  ? 'Times New Roman'
                  : annotation.fontFamily?.includes('Courier')
                    ? 'Courier New'
                    : 'Arial'
              }
              fontWeight={
                annotation.bold || annotation.fontFamily?.includes('Bold') ? 'bold' : 'normal'
              }
              fontStyle={annotation.italic ? 'italic' : 'normal'}
              xmlSpace="preserve"
            >
              {(annotation.text || '').split('\n').map((line, index) => (
                <tspan key={index} x={0} y={index * (annotation.lineHeight || size * 1.2)}>
                  {line || ' '}
                </tspan>
              ))}
            </text>
          </g>
        )
      })}
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
