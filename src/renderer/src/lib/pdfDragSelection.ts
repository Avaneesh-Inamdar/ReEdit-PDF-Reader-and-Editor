import { useUIStore } from '../stores/useUIStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
// Resolve drag endpoints against glyphs rather than Chromium's page-sized
// absolutely positioned container. Blank space must never select the page tail.
export function installPdfDragSelection(container: HTMLElement): () => void {
  // PDF paint order is not necessarily reading order. Normalize single-column,
  // upright text only; preserve authored order for columns and rotated text.
  const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-run]')).filter(
    (span) => span.textContent?.trim()
  )
  const measured = spans.map((span) => ({ span, box: span.getBoundingClientRect() }))
  const lefts = measured.map((item) => item.box.left)
  const sameColumn =
    lefts.length > 1 && Math.max(...lefts) - Math.min(...lefts) < container.clientWidth * 0.15
  const upright = spans.every(
    (span) =>
      Math.abs((span as HTMLElement & { pdfRun?: { angle: number } }).pdfRun?.angle || 0) < 0.01
  )
  if (sameColumn && upright) {
    measured.sort((a, b) =>
      Math.abs(a.box.top - b.box.top) < Math.min(a.box.height, b.box.height) * 0.35
        ? a.box.left - b.box.left
        : a.box.top - b.box.top
    )
    const fragment = document.createDocumentFragment()
    measured.forEach((item, index) => {
      if (
        index &&
        item.box.top - measured[index - 1].box.top >
          Math.min(item.box.height, measured[index - 1].box.height) * 0.35
      )
        fragment.appendChild(document.createElement('br'))
      fragment.appendChild(item.span)
    })
    // Retain empty spans with their PDF run mapping for search metadata.
    for (const span of container.querySelectorAll<HTMLElement>('[data-pdf-run]'))
      if (!spans.includes(span)) fragment.appendChild(span)
    container.replaceChildren(fragment)
  }
  type Caret = { node: Text; offset: number }
  let anchor: Caret | null = null
  let pointer: number | null = null
  let boxes: { span: HTMLElement; box: DOMRect }[] | null = null
  let scrollTop = 0
  const caret = (x: number, y: number): Caret | null => {
    const viewer = container.closest('[data-pdf-viewer]')
    if (!boxes || scrollTop !== viewer?.scrollTop) {
      boxes = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-run]')).map((span) => ({
        span,
        box: span.getBoundingClientRect()
      }))
      scrollTop = viewer?.scrollTop || 0
    }
    let closest: HTMLElement | null = null
    let distance = Infinity
    for (const { span, box } of boxes) {
      if (!box.width || !box.height || !(span.firstChild instanceof Text)) continue
      const dx = Math.max(box.left - x, 0, x - box.right)
      const dy = Math.max(box.top - y, 0, y - box.bottom)
      // Prefer the intended line, including its trailing whitespace.
      const score = dy * dy * 16 + dx * dx
      if (score < distance) {
        distance = score
        closest = span
      }
    }
    const node = closest?.firstChild
    if (!(node instanceof Text)) return null
    // Native caret hit testing handles ligatures and transformed/rotated spans.
    const hit = document.caretRangeFromPoint(x, y)
    if (hit?.startContainer === node) return { node, offset: hit.startOffset }
    const range = document.createRange()
    let offset = 0
    let best = Infinity
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const r = range.getBoundingClientRect()
      for (const [index, cx, cy] of [
        [i, r.left, r.top + r.height / 2],
        [i + 1, r.right, r.top + r.height / 2]
      ]) {
        const score = (cx - x) ** 2 + (cy - y) ** 2
        if (score < best) {
          best = score
          offset = index
        }
      }
    }
    return { node, offset }
  }
  const down = (event: PointerEvent): void => {
    const ui = useUIStore.getState()
    if (
      event.button !== 0 ||
      event.detail > 1 ||
      ui.spaceHeld ||
      ui.pointerMode !== 'select' ||
      useAnnotationStore.getState().tool !== 'select'
    )
      return
    boxes = null
    anchor = caret(event.clientX, event.clientY)
    if (!anchor) return
    event.preventDefault()
    pointer = event.pointerId
    container.setPointerCapture(pointer)
    window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, anchor.node, anchor.offset)
  }
  const move = (event: PointerEvent): void => {
    if (!anchor || pointer !== event.pointerId) return
    const end = caret(event.clientX, event.clientY)
    if (end)
      window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, end.node, end.offset)
    event.preventDefault()
    // Continue selection when dragging into the viewer's vertical scroll margins.
    const viewer = container.closest('[data-pdf-viewer]')
    if (viewer) {
      const box = viewer.getBoundingClientRect()
      if (event.clientY > box.bottom - 24) viewer.scrollTop += 18
      else if (event.clientY < box.top + 24) viewer.scrollTop -= 18
    }
  }
  const up = (event: PointerEvent): void => {
    if (pointer !== event.pointerId) return
    move(event)
    if (
      anchor &&
      window.getSelection()?.isCollapsed &&
      useUIStore.getState().rightPane === 'edit'
    ) {
      const span = anchor.node.parentElement as (HTMLElement & { pdfRun?: unknown }) | null
      if (span?.pdfRun)
        window.dispatchEvent(
          new CustomEvent('pdf:editRun', {
            detail: { page: Number(span.dataset.pdfRun?.split(':')[0]), run: span.pdfRun }
          })
        )
    }
    anchor = null
    if (container.hasPointerCapture(event.pointerId))
      container.releasePointerCapture(event.pointerId)
    pointer = null
  }
  container.addEventListener('pointerdown', down)
  container.addEventListener('pointermove', move)
  container.addEventListener('pointerup', up)
  container.addEventListener('pointercancel', up)
  return () => {
    container.removeEventListener('pointerdown', down)
    container.removeEventListener('pointermove', move)
    container.removeEventListener('pointerup', up)
    container.removeEventListener('pointercancel', up)
  }
}
