import { useState, useRef } from 'react'
import {
  type TextSelectionInfo,
  applyHighlightToSelection,
  applyUnderlineSelection,
  applyStrikeSelection,
  applyTextColorToSelection,
  applyRedactToSelection
} from '../lib/textSelection'
import { useAnnotationStore } from '../stores/useAnnotationStore'

const QUICK_COLORS = ['#ffee58', '#66bb6a', '#42a5f5', '#ef5350', '#ab47bc', '#ffa726', '#111827']

export function TextSelectionFloatingToolbar({
  selection,
  onClose
}: {
  selection: TextSelectionInfo
  onClose: () => void
}): React.JSX.Element {
  const { color } = useAnnotationStore()
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorMode, setColorMode] = useState<'highlight' | 'text'>('highlight')
  const [textColor, setTextColor] = useState('#ef4444')
  const toolbarRef = useRef<HTMLDivElement>(null)

  const { clientPosition } = selection

  // Position floating bar centered above the selection (or below if top space is limited)
  const width = 340
  const height = 40
  let top = clientPosition.top - height - 10
  if (top < 70) top = clientPosition.bottom + 10
  let left = (clientPosition.left + clientPosition.right) / 2 - width / 2
  if (left < 10) left = 10
  if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(selection.text)
    } catch {}
    onClose()
  }

  const handleHighlight = (c?: string): void => {
    applyHighlightToSelection(c || color || '#ffee58')
    onClose()
  }

  const handleUnderline = (): void => {
    applyUnderlineSelection('#22c55e')
    onClose()
  }

  const handleStrike = (): void => {
    applyStrikeSelection('#ef5350')
    onClose()
  }

  const handleRedact = (): void => {
    applyRedactToSelection('#000000')
    onClose()
  }

  const handleTextColor = async (c: string): Promise<void> => {
    await applyTextColorToSelection(c)
    onClose()
  }

  // Prevent mousedown on toolbar from losing selection before click fires
  const preventDeselect = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      ref={toolbarRef}
      onMouseDown={preventDeselect}
      className="fixed z-50 flex flex-col items-center select-none animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: Math.round(top),
        left: Math.round(left),
        filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.35))'
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs"
        style={{
          background: 'var(--acrobat-toolbar)',
          borderColor: 'var(--acrobat-border)',
          color: 'var(--acrobat-text)'
        }}
      >
        {/* Highlight button */}
        <button
          className="tb-btn flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700/20"
          onClick={() => handleHighlight()}
          title="Highlight text"
        >
          <span className="w-3 h-3 rounded-full border border-black/20" style={{ background: '#ffee58' }} />
          <span>Highlight</span>
        </button>

        {/* Highlight Palette Toggle */}
        <div className="relative">
          <button
            className="tb-btn p-1 rounded hover:bg-zinc-700/20"
            onClick={() => { setColorMode('highlight'); setShowColorPicker((v) => !v) }}
            title="Highlight Colors"
          >
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M0 0l4 5 4-5z" /></svg>
          </button>
        </div>

        <div className="tb-sep" style={{ height: 18 }} />

        {/* Underline button */}
        <button
          className="tb-btn flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-700/20"
          onClick={handleUnderline}
          title="Underline text"
        >
          <span className="font-serif underline font-bold" style={{ textDecorationColor: '#22c55e', textDecorationThickness: 2 }}>U</span>
          <span>Underline</span>
        </button>

        {/* Strikethrough button */}
        <button
          className="tb-btn flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-700/20"
          onClick={handleStrike}
          title="Strikethrough text"
        >
          <span className="font-serif line-through font-bold" style={{ textDecorationColor: '#ef5350', textDecorationThickness: 2 }}>S</span>
          <span>Strike</span>
        </button>

        <div className="tb-sep" style={{ height: 18 }} />

        {/* Change Text Color button */}
        <button
          className="tb-btn flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-700/20"
          onClick={() => { setColorMode('text'); setShowColorPicker((v) => !v) }}
          title="Change Text Color"
        >
          <span className="font-bold text-sm" style={{ color: textColor }}>A</span>
          <span className="w-2.5 h-1 rounded-sm" style={{ background: textColor }} />
        </button>

        <div className="tb-sep" style={{ height: 18 }} />

        {/* Copy */}
        <button
          className="tb-btn p-1 rounded hover:bg-zinc-700/20"
          onClick={() => void handleCopy()}
          title="Copy selected text (Ctrl+C)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>

        {/* Redact */}
        <button
          className="tb-btn p-1 rounded hover:bg-zinc-700/20 text-red-500"
          onClick={handleRedact}
          title="Redact selected text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="18" height="12" rx="1" /></svg>
        </button>
      </div>

      {/* Color picker popover */}
      {showColorPicker && (
        <div
          className="mt-1.5 p-2 rounded-lg border flex items-center gap-1.5 shadow-xl select-none"
          style={{
            background: 'var(--acrobat-toolbar)',
            borderColor: 'var(--acrobat-border)'
          }}
        >
          <span className="text-[11px] font-medium mr-1" style={{ color: 'var(--acrobat-text-muted)' }}>
            {colorMode === 'highlight' ? 'Highlight:' : 'Text Color:'}
          </span>
          {QUICK_COLORS.map((c) => (
            <button
              key={c}
              className="w-5 h-5 rounded-full border border-black/20 hover:scale-110 transition-transform"
              style={{ background: c }}
              onClick={() => {
                if (colorMode === 'highlight') {
                  handleHighlight(c)
                } else {
                  setTextColor(c)
                  void handleTextColor(c)
                }
              }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={colorMode === 'highlight' ? color : textColor}
            onChange={(e) => {
              if (colorMode === 'highlight') {
                handleHighlight(e.target.value)
              } else {
                setTextColor(e.target.value)
                void handleTextColor(e.target.value)
              }
            }}
            className="w-5 h-5 p-0 border-0 rounded cursor-pointer ml-1"
            title="Custom color"
          />
        </div>
      )}
    </div>
  )
}
