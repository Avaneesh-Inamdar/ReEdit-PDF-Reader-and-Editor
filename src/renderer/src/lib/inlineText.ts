import { useUIStore } from '../stores/useUIStore'
import { textMatrix, type PdfTextRun } from './pdfText'
import type { Annotation } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { replacementSpacing } from './textSpacing'
import { previewSpaceAdjustment } from './fonts'
import { retainPreviewFont } from './fontFaces'

type Options = {
  fonts: { id: string; name: string }[]
  onFontChange: (id: string) => void
  validate: (text: string, id: string) => Promise<string | null>
  selectedRange?: { start: number; end: number }
  preview?: (text: string, id: string) => Promise<{ fontFamily: string; notice: string }>
}
let active: { apply: () => Promise<boolean> } | undefined
const mutations = new Set<Promise<void>>()
export function trackInlineMutation(task: Promise<void>): Promise<void> {
  mutations.add(task)
  void task.finally(() => mutations.delete(task)).catch(() => {})
  return task
}
export async function commitInlineEdit(): Promise<boolean> {
  if (!active && !mutations.size) return true
  if (!active && mutations.size) {
    const start = Date.now()
    while (!active && mutations.size && Date.now() - start < 5000)
      await new Promise((resolve) => setTimeout(resolve, 20))
  }
  if (active && !(await active.apply())) return false
  await Promise.all([...mutations])
  return true
}

export function inlinePlacement(
  source: PdfTextRun | undefined
): { page: HTMLElement; matrix: number[] } | null {
  if (!source || typeof document === 'undefined') return null
  const page = document.getElementById(`page-${source.key.split(':')[0]}`)
  const transform = page?.querySelector<HTMLElement>('.textLayer')?.dataset.pdfTransform
  if (!page || !transform) return null
  return { page, matrix: textMatrix(source, JSON.parse(transform)) }
}

export async function requestInlineText(
  source: PdfTextRun,
  initial: string,
  options: Options,
  annotation?: Annotation,
  override?: { page: HTMLElement; matrix: number[] }
): Promise<string | null> {
  if (active && !(await active.apply())) return null
  const placement = override || inlinePlacement(source)
  if (!placement) return null
  return new Promise((resolve) => {
    const { page, matrix } = placement
    const [a, b, c, d, e, f] = matrix
    const size = annotation?.fontSize || source.size
    const initialDirty = usePdfStore.getState().isDirty,
      initialData = usePdfStore.getState().data,
      initialAnnotations = useAnnotationStore.getState().annotations
    const editor = document.createElement('div'),
      input = document.createElement('textarea'),
      bar = document.createElement('div'),
      font = document.createElement('select'),
      done = document.createElement('button'),
      cancel = document.createElement('button'),
      error = document.createElement('p'),
      notice = document.createElement('p')
    editor.className = 'pdf-inline-editor'
    input.setAttribute('aria-label', 'Edit text on page')
    input.value = initial
    input.spellcheck = false
    input.wrap = 'off'
    const top = -source.ascent - 2
    editor.style.transform = `matrix(${a},${b},${c},${d},${e + c * top},${f + d * top})`
    Object.assign(input.style, {
      fontSize: `${size}px`,
      fontFamily: annotation?.previewFont || source.previewFont || source.fontFamily,
      color: annotation?.color || source.color || '#000000',
      fontWeight: (annotation?.bold ?? source.bold) ? '700' : '400',
      fontStyle: (annotation?.italic ?? source.italic) ? 'italic' : 'normal',
      lineHeight: `${annotation?.lineHeight || size * 1.2}px`
    })
    const spacing = annotation
      ? replacementSpacing(annotation)
      : {
          character: source.characterSpacing || 0,
          word: source.wordSpacing || 0
        }
    input.style.letterSpacing = `${spacing.character}px`
    input.style.wordSpacing = `${spacing.word + (annotation ? previewSpaceAdjustment(annotation) : 0)}px`
    const measuring = document.createElement('canvas').getContext('2d')
    const grow = (): void => {
      if (measuring)
        measuring.font = `${input.style.fontStyle} ${input.style.fontWeight} ${size}px ${input.style.fontFamily}`
      input.style.width = `${Math.max(source.width + 8, 80, ...input.value.split('\n').map((line) => (measuring?.measureText(line).width || line.length * size * 0.6) + line.length * spacing.character + (line.match(/ /g)?.length || 0) * spacing.word + 8))}px`
      input.style.height = '0px'
      input.style.height = `${Math.max(size * 1.3 + 4, input.scrollHeight + 4)}px`
      if (editor.isConnected) {
        const bounds = input.getBoundingClientRect(),
          paper = page.getBoundingClientRect()
        bar.style.top = `${bounds.bottom - paper.top + 6}px`
        bar.style.left = `${Math.max(4, Math.min(bounds.left - paper.left, page.clientWidth - 390))}px`
      }
    }
    let previewVersion = 0,
      releasePreview: (() => void) | undefined
    const refreshPreview = async (): Promise<void> => {
      const version = ++previewVersion
      try {
        const preview = await options.preview?.(input.value, font.value)
        if (version !== previewVersion || !editor.isConnected || !preview) return
        releasePreview?.()
        releasePreview = retainPreviewFont(preview.fontFamily)
        input.style.fontFamily = `"${preview.fontFamily}"`
        notice.textContent = preview.notice
        if (preview.notice) {
          input.style.letterSpacing = '0px'
          input.style.wordSpacing = '0px'
        }
        grow()
      } catch (e) {
        if (version === previewVersion)
          notice.textContent = String(e instanceof Error ? e.message : e)
      }
    }
    let previewTimer: ReturnType<typeof setTimeout> | undefined
    input.addEventListener('input', () => {
      grow()
      clearTimeout(previewTimer)
      previewTimer = setTimeout(() => void refreshPreview(), 200)
      usePdfStore.getState().setDirty(true)
    })
    bar.className = 'pdf-inline-actions'
    bar.setAttribute('aria-label', 'Text editing controls')
    Object.assign(bar.style, {
      left: `${Math.max(4, Math.min(e, page.clientWidth - 390))}px`,
      top: `${Math.max(0, f + size * 1.5)}px`
    })
    font.setAttribute('aria-label', 'Replacement font')
    for (const choice of options.fonts) {
      const item = document.createElement('option')
      item.value = choice.id
      item.textContent = choice.name
      font.append(item)
    }
    font.onchange = () => {
      options.onFontChange(font.value)
      input.style.letterSpacing = font.value === 'original' ? `${spacing.character}px` : '0px'
      input.style.wordSpacing =
        font.value === 'original'
          ? `${spacing.word + (annotation ? previewSpaceAdjustment(annotation) : 0)}px`
          : '0px'
      error.textContent = ''
      void refreshPreview()
      usePdfStore.getState().setDirty(true)
      input.focus()
    }
    done.textContent = 'Done'
    cancel.textContent = 'Cancel'
    done.className = 'operation-primary'
    cancel.className = 'operation-secondary'
    error.className = 'operation-error'
    error.setAttribute('role', 'alert')
    notice.className = 'pdf-inline-notice'
    notice.setAttribute('role', 'status')
    let finished = false,
      busy: Promise<boolean> | undefined,
      observer: MutationObserver | undefined
    const cleanup = (value: string | null): void => {
      if (finished) return
      finished = true
      clearTimeout(previewTimer)
      releasePreview?.()
      previewVersion++
      if (
        (value === null || (value === initial && font.value === 'original')) &&
        !initialDirty &&
        initialData === usePdfStore.getState().data &&
        initialAnnotations === useAnnotationStore.getState().annotations
      )
        usePdfStore.getState().setDirty(false)
      observer?.disconnect()
      unsubscribe()
      document.removeEventListener('pointerdown', outside, true)
      editor.remove()
      bar.remove()
      if (active === controller) active = undefined
      resolve(value)
    }
    const apply = (): Promise<boolean> => {
      if (finished) return Promise.resolve(true)
      if (busy) return busy
      done.disabled = true
      busy = (async () => {
        try {
          const message = await options.validate(input.value, font.value)
          if (message) {
            error.textContent = message
            input.focus()
            return false
          }
          cleanup(input.value)
          return true
        } catch (e) {
          error.textContent = String(e)
          input.focus()
          return false
        } finally {
          done.disabled = false
          busy = undefined
        }
      })()
      return busy
    }
    const controller = { apply }
    active = controller
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !editor.contains(event.target) &&
        !bar.contains(event.target)
      )
        void apply()
    }
    const unsubscribe = useUIStore.subscribe((state, previous) => {
      if (state.rightPane !== previous.rightPane && state.rightPane !== 'edit')
        void apply().then((ok) => {
          if (!ok) useUIStore.getState().setRightPane('edit')
        })
    })
    done.onclick = () => void apply()
    cancel.onclick = () => cleanup(null)
    editor.onpointerdown = (event) => event.stopPropagation()
    bar.onpointerdown = (event) => event.stopPropagation()
    input.onkeydown = (event) => {
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        cleanup(null)
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void apply()
      }
    }
    editor.append(input)
    bar.append(font, done, cancel, notice, error)
    page.append(editor, bar)
    document.addEventListener('pointerdown', outside, true)
    grow()
    input.focus()
    if (options.selectedRange)
      input.setSelectionRange(options.selectedRange.start, options.selectedRange.end)
    void refreshPreview()
    // A page can be closed while an editor is open. Release its subscriptions.
    observer = new MutationObserver(() => {
      if (!page.isConnected) cleanup(null)
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}
