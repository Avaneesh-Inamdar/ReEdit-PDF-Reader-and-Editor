import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { requestPdfText } from './textEditRequest'
import type { PdfTextRun } from './pdfText'
import type { TextSelectionInfo } from './textSelection'

export function selectedRuns(range: Range): PdfTextRun[] {
  const element =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement
  const page = element?.closest('[data-page-slot]')
  if (!page) return []
  const measuring = document.createElement('canvas').getContext('2d')!
  const fragments: PdfTextRun[] = []
  for (const span of page.querySelectorAll<HTMLElement & { pdfRun?: PdfTextRun }>(
    '[data-pdf-run]'
  )) {
    const run = span.pdfRun
    const node = span.firstChild
    if (!run || !node || !range.intersectsNode(node)) continue
    const start = range.startContainer === node ? range.startOffset : 0
    const end = range.endContainer === node ? range.endOffset : run.text.length
    if (end <= start) continue
    measuring.font = getComputedStyle(span).font
    const total = measuring.measureText(run.text).width || 1
    const offset = (run.width * measuring.measureText(run.text.slice(0, start)).width) / total
    const width = (run.width * measuring.measureText(run.text.slice(start, end)).width) / total
    fragments.push({
      ...run,
      key: `${run.key}:${start}-${end}`,
      text: run.text.slice(start, end),
      width,
      x: run.x + offset * (run.matrix?.[0] ?? Math.cos(run.angle)),
      y: run.y + offset * (run.matrix?.[1] ?? Math.sin(run.angle))
    })
  }
  return fragments
}

export async function editSelection(selection: TextSelectionInfo): Promise<void> {
  if (selection.annotationId) {
    const store = useAnnotationStore.getState()
    const annotation = store.annotations.find((a) => a.id === selection.annotationId)
    if (!annotation) return
    const replacement = await requestPdfText(annotation.sourceText, selection.text, annotation)
    if (
      replacement === null ||
      useAnnotationStore.getState().annotations.find((a) => a.id === annotation.id) !== annotation
    )
      return
    const value = annotation.text || ''
    store.updateAnnotation(annotation.id, {
      text:
        value.slice(0, selection.annotationStart) +
        replacement.text +
        value.slice(selection.annotationEnd),
      ...replacement.style
    })
    store.setSelected(annotation.id)
    window.getSelection()?.removeAllRanges()
    return
  }
  const fragments = selection.runs || []
  if (!fragments.length) return
  const source = usePdfStore.getState().data
  const first = fragments[0]
  const baselineOffset = (run: PdfTextRun, previous: PdfTextRun): number =>
    Math.abs(
      (run.x - previous.x) * Math.sin(first.angle) - (run.y - previous.y) * Math.cos(first.angle)
    )
  const initial = fragments
    .map(
      (run, index) =>
        (index
          ? baselineOffset(run, fragments[index - 1]) > first.size * 0.5
            ? '\n'
            : run.x -
                  fragments[index - 1].x -
                  fragments[index - 1].width * (fragments[index - 1].matrix?.[0] || 1) >
                first.size * 0.15
              ? ' '
              : ''
          : '') + run.text
    )
    .join('')
  const replacement = await requestPdfText(first, initial)
  if (
    replacement === null ||
    (replacement.text === initial && !Object.keys(replacement.style).length) ||
    source !== usePdfStore.getState().data
  )
    return
  const second = fragments.find((run) => baselineOffset(run, first) > first.size * 0.5)
  const lineHeight = second
    ? Math.abs(
        (second.x - first.x) * Math.sin(first.angle) - (second.y - first.y) * Math.cos(first.angle)
      ) || first.size * 1.2
    : first.size * 1.2
  const id = `selection-${crypto.randomUUID()}`
  useAnnotationStore.getState().addAnnotation({
    id,
    page: selection.pageNum,
    type: 'text',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    sourceText: first,
    maskTexts: fragments,
    lineHeight,
    text: replacement.text,
    fontSize: first.size,
    fontFamily: first.fontFamily,
    color: first.color || '#000000',
    bold: first.bold,
    italic: first.italic,
    strokeWidth: 0,
    opacity: 1,
    ...replacement.style
  })
  useAnnotationStore.getState().setSelected(id)
  useUIStore.getState().setRightPane('edit')
  window.getSelection()?.removeAllRanges()
}
