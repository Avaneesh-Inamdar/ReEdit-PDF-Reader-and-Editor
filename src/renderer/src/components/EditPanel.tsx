import { Icon } from './Icon'
import { editSelection } from '../lib/editSelection'
import { placeImage } from '../lib/imagePlacement'
import { requestText } from '../lib/requestText'
import { useEffect, useState, useRef } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useEditStore } from '../stores/useEditStore'
import { useDetectionStore } from '../stores/useDetectionStore'
import { useUIStore } from '../stores/useUIStore'
import {
  getCurrentTextSelection,
  applyHighlightToSelection,
  applyUnderlineSelection,
  applyStrikeSelection,
  applyTextColorToSelection,
  type TextSelectionInfo
} from '../lib/textSelection'

const FONT_OPTIONS = [
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Helvetica Bold', value: 'Helvetica-Bold' },
  { label: 'Times Roman', value: 'Times-Roman' },
  { label: 'Times Bold', value: 'Times-Bold' },
  { label: 'Courier', value: 'Courier' },
]

const SIZE_OPTIONS = [8,10,12,14,16,18,24,32,48]

export function EditPanel(): React.JSX.Element {
  const { data, currentPage } = usePdfStore()
  const { annotations, selectedId, updateAnnotation, deleteAnnotation, addAnnotation } = useAnnotationStore()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const det = useDetectionStore()

  const selected = annotations.find(a => a.id === selectedId) || null
  const isTextSelected = selected?.type === 'text'
  const [liveSelection, setLiveSelection] = useState<TextSelectionInfo | null>(null)
  const [liveColor, setLiveColor] = useState('#ef4444')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const checkSel = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setLiveSelection(getCurrentTextSelection())
      }, 50)
    }
    document.addEventListener('selectionchange', checkSel)
    window.addEventListener('mouseup', checkSel)
    return () => {
      document.removeEventListener('selectionchange', checkSel)
      window.removeEventListener('mouseup', checkSel)
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    useAnnotationStore.getState().setTool('select')
    useUIStore.getState().setPointerMode('select')
  }, [])

  const onAddTextAtCenter = async (): Promise<void> => {
    if (!data) return alert('Open a PDF first')
    const text = await requestText('Text to add:', 'Hello PDF')
    if (!text) return
    const sizeStr = await requestText('Font size:', '14') || '14'
    const size = Math.max(6, Math.min(72, parseInt(sizeStr,10) || 14))
    const color = await requestText('Color hex:', '#111827') || '#111827'
    // Place at center of current page
    const anno = {
      id: `txt-${Date.now()}`,
      page: currentPage,
      type: 'text' as const,
      x: 0.35, y: 0.48, w: 0.3, h: 0.05,
      color, strokeWidth: 1, opacity: 1,
      text, fontSize: size, fontFamily: 'Helvetica'
    }
    addAnnotation(anno as never)
    useAnnotationStore.getState().setSelected(anno.id)
  }

  const onAddTextClickMode = async (): Promise<void> => {
    const text = await requestText('Text to place (then click on page):', 'Sample text')
    if (!text) return
    const sizeStr = await requestText('Font size:', '12') || '12'
    const size = Math.max(6, Math.min(72, parseInt(sizeStr,10) || 12))
    const color = await requestText('Color:', '#111827') || '#111827'
    useEditStore.getState().setPendingText({ text, color, size })
    useAnnotationStore.getState().setTool('text')

  }

  const onAddImage = (): void => imageInputRef.current?.click()
  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    try { await placeImage(url, 0.3) } finally { URL.revokeObjectURL(url) }
    e.target.value = ''
  }
  const placeImageAtCenter = async (): Promise<void> => {
    const pending = useEditStore.getState().pendingImage
    if (!pending) return alert('No image selected. Use Add Image first.')
    const id = `img-${Date.now()}`
    const anno = { id, page: currentPage, type: 'image' as const, x: 0.35, y: 0.32, w: 0.3, h: 0.27, color: '#6b7280', strokeWidth: 1, opacity: 1, image: pending }
    addAnnotation(anno as never)
    useAnnotationStore.getState().setSelected(id)
    useEditStore.getState().setPendingImage(null)
    useAnnotationStore.getState().setTool('select')
  }

  const onFontChange = (field: 'fontFamily'|'fontSize'|'color'|'text'|'bold'|'italic', value: string|number|boolean): void => {
    if (!selected) return
    if (field === 'fontSize') updateAnnotation(selected.id, { fontSize: Number(value) })
    else if (field === 'fontFamily') updateAnnotation(selected.id, { fontFamily: String(value) })
    else if (field === 'color') updateAnnotation(selected.id, { color: String(value) })
    else if (field === 'text') updateAnnotation(selected.id, { text: String(value) })
    else if (field === 'bold') updateAnnotation(selected.id, { bold: Boolean(value) })
    else if (field === 'italic') updateAnnotation(selected.id, { italic: Boolean(value) })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 text-sm" style={{ background: 'var(--acrobat-chrome-alt)', color: 'var(--acrobat-text)' }}>Click text on the page to edit it.</div>
      {/* FORMAT – wired to selected text annotation, like Word / Master PDF Editor */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">FORMAT</h3>
        {isTextSelected ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={selected?.fontFamily || 'Helvetica'}
                onChange={(e)=> onFontChange('fontFamily', e.target.value)}
                className="flex-1 h-7 text-xs px-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                title="Font family"
              >
                {FONT_OPTIONS.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                value={String(selected?.fontSize || 12)}
                onChange={(e)=> onFontChange('fontSize', e.target.value)}
                className="w-20 h-7 text-xs px-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                title="Font size"
              >
                {SIZE_OPTIONS.map(n=> <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={()=> onFontChange('bold', !selected?.bold)} className={`tb-btn h-7 w-7 border rounded ${selected?.bold ? 'bg-zinc-800 text-white dark:bg-zinc-700' : 'border-transparent'}`} title="Bold (uses Helvetica-Bold)"><Icon name="bold" /></button>
              <button onClick={()=> onFontChange('italic', !selected?.italic)} className={`tb-btn h-7 w-7 border rounded ${selected?.italic ? 'bg-zinc-800 text-white dark:bg-zinc-700' : 'border-transparent'}`} title="Italic"><Icon name="italic" /></button>
              <div className="tb-sep mx-1" />
              <input
                type="color"
                value={selected?.color || '#111827'}
                onChange={(e)=> onFontChange('color', e.target.value)}
                className="w-7 h-7 p-0 border rounded cursor-pointer"
                title="Text color"
              />
              <span className="text-xs ml-1" style={{ color: 'var(--acrobat-text-dim)' }}>{selected?.color}</span>
              <div className="flex-1" />
              <button onClick={()=> selected && deleteAnnotation(selected.id)} className="tb-btn h-7 px-2 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
            </div>
            <textarea
              value={selected?.text || ''}
              onChange={(e)=> onFontChange('text', e.target.value)}
              rows={2}
              className="w-full text-xs p-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 resize-y"
              placeholder="Text content"
              style={{ fontFamily: selected?.fontFamily?.includes('Courier') ? 'monospace' : selected?.fontFamily?.includes('Times') ? 'serif' : 'sans-serif', fontSize: Math.min(14, (selected?.fontSize||12)) }}
            />
          </div>
        ) : liveSelection ? (
          <div className="space-y-2.5">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--acrobat-text)' }}>
              Selected text (page {liveSelection.pageNum}): &ldquo;{liveSelection.text.slice(0, 35)}{liveSelection.text.length > 35 ? '…' : ''}&rdquo;
            </div>
            <button className="tb-btn w-full justify-center border rounded" title="Edit selected PDF text" onMouseDown={e => e.preventDefault()} onClick={() => { void editSelection(liveSelection); setLiveSelection(null) }}>Edit selected text</button>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => { applyHighlightToSelection(); setLiveSelection(null) }}
                className="tb-btn h-7 text-xs rounded border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200 justify-center"
                title="Highlight selected text"
              >
                Highlight
              </button>
              <button
                onClick={() => { applyUnderlineSelection(); setLiveSelection(null) }}
                className="tb-btn h-7 text-xs rounded border border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 justify-center"
                title="Underline selected text"
              >
                Underline
              </button>
              <button
                onClick={() => { applyStrikeSelection(); setLiveSelection(null) }}
                className="tb-btn h-7 text-xs rounded border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 justify-center"
                title="Strike selected text"
              >
                Strike
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={liveColor}
                onChange={(e) => setLiveColor(e.target.value)}
                className="w-7 h-7 p-0 border rounded cursor-pointer"
                title="Choose text color"
              />
              <button
                onClick={async () => { await applyTextColorToSelection(liveColor); setLiveSelection(null) }}
                className="tb-btn h-7 px-3 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex-1 justify-center font-medium"
                title="Change color of selected text"
              >
                Apply Text Color
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700" style={{ color: 'var(--acrobat-text-dim)' }}>
            No text selected. Select text on a page or click a text box to edit font/size/color. Selected: {selected ? `${selected.type} #${selected.page}` : 'none'}
          </div>
        )}
        {/* Quick font preview */}
        {isTextSelected && (
          <div className="mt-2 text-xs p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700" style={{ color: selected?.color, fontFamily: selected?.fontFamily?.includes('Courier') ? 'monospace' : selected?.fontFamily?.includes('Times') ? 'serif' : 'sans-serif', fontSize: selected?.fontSize, fontWeight: selected?.bold ? 700 : 400, fontStyle: selected?.italic ? 'italic' : 'normal' }}>
            Preview: {selected?.text || 'Sample'}
          </div>
        )}
      </div>

      {/* EDIT – element add, now functional (like Sejda, PDF24) */}
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">EDIT</h3>
        <div className="flex flex-col gap-1.5">
          <button onClick={onAddTextAtCenter} className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full">
            <Icon name="text" size={16} />
            Add Text (at center)
          </button>
          <button onClick={onAddTextClickMode} className="flex items-center gap-3 px-3 py-2 text-xs rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full" style={{ color: 'var(--acrobat-text-dim)' }}>
            <span className="ml-7">or Place on Click…</span>
          </button>
          <button onClick={onAddImage} className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full">
            <Icon name="image" size={16} />
            Add Image…
          </button>
          {useEditStore.getState().pendingImage && (
            <button onClick={() => void placeImageAtCenter()} className="ml-7 text-xs underline" style={{ color: 'var(--acrobat-accent)' }}>Place pending image at center</button>
          )}
          <button onClick={()=> useAnnotationStore.getState().setTool('rect')} className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full">
            <Icon name="rectangle" size={16} />
            Add Rectangle
          </button>
          <button onClick={()=> useAnnotationStore.getState().setTool('ellipse')} className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full">
            <Icon name="ellipse" size={16} />
            Add Ellipse
          </button>
        </div>

        <p className="mt-4 text-xs" style={{ color: 'var(--acrobat-pane-text)' }}>
          Click existing text on the page to edit it. Apply your change, then save with Ctrl+S.
          Scanned pages need OCR first. Text is replaced visually using the original position and a standard font; paragraph reflow is not supported.
        </p>

        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-6 mb-3">PAGES</h3>
        <div className="flex flex-col gap-1.5">
          <button onClick={() => useUIStore.getState().setActiveModal('organizePages')} className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full">
            <Icon name="thumbnails" size={16} />
            Organize Pages
          </button>
          <div className="text-xs mt-2" style={{ color:'var(--acrobat-text-dim)' }}>{det.textChars} chars · {det.avgCharsPerPage}/page · {det.numFonts} fonts {det.isScanned ? '· SCANNED' : ''}</div>
        </div>
      </div>

      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onImagePicked} />
    </div>
  )
}
