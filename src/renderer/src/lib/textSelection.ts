import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useTabStore } from '../stores/useTabStore'

export interface TextSelectionInfo {
  text: string
  pageNum: number
  rects: { x: number; y: number; w: number; h: number }[]
  boundingRect: { x: number; y: number; w: number; h: number }
  clientPosition: { top: number; left: number; right: number; bottom: number }
}

export function getCurrentTextSelection(): TextSelectionInfo | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const text = sel.toString().trim()
  if (!text) return null

  const range = sel.getRangeAt(0)
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  const pageEl = startEl?.closest('[id^="page-"]') as HTMLElement | null
  if (!pageEl) return null

  const pageNum = parseInt(pageEl.id.replace('page-', ''), 10)
  if (!pageNum || isNaN(pageNum)) return null

  const pageRect = pageEl.getBoundingClientRect()
  if (!pageRect.width || !pageRect.height) return null

  const domRects = Array.from(range.getClientRects())
  if (!domRects.length) return null

  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (const r of domRects) {
    if (r.width <= 1 || r.height <= 1) continue
    const x = Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width))
    const y = Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height))
    const w = Math.max(0.002, Math.min(1 - x, r.width / pageRect.width))
    const h = Math.max(0.002, Math.min(1 - y, r.height / pageRect.height))
    rects.push({ x, y, w, h })
  }

  if (!rects.length) return null

  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))

  const rangeClient = range.getBoundingClientRect()

  return {
    text,
    pageNum,
    rects,
    boundingRect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    clientPosition: {
      top: rangeClient.top,
      left: rangeClient.left,
      right: rangeClient.right,
      bottom: rangeClient.bottom
    }
  }
}

export function applyHighlightToSelection(color = '#ffee58'): boolean {
  const selInfo = getCurrentTextSelection()
  if (!selInfo) return false

  const { pageNum, rects, text } = selInfo
  const store = useAnnotationStore.getState()

  rects.forEach((r, idx) => {
    store.addAnnotation({
      id: `hl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      page: pageNum,
      type: 'highlight',
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      color,
      strokeWidth: 1,
      opacity: 0.4,
      text: idx === 0 ? text : ''
    })
  })
  window.getSelection()?.removeAllRanges()
  return true
}

export function applyUnderlineSelection(color = '#66bb6a'): boolean {
  const selInfo = getCurrentTextSelection()
  if (!selInfo) return false

  const { pageNum, rects, text } = selInfo
  const store = useAnnotationStore.getState()

  rects.forEach((r, idx) => {
    store.addAnnotation({
      id: `ul-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      page: pageNum,
      type: 'underline',
      x: r.x,
      y: Math.min(0.998, r.y + r.h - 0.003),
      w: r.w,
      h: 0.004,
      color,
      strokeWidth: 2,
      opacity: 1,
      text: idx === 0 ? text : ''
    })
  })
  window.getSelection()?.removeAllRanges()
  return true
}

export function applyStrikeSelection(color = '#ef5350'): boolean {
  const selInfo = getCurrentTextSelection()
  if (!selInfo) return false

  const { pageNum, rects, text } = selInfo
  const store = useAnnotationStore.getState()

  rects.forEach((r, idx) => {
    store.addAnnotation({
      id: `st-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      page: pageNum,
      type: 'strike',
      x: r.x,
      y: r.y + r.h / 2 - 0.002,
      w: r.w,
      h: 0.004,
      color,
      strokeWidth: 2,
      opacity: 1,
      text: idx === 0 ? text : ''
    })
  })
  window.getSelection()?.removeAllRanges()
  return true
}

export function applyRedactToSelection(color = '#000000'): boolean {
  const selInfo = getCurrentTextSelection()
  if (!selInfo) return false

  const { pageNum, rects } = selInfo
  const store = useAnnotationStore.getState()

  rects.forEach((r, idx) => {
    store.addAnnotation({
      id: `redact-${Date.now()}-${idx}`,
      page: pageNum,
      type: 'redact',
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      color,
      strokeWidth: 1,
      opacity: 1
    })
  })
  window.getSelection()?.removeAllRanges()
  return true
}

export async function applyTextColorToSelection(newColor: string): Promise<boolean> {
  const selInfo = getCurrentTextSelection()
  if (!selInfo) return false
  const { pageNum, boundingRect, text } = selInfo

  const pdfStore = usePdfStore.getState()
  if (!pdfStore.data) return false

  pdfStore.pushHistory()
  try {
    const { nonDestructiveEditText } = await import('./pdfEditing')
    const approxFontSize = Math.max(9, Math.min(48, Math.round(boundingRect.h * 720)))
    const editedBytes = await nonDestructiveEditText(
      pdfStore.data.slice(0),
      pageNum,
      {
        xNorm: boundingRect.x,
        yNorm: boundingRect.y,
        wNorm: boundingRect.w,
        hNorm: boundingRect.h
      },
      text,
      {
        fontSize: approxFontSize,
        colorHex: newColor
      }
    )
    const buf = editedBytes.buffer.slice(editedBytes.byteOffset, editedBytes.byteOffset + editedBytes.byteLength) as ArrayBuffer
    pdfStore.setData(buf)
    pdfStore.setDirty(true)
    const tabId = useTabStore.getState().activeTabId
    if (tabId) useTabStore.getState().markDirty(tabId)
    window.getSelection()?.removeAllRanges()
    return true
  } catch (err) {
    console.warn('Failed to rewrite text stream, creating styled text overlay:', err)
    const store = useAnnotationStore.getState()
    store.addAnnotation({
      id: `txtcol-${Date.now()}`,
      page: pageNum,
      type: 'text',
      x: boundingRect.x,
      y: boundingRect.y,
      w: boundingRect.w,
      h: Math.max(0.02, boundingRect.h),
      color: newColor,
      strokeWidth: 1,
      opacity: 1,
      text,
      fontSize: Math.max(9, Math.round(boundingRect.h * 720))
    })
    window.getSelection()?.removeAllRanges()
    return true
  }
}
