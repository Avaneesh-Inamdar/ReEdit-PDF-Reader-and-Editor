import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import type { Annotation } from '../stores/useAnnotationStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { pageText } from './rendering'
import { readingOrder } from './readingOrder'

export function isTextInput(element: Element | null): boolean {
  return (
    !!element &&
    (element.matches('input, textarea, select') ||
      (element instanceof HTMLElement && element.isContentEditable))
  )
}

// Read source Unicode, not the font's display glyph codes. Apply pending edits
// before copying, including replacements on pages outside the render window.
export function selectablePageText(
  content: TextContent,
  annotations: Annotation[],
  page: number,
  width: number,
  height: number
): string {
  const edits = annotations.filter((annotation) => annotation.page === page)
  const items = content.items.flatMap((item, index) => {
    if (!('str' in item)) return []
    const deleted = new Set<number>()
    for (const edit of edits)
      for (const mask of edit.maskTexts || (edit.sourceText ? [edit.sourceText] : [])) {
        const key = mask.key.match(/^(\d+):(\d+)(?::(\d+)-(\d+))?$/)
        if (!key || Number(key[1]) !== page || Number(key[2]) !== index) continue
        const start = key[3] === undefined ? 0 : Number(key[3])
        const end = key[4] === undefined ? item.str.length : Number(key[4])
        for (let offset = start; offset < end; offset++) deleted.add(offset)
      }
    const text = item.str
      .split('')
      .filter((_, offset) => !deleted.has(offset))
      .join('')
    if (!text.trim()) return []
    return [
      {
        text,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: Math.hypot(item.transform[2], item.transform[3]) || 12,
        eol: item.hasEOL
      }
    ]
  })
  for (const edit of edits) {
    if (edit.type !== 'text' || !edit.text?.trim()) continue
    items.push({
      text: edit.text,
      x: edit.sourceText?.x ?? edit.x * width,
      y: edit.sourceText?.y ?? height * (1 - edit.y) - (edit.fontSize || 12),
      width: edit.sourceText?.width ?? edit.w * width,
      height: edit.fontSize || edit.sourceText?.size || 12,
      eol: true
    })
  }
  const ordered = readingOrder(
    items.map((item) => ({
      ...item,
      box: {
        left: item.x,
        right: item.x + item.width,
        top: -item.y,
        bottom: -item.y + item.height,
        height: item.height
      }
    }))
  )
  return ordered
    .map((item, index) => {
      const previous = ordered[index - 1]
      if (!previous) return item.text
      const newLine = Math.abs(previous.y - item.y) > Math.min(previous.height, item.height) * 0.5
      const space = item.x - previous.x - previous.width > item.height * 0.15
      return (
        (newLine
          ? '\n'
          : space && !/\s$/.test(previous.text) && !/^\s/.test(item.text)
            ? ' '
            : '') + item.text
      )
    })
    .join('')
    .trim()
}

export function installPdfSelectAll(root: HTMLElement, pdf: PDFDocumentProxy): () => void {
  let generation = 0
  let selected: HTMLElement | null = null
  let text: string | null = null
  let pending: Promise<string | null> | null = null
  const ownsRange = (): boolean => {
    const selection = window.getSelection()
    return (
      !!selected &&
      !!selection?.rangeCount &&
      !selection.isCollapsed &&
      selection.getRangeAt(0).startContainer === selected &&
      selection.getRangeAt(0).endContainer === selected
    )
  }
  const clear = (): void => {
    if (ownsRange()) window.getSelection()?.removeAllRanges()
    generation++
    selected = null
    text = null
    pending = null
    delete root.dataset.selectAll
    root.removeAttribute('aria-busy')
  }
  const select = (): void => {
    const ui = useUIStore.getState()
    if (
      ui.activeView !== 'document' ||
      ui.activeModal !== 'none' ||
      document.querySelector('[aria-modal="true"], .app-dialog, .file-dialog, .pdf-inline-editor')
    )
      return
    clear()
    useAnnotationStore.getState().setSelected(null)
    const target =
      ui.displayMode === 'single'
        ? root.querySelector<HTMLElement>(`#page-${usePdfStore.getState().currentPage}`)
        : root.querySelector<HTMLElement>('[data-pdf-pages]')
    if (!target) return
    const range = document.createRange()
    range.selectNodeContents(target)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    selected = target
    root.dataset.selectAll = 'loading'
    root.setAttribute('aria-busy', 'true')
    const version = generation
    const annotations = useAnnotationStore.getState().annotations
    const first = ui.displayMode === 'single' ? usePdfStore.getState().currentPage : 1
    const last = ui.displayMode === 'single' ? first : pdf.numPages
    pending = (async () => {
      const pages: string[] = []
      for (let number = first; number <= last; number++) {
        if (generation !== version) return null
        const content = await pageText(pdf, number)
        if (generation !== version) return null
        const page = await pdf.getPage(number)
        const viewport = page.getViewport({ scale: 1 })
        pages.push(
          selectablePageText(content, annotations, number, viewport.width, viewport.height)
        )
        // Keep large document selection interruptible without mounting canvases.
        if (number % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
      }
      if (generation !== version) return null
      text = pages.join('\n\n')
      root.dataset.selectAll = 'ready'
      root.removeAttribute('aria-busy')
      return text
    })().catch((error) => {
      if (generation === version) {
        clear()
        window.dispatchEvent(
          new CustomEvent('desktop:error', {
            detail: `Could not select PDF text: ${String(error)}`
          })
        )
      }
      return null
    })
  }
  const copy = (event: ClipboardEvent): void => {
    if (!ownsRange() || isTextInput(document.activeElement)) return
    event.preventDefault()
    if (text !== null && event.clipboardData) event.clipboardData.setData('text/plain', text)
    else {
      const version = generation
      void pending
        ?.then((value) => {
          if (value !== null && generation === version && ownsRange())
            return navigator.clipboard.writeText(value)
          return undefined
        })
        .catch((error) =>
          window.dispatchEvent(
            new CustomEvent('desktop:error', {
              detail: `Could not copy PDF text: ${String(error)}`
            })
          )
        )
    }
  }
  const pointer = (event: PointerEvent): void => {
    if (!(
      event.target instanceof Element &&
      event.target.closest('[role="menu"], .workspace-menu-anchor')
    ))
      clear()
  }
  const selectionChanged = (): void => {
    if (selected && !ownsRange()) clear()
  }
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') clear()
  }
  const focus = (): void => {
    if (isTextInput(document.activeElement)) clear()
  }
  const offAnnotations = useAnnotationStore.subscribe((state, previous) => {
    if (state.annotations !== previous.annotations) clear()
  })
  const offUI = useUIStore.subscribe((state, previous) => {
    if (
      state.activeView !== previous.activeView ||
      state.activeModal !== previous.activeModal ||
      state.displayMode !== previous.displayMode
    )
      clear()
  })
  const offPage = usePdfStore.subscribe((state, previous) => {
    if (
      state.data !== previous.data ||
      (useUIStore.getState().displayMode === 'single' && state.currentPage !== previous.currentPage)
    )
      clear()
  })
  window.addEventListener('acrobat:selectAll', select)
  document.addEventListener('copy', copy, true)
  document.addEventListener('pointerdown', pointer, true)
  document.addEventListener('selectionchange', selectionChanged)
  document.addEventListener('focusin', focus)
  window.addEventListener('keydown', key)
  return () => {
    clear()
    offAnnotations()
    offUI()
    offPage()
    window.removeEventListener('acrobat:selectAll', select)
    document.removeEventListener('copy', copy, true)
    document.removeEventListener('pointerdown', pointer, true)
    document.removeEventListener('selectionchange', selectionChanged)
    document.removeEventListener('focusin', focus)
    window.removeEventListener('keydown', key)
  }
}
