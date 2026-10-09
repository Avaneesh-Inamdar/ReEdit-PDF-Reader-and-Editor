import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { requestText } from './requestText'
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
      x: run.x + offset * Math.cos(run.angle),
      y: run.y + offset * Math.sin(run.angle)
    })
  }
  return fragments
}

export async function editSelection(selection: TextSelectionInfo): Promise<void> {
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
        (index && baselineOffset(run, fragments[index - 1]) > first.size * 0.5 ? '\n' : '') +
        run.text
    )
    .join('')
  const replacement = await requestText('Edit selected PDF text', initial)
  if (replacement === null || replacement === initial || source !== usePdfStore.getState().data)
    return
  const second = fragments.find((run) => baselineOffset(run, first) > first.size * 0.5)
  const lineHeight = second
    ? Math.abs(
        (second.x - first.x) * Math.sin(first.angle) - (second.y - first.y) * Math.cos(first.angle)
      ) || first.size * 1.2
    : first.size * 1.2
  const id = `selection-${crypto.randomUUID()}`
  useAnnotationStore
    .getState()
    .addAnnotation({
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
      text: replacement,
      fontSize: first.size,
      fontFamily: first.fontFamily,
      color: '#000000',
      strokeWidth: 0,
      opacity: 1
    })
  useAnnotationStore.getState().setSelected(id)
  useUIStore.getState().setRightPane('edit')
  window.getSelection()?.removeAllRanges()
}
