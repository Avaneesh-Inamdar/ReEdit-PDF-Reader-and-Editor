import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { useUIStore } from '../stores/useUIStore'
import { useAnnotationStore, type AnnotationTool } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import {
  applyHighlightToSelection,
  applyUnderlineSelection,
  applyStrikeSelection,
  applyTextColorToSelection
} from '../lib/textSelection'
import { openTool } from '../lib/toolActions'

export function QuickTools(): React.JSX.Element | null {
  const { tool, setTool, color, setColor, strokeWidth, setStrokeWidth, clearAll, annotations } =
    useAnnotationStore()
  const { pointerMode, setPointerMode, toolbarVisible } = useUIStore()
  const data = usePdfStore((s) => s.data)
  const [more, setMore] = useState(false)
  if (!toolbarVisible) return null
  const choose = (value: AnnotationTool): void => {
    setPointerMode('select')
    setTool(tool === value ? 'select' : value)
  }
  const mark = (value: 'highlight' | 'underline' | 'strike', shade: string): void => {
    const applied =
      value === 'highlight'
        ? applyHighlightToSelection(shade)
        : value === 'underline'
          ? applyUnderlineSelection(shade)
          : applyStrikeSelection(shade)
    if (!applied) {
      choose(value)
      setColor(shade)
    }
  }
  const extras: { tool: AnnotationTool; icon: IconName; label: string }[] = [
    { tool: 'underline', icon: 'underline', label: 'Underline' },
    { tool: 'strike', icon: 'strike', label: 'Strikethrough' },
    { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
    { tool: 'rect', icon: 'rectangle', label: 'Rectangle' },
    { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
    { tool: 'arrow', icon: 'arrow', label: 'Arrow' }
  ]
  return (
    <div className="workspace-quick-tools" role="toolbar" aria-label="Quick tools">
      <button
        className={`tb-btn ${tool === 'select' && pointerMode === 'select' ? 'active' : ''}`}
        title="Select Text tool (V) – select text to Copy"
        onClick={() => {
          setPointerMode('select')
          setTool('select')
        }}
      >
        <Icon name="select" size={21} />
      </button>
      <button
        className={`tb-btn ${pointerMode === 'selectGraphics' ? 'active' : ''}`}
        title="Select placed images and annotations"
        onClick={() => {
          setPointerMode('selectGraphics')
          setTool('select')
        }}
      >
        <Icon name="image" size={21} />
      </button>
      <button
        className={`tb-btn ${pointerMode === 'hand' ? 'active' : ''}`}
        title="Hand Tool (H) – drag to move page"
        onClick={() => {
          setPointerMode('hand')
          setTool('select')
        }}
      >
        <Icon name="hand" size={21} />
      </button>
      <div className="quick-tools-divider" />
      <button
        className={`tb-btn ${tool === 'highlight' ? 'active' : ''}`}
        disabled={!data}
        title="Highlight Text"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => mark('highlight', '#ffee58')}
      >
        <Icon name="highlight" size={21} />
      </button>
      <button
        className={`tb-btn ${tool === 'draw' ? 'active' : ''}`}
        disabled={!data}
        title="Freehand Draw"
        onClick={() => choose('draw')}
      >
        <Icon name="draw" size={21} />
      </button>
      <button
        className={`tb-btn ${tool === 'text' ? 'active' : ''}`}
        disabled={!data}
        title="Add Text Comment"
        onClick={() => choose('text')}
      >
        <Icon name="text" size={21} />
      </button>
      <button className="tb-btn" title="Add signature" onClick={() => void openTool('sign')}>
        <Icon name="sign" size={21} />
      </button>
      <button
        className={`tb-btn ${more ? 'active' : ''}`}
        title="More quick tools"
        aria-label="More quick tools and shapes"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        <span className="quick-tools-more">···</span>
      </button>
      {more && (
        <div className="quick-tools-popover" role="toolbar" aria-label="More quick tools">
          {extras.map((item) => (
            <button
              key={item.tool}
              className="quick-tool-option"
              title={item.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (item.tool === 'underline' || item.tool === 'strike')
                  mark(item.tool, item.tool === 'underline' ? '#66bb6a' : '#ef5350')
                else choose(item.tool)
                setMore(false)
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="acrobat-menu-sep" />
          <button
            className="quick-tool-option"
            disabled={!annotations.length}
            onClick={() => {
              if (confirm('Clear all annotations?')) {
                clearAll()
                setMore(false)
              }
            }}
          >
            <Icon name="delete" size={18} />
            <span>Clear all annotations</span>
          </button>
        </div>
      )}
      {tool !== 'select' && (
        <div className="quick-tools-format" aria-label="Annotation appearance">
          <span>Appearance</span>
          <input
            type="color"
            value={color}
            title="Custom color"
            onChange={(e) => {
              setColor(e.target.value)
              if (tool === 'highlight') applyHighlightToSelection(e.target.value)
              else if (tool === 'underline') applyUnderlineSelection(e.target.value)
              else if (tool === 'strike') applyStrikeSelection(e.target.value)
              else void applyTextColorToSelection(e.target.value)
            }}
          />
          <select
            value={strokeWidth}
            aria-label="Stroke width"
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          >
            {[1, 2, 3, 5, 8].map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
