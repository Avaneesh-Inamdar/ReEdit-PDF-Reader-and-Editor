import { Icon } from './Icon'
import { useState, useEffect, useRef } from 'react'
import { exportWord } from '../lib/officeExport'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { openTool } from '../lib/toolActions'
import { canPerformUndo, canPerformRedo, performUndo, performRedo } from '../lib/undoManager'

export function Toolbar({
  onOpen,
  onSave,
  onSaveAs,
  onToggleSearch,
  toolsOpen,
  onToggleTools
}: {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleSearch: () => void
  toolsOpen: boolean
  onToggleTools: () => void
}): React.JSX.Element | null {
  const data = usePdfStore((s) => s.data)
  const { toolbarVisible, rightPane } = useUIStore()
  const [convertOpen, setConvertOpen] = useState(false)
  const convertRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (!convertRef.current?.contains(event.target as Node)) setConvertOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setConvertOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  if (!toolbarVisible) return null
  return (
    <div
      className="document-toolbar workspace-global-bar"
      role="toolbar"
      aria-label="Document actions"
    >
      <div className="workspace-workflows">
        <button
          className={`workflow-button ${toolsOpen && rightPane === 'none' ? 'active' : ''}`}
          onClick={onToggleTools}
          aria-expanded={toolsOpen}
          title="All tools"
        >
          All tools
        </button>
        <button
          className={`workflow-button ${rightPane === 'edit' ? 'active' : ''}`}
          onClick={() => void openTool('edit')}
          title="Edit PDF"
        >
          Edit
        </button>
        <div className="workspace-convert" ref={convertRef}>
          <button
            className={`workflow-button ${convertOpen ? 'active' : ''}`}
            onClick={() => setConvertOpen(!convertOpen)}
            title="Conversion tools"
            aria-haspopup="menu"
            aria-expanded={convertOpen}
          >
            Convert
          </button>
          {convertOpen && (
            <div className="document-view-menu workspace-convert-menu" role="menu">
              <button
                role="menuitem"
                disabled={!data}
                onClick={() => {
                  setConvertOpen(false)
                  void exportWord()
                }}
              >
                Export text to Word…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setConvertOpen(false)
                  void window.api.importOffice().catch((error) => alert(String(error)))
                }}
              >
                Office document to PDF…
              </button>
            </div>
          )}
        </div>
        <button
          className={`workflow-button ${rightPane === 'sign' ? 'active' : ''}`}
          onClick={() => void openTool('sign')}
          title="Fill & Sign"
        >
          Sign
        </button>
        <span className="tb-sep" />
        <button
          className="tb-btn"
          title="Undo (Ctrl+Z)"
          onClick={performUndo}
          disabled={!canPerformUndo()}
        >
          <Icon name="undo" size={19} />
        </button>
        <button
          className="tb-btn"
          title="Redo (Ctrl+Y)"
          onClick={performRedo}
          disabled={!canPerformRedo()}
        >
          <Icon name="redo" size={19} />
        </button>
      </div>
      <div className="workspace-file-actions">
        <button
          className="workspace-find"
          onClick={onToggleSearch}
          disabled={!data}
          title="Find (Ctrl+F)"
        >
          <span>Find text</span>
          <Icon name="search" size={18} />
        </button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={onOpen} title="Open (Ctrl+O)">
          <Icon name="open" size={19} />
        </button>
        <button className="tb-btn" onClick={onSave} disabled={!data} title="Save (Ctrl+S)">
          <Icon name="save" size={19} />
        </button>
        <button
          className="tb-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('acrobat:print'))}
          disabled={!data}
          title="Print (Ctrl+P)"
        >
          <Icon name="print" size={19} />
        </button>
        <button
          className="workspace-save-as"
          onClick={onSaveAs}
          disabled={!data}
          title="Save As (Ctrl+Shift+S)"
        >
          Save as
        </button>
      </div>
    </div>
  )
}
