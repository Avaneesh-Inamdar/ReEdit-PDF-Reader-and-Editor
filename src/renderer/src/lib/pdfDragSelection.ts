import { useUIStore } from '../stores/useUIStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { readingOrder } from './readingOrder'
// Resolve drag endpoints against glyphs rather than Chromium's page-sized
// absolutely positioned container. Blank space must never select the page tail.
export function installPdfDragSelection(container: HTMLElement): () => void {
  // PDF paint order is not necessarily reading order. Normalize single-column,
  // upright text only; preserve authored order for columns and rotated text.
  const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-run]')).filter(
    (span) => span.textContent?.trim()
  )
  const measured = spans.map((span) => ({ span, box: span.getBoundingClientRect() }))
  const upright = spans.every(
    (span) =>
      Math.abs((span as HTMLElement & { pdfRun?: { angle: number } }).pdfRun?.angle || 0) < 0.01
  )
  if (upright) {
    measured.splice(0, measured.length, ...readingOrder(measured))
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
  let scrollLeft = 0
  let clickCount = 0
  let lastClick = { time: -Infinity, x: 0, y: 0 }
  let origin = { x: 0, y: 0 }
  let dragged = false
  let unitEnd: Caret | null = null
  const unit = (hit: Caret, count: number): [Caret, Caret] => {
    if (count >= 3) {
      const span = hit.node.parentElement!
      const box = span.getBoundingClientRect()
      const line = measured.filter(item => {
        const r = item.span.getBoundingClientRect()
        return item.span.dataset.removed !== 'true' && Math.abs((r.top+r.bottom)/2-(box.top+box.bottom)/2) < Math.min(r.height,box.height)*0.5
      }).sort((left,right)=>left.span.getBoundingClientRect().left-right.span.getBoundingClientRect().left)
      let firstIndex=line.findIndex(item=>item.span===span),lastIndex=firstIndex
      while(firstIndex>0&&line[firstIndex].span.getBoundingClientRect().left-line[firstIndex-1].span.getBoundingClientRect().right<box.height*2)firstIndex--
      while(lastIndex>=0&&lastIndex+1<line.length&&line[lastIndex+1].span.getBoundingClientRect().left-line[lastIndex].span.getBoundingClientRect().right<box.height*2)lastIndex++
      const first = line[firstIndex]?.span.firstChild, last = line[lastIndex]?.span.firstChild
      if (first instanceof Text && last instanceof Text) return [{node:first,offset:0},{node:last,offset:last.length}]
    }
    if (count === 2) {
      const word = [...new Intl.Segmenter(undefined,{granularity:'word'}).segment(hit.node.data)]
        .find(s => s.isWordLike && hit.offset >= s.index && hit.offset <= s.index+s.segment.length)
      if (word) return [{node:hit.node,offset:word.index},{node:hit.node,offset:word.index+word.segment.length}]
    }
    return [hit,hit]
  }
  const caret = (x: number, y: number): Caret | null => {
    const viewer = container.closest('[data-pdf-viewer]')
    if (!boxes || scrollTop !== viewer?.scrollTop || scrollLeft !== viewer?.scrollLeft) {
      boxes = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-run]')).filter(span => span.dataset.removed !== 'true').map((span) => ({
        span,
        box: span.getBoundingClientRect()
      }))
      scrollTop = viewer?.scrollTop || 0
      scrollLeft = viewer?.scrollLeft || 0
    }
    let closest: HTMLElement | null = null
    let distance = Infinity
    let verticalDistance = Infinity
    for (const { span, box } of boxes) {
      if (!box.width || !box.height || !(span.firstChild instanceof Text)) continue
      const dx = Math.max(box.left - x, 0, x - box.right)
      const dy = Math.max(box.top - y, 0, y - box.bottom)
      // First choose the line. A longer adjacent line must not win merely
      // because the pointer is far into this line's trailing whitespace.
      if (dy < verticalDistance || (dy === verticalDistance && dx < distance)) {
        verticalDistance = dy
        distance = dx
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
      event.pointerType === 'touch' ||
      ui.spaceHeld ||
      ui.pointerMode !== 'select' ||
      useAnnotationStore.getState().tool !== 'select'
    )
      return
    boxes = null
    anchor = caret(event.clientX, event.clientY)
    if (!anchor) return
    clickCount = event.timeStamp-lastClick.time < 500 && Math.hypot(event.clientX-lastClick.x,event.clientY-lastClick.y)<6 ? clickCount%3+1 : 1
    origin = {x:event.clientX,y:event.clientY}
    dragged = false
    ;[anchor,unitEnd] = unit(anchor,clickCount)
    const selection=window.getSelection()
    if(event.shiftKey&&selection?.anchorNode instanceof Text&&container.contains(selection.anchorNode))anchor={node:selection.anchorNode,offset:selection.anchorOffset}
    event.preventDefault()
    pointer = event.pointerId
    container.dataset.selecting = 'true'
    container.setPointerCapture(pointer)
    window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, unitEnd.node, unitEnd.offset)
  }
  const move = (event: PointerEvent): void => {
    if (!anchor || pointer !== event.pointerId) return
    if (!dragged && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<4) return
    dragged = true
    const end = caret(event.clientX, event.clientY)
    if (end) {
      const [start,finish] = unit(end,clickCount)
      const backward = anchor.node===end.node ? end.offset<anchor.offset : !!(anchor.node.compareDocumentPosition(end.node)&Node.DOCUMENT_POSITION_PRECEDING)
      const target = backward ? start : finish
      window.getSelection()?.setBaseAndExtent(backward && unitEnd ? unitEnd.node : anchor.node,backward && unitEnd ? unitEnd.offset : anchor.offset,target.node,target.offset)
    }
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
      clickCount === 1 && !dragged && event.type !== 'pointercancel' &&
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
    unitEnd = null
    lastClick = {time:dragged || event.type==='pointercancel' ? -Infinity : event.timeStamp,x:event.clientX,y:event.clientY}
    delete container.dataset.selecting
    if (container.hasPointerCapture(event.pointerId))
      container.releasePointerCapture(event.pointerId)
    pointer = null
  }
  const doubleClick = (event: MouseEvent): void => {
    const ui = useUIStore.getState()
    if (ui.pointerMode !== 'select' || ui.spaceHeld || useAnnotationStore.getState().tool !== 'select') return
    const hit = caret(event.clientX, event.clientY)
    if (!hit) return
    const value = hit.node.data
    const segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)
    const word = [...segments].find(segment => segment.isWordLike && hit.offset >= segment.index && hit.offset <= segment.index + segment.segment.length)
    if (word) {
      window.getSelection()?.setBaseAndExtent(hit.node, word.index, hit.node, word.index + word.segment.length)
      event.preventDefault()
    }
  }
  container.addEventListener('pointerdown', down)
  container.addEventListener('pointermove', move)
  container.addEventListener('pointerup', up)
  container.addEventListener('pointercancel', up)
  container.addEventListener('dblclick', doubleClick)
  return () => {
    if (pointer !== null && container.hasPointerCapture(pointer)) container.releasePointerCapture(pointer)
    pointer = null
    anchor = null
    unitEnd = null
    boxes = []
    container.removeEventListener('pointerdown', down)
    container.removeEventListener('pointermove', move)
    container.removeEventListener('pointerup', up)
    container.removeEventListener('pointercancel', up)
    container.removeEventListener('dblclick', doubleClick)
    delete container.dataset.selecting
  }
}
