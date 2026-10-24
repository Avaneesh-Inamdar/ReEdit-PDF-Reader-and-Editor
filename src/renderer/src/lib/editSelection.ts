import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { requestPdfText } from './textEditRequest'
import type { PdfTextRun } from './pdfText'
import type { TextSelectionInfo } from './textSelection'
import { trackInlineMutation } from './inlineText'
import { connectedTextBox, lineText, textBoxSource, textBoxText } from './textLine'

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
    if (!run || !node || span.dataset.removed === 'true' || !range.intersectsNode(node)) continue
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

export function editSelection(selection: TextSelectionInfo): Promise<void> {
  return trackInlineMutation(editSelected(selection))
}
async function editSelected(selection: TextSelectionInfo): Promise<void> {
  useUIStore.getState().setRightPane('edit')
  if (selection.annotationId) {
    const store = useAnnotationStore.getState()
    const annotation = store.annotations.find((a) => a.id === selection.annotationId)
    if (!annotation) return
    const replacement = await requestPdfText(
      annotation.sourceText,
      annotation.text || '',
      annotation,
      undefined,
      {
        start: selection.annotationStart ?? 0,
        end: selection.annotationEnd ?? (annotation.text || '').length
      }
    )
    if (
      replacement === null ||
      useAnnotationStore.getState().annotations.find((a) => a.id === annotation.id) !== annotation
    )
      return
    store.updateAnnotation(annotation.id, {
      text: replacement.text,
      ...replacement.style
    })
    store.setSelected(annotation.id)
    window.getSelection()?.removeAllRanges()
    return
  }
  let fragments = selection.runs || []
  if (!fragments.length) return
  // Extend a word selection to its confidently detected paragraph or line,
  // keeping that word selected while following words reflow with the edit.
  let selectedRange: { start: number; end: number } | undefined
  let boxSource: PdfTextRun | undefined
  const selected = fragments[0]
  if (fragments.every((run) => Math.abs(run.y - selected.y) < selected.size * 0.35)) {
    const page = document.getElementById(`page-${selection.pageNum}`)
    const all = [
      ...(page?.querySelectorAll<HTMLElement & { pdfRun?: PdfTextRun }>('[data-pdf-run]') || [])
    ]
      .filter((span) => span.dataset.removed !== 'true')
      .map((span) => span.pdfRun)
      .filter((run): run is PdfTextRun => !!run)
    const parent = all.find(
      (run) => selected.key === run.key || selected.key.startsWith(run.key + ':')
    )
    if (parent) {
      const box = connectedTextBox(parent, all),
        group = box.flat(),
        lineIndex = box.findIndex((line) => line.some((run) => run.key === parent.key)),
        line = box[lineIndex],
        text = textBoxText(box),
        offset = /:(\d+)-(\d+)$/.exec(selected.key),
        prefix =
          (lineIndex ? textBoxText(box.slice(0, lineIndex)).length + 1 : 0) +
          lineText(line.slice(0, line.indexOf(parent) + 1)).length -
          parent.text.length,
        start =
          prefix +
          Number(offset?.[1] || 0) +
          (selected.text.length - selected.text.trimStart().length)
      if (text.slice(start, start + selection.text.length) === selection.text) {
        fragments = group
        boxSource = textBoxSource(box)
        selectedRange = { start, end: start + selection.text.length }
      }
    }
  }
  const source = usePdfStore.getState().data
  const first = boxSource || fragments[0]
  const baselineOffset = (run: PdfTextRun, previous: PdfTextRun): number =>
    Math.abs(
      (run.x - previous.x) * Math.sin(first.angle) - (run.y - previous.y) * Math.cos(first.angle)
    )
  const initial =
    boxSource?.text ??
    fragments
      .map(
        (run, index) =>
          (index
            ? baselineOffset(run, fragments[index - 1]) > first.size * 0.5
              ? '\n'
              : !/\s$/.test(fragments[index - 1].text) &&
                  !/^\s/.test(run.text) &&
                  run.x -
                    fragments[index - 1].x -
                    fragments[index - 1].width * (fragments[index - 1].matrix?.[0] || 1) >
                    first.size * 0.15
                ? ' '
                : ''
            : '') + run.text
      )
      .join('')
  const replacement = await requestPdfText(first, initial, undefined, undefined, selectedRange)
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
