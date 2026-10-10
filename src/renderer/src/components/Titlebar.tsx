import { openTool } from '../lib/toolActions'
import { BrandLogo } from './Icon'
import { exportWord } from '../lib/officeExport'
import { closeDocument } from '../lib/documentActions'
import { useEffect, useRef, useCallback } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { canPerformUndo, canPerformRedo } from '../lib/undoManager'

/* ── Adobe Acrobat Windows Titlebar ── */
// Red "A" logo, interactive dropdown menus (File/Edit/View/Sign/Window/Help),
// title: "[filename.pdf] - Re-Edit PDF", Windows controls.

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
  submenu?: MenuItem[]
}

function MenuDropdown({
  items,
  onClose
}: {
  items: MenuItem[]
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div ref={ref} className="acrobat-menu absolute top-full left-0 mt-0.5">
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="acrobat-menu-sep" />
        ) : (
          <div
            key={item.label}
            className="acrobat-menu-item"
            data-disabled={item.disabled ? 'true' : undefined}
            onClick={() => {
              if (!item.disabled && item.action) {
                item.action()
                onClose()
              }
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ marginLeft: 24, opacity: 0.5, fontSize: 11 }}>{item.shortcut}</span>
            )}
          </div>
        )
      )}
    </div>
  )
}

export function Titlebar(): React.JSX.Element {
  const { fileName, isDirty } = usePdfStore()
  const { openMenu, setOpenMenu, setActiveModal, setActiveView, setTheme } = useUIStore()
  const tabs = useTabStore((s) => s.tabs)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  useEffect(() => { void window.api.setDocumentTitle(fileName ? `${fileName}${isDirty ? ' •' : ''} — Re-Edit PDF` : 'Re-Edit PDF') }, [fileName, isDirty])

  const closeMenu = useCallback(() => setOpenMenu(null), [setOpenMenu])

  const hasDoc = !!usePdfStore.getState().data

  const menuDefs: Record<string, MenuItem[]> = {
    File: [
      { label: 'Convert Office document to PDF…', action: () => { void window.api.importOffice().catch(error=>alert(String(error))) } },
      { label: 'Export text to Word…', action: () => { void exportWord() }, disabled: !hasDoc },
      { label: 'Open…', shortcut: 'Ctrl+O', action: () => window.api.openFile() },
      { label: 'Close', shortcut: 'Ctrl+W', action: () => { void closeDocument() }, disabled: !hasDoc },
      { separator: true, label: '' },
      { label: 'Save', shortcut: 'Ctrl+S', action: () => window.dispatchEvent(new CustomEvent('acrobat:save')), disabled: !hasDoc },
      { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => window.dispatchEvent(new CustomEvent('acrobat:saveAs')), disabled: !hasDoc },
      { label: 'Export Flattened…', action: () => window.dispatchEvent(new CustomEvent('acrobat:saveFlattened')), disabled: !hasDoc },
      { separator: true, label: '' },
      { label: 'Print…', shortcut: 'Ctrl+P', action: () => window.dispatchEvent(new CustomEvent('acrobat:print')), disabled: !hasDoc },
      { label: 'Properties…', shortcut: 'Ctrl+D', action: () => setActiveModal('docProperties'), disabled: !hasDoc },
      { separator: true, label: '' },
      { label: 'Exit', shortcut: 'Ctrl+Q', action: () => window.api.close() }
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => window.dispatchEvent(new CustomEvent('acrobat:undo')), disabled: !canPerformUndo() },
      { label: 'Redo', shortcut: 'Ctrl+Y', action: () => window.dispatchEvent(new CustomEvent('acrobat:redo')), disabled: !canPerformRedo() },
      { separator: true, label: '' },
      { label: 'Find…', shortcut: 'Ctrl+F', action: () => window.dispatchEvent(new CustomEvent('acrobat:find')) },
      { separator: true, label: '' },
      { label: 'Preferences…', shortcut: 'Ctrl+K', action: () => setActiveModal('preferences') }
    ],
    View: [
      { label: 'Zoom In', shortcut: 'Ctrl++', action: () => window.dispatchEvent(new CustomEvent('acrobat:zoomIn')) },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => window.dispatchEvent(new CustomEvent('acrobat:zoomOut')) },
      { label: 'Actual Size', shortcut: 'Ctrl+1', action: () => usePdfStore.getState().setZoom(1) },
      { label: 'Fit Page', shortcut: 'Ctrl+0', action: () => usePdfStore.getState().setFitMode('page') },
      { label: 'Fit Width', shortcut: 'Ctrl+2', action: () => usePdfStore.getState().setFitMode('width') },
      { separator: true, label: '' },
      { label: useUIStore.getState().toolbarVisible ? 'Hide Tool Bar' : 'Show Tool Bar', action: () => useUIStore.getState().setToolbarVisible(!useUIStore.getState().toolbarVisible) },
      { separator: true, label: '' },
      { label: 'Rotate Clockwise', action: () => usePdfStore.getState().setRotation((usePdfStore.getState().rotation + 90) % 360) },
      { label: 'Rotate Counter-CW', action: () => usePdfStore.getState().setRotation((usePdfStore.getState().rotation + 270) % 360) },
      { separator: true, label: '' },
      { label: 'Full Screen', shortcut: 'Ctrl+L', action: () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(()=>{})
        else document.documentElement.requestFullscreen().catch(()=>{ useUIStore.getState().setFullScreen(true) })
      } },
      { label: 'Navigation Pane', shortcut: 'F4', action: () => useUIStore.getState().toggleLeftPane() },
      { label: 'Tools Pane', shortcut: 'Shift+F4', action: () => useUIStore.getState().toggleRightPane() },
      { separator: true, label: '' },
      { label: `Theme: Windows`, action: () => setTheme('system') },
      { label: `Theme: Dark`, action: () => setTheme('dark') },
      { label: `Theme: Light`, action: () => setTheme('light') }
    ],
    Sign: [
      { label: 'Sign with a Certificate…', action: () => { if (usePdfStore.getState().data) setActiveModal('certificate') } },
      { label: 'Add Signature…', action: () => { void openTool('sign').then(() => { if (usePdfStore.getState().data) setActiveModal('signature') }) } },
      { label: 'Fill & Sign Tools', action: () => { void openTool('sign') } }
    ],
    Window: [
      ...tabs.map((t) => ({
        label: t.fileName + (t.isDirty ? ' •' : ''),
        action: () => { setActiveTab(t.id); setActiveView('document') }
      })),
      ...(tabs.length ? [{ separator: true, label: '' } as MenuItem] : []),
      { label: 'Home', action: () => setActiveView('home') },
      { label: 'Tools', action: () => setActiveView('tools') }
    ],
    Help: [
      { label: 'Check for Updates…', action: () => setActiveModal('updates') },
      { label: 'Keyboard Shortcuts', action: () => setActiveModal('shortcuts') },
      { separator: true, label: '' },
      { label: 'About Re-Edit PDF', action: () => setActiveModal('about') }
    ]
  }

  const menus = Object.keys(menuDefs)

  return (
    <div
      className="flex items-center shrink-0 select-none"
      style={{
        height: 28,
        background: 'var(--acrobat-titlebar)',
        borderBottom: '1px solid var(--acrobat-border)',
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
    >
      {/* Adobe logo */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <BrandLogo size={24} />
      </div>

      {/* Menu bar */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {menus.map((m) => (
          <div key={m} className="relative h-full flex items-center">
            <button
              className="h-full px-3 text-xs font-medium transition-colors"
              style={{
                color: openMenu === m ? '#fff' : 'var(--acrobat-text-muted)',
                background: openMenu === m ? 'var(--acrobat-accent)' : 'transparent'
              }}
              onMouseDown={() => setOpenMenu(openMenu === m ? null : m)}
              onMouseEnter={() => {
                if (openMenu && openMenu !== m) setOpenMenu(m)
              }}
            >
              {m}
            </button>
            {openMenu === m && <MenuDropdown items={menuDefs[m]} onClose={closeMenu} />}
          </div>
        ))}
      </div>

      {/* Title */}
      <div
        className="flex-1 min-w-0 text-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-xs truncate" style={{ color: 'var(--acrobat-text-muted)' }}>
          {fileName ? `${fileName}${isDirty ? ' •' : ''} - Re-Edit PDF` : 'Re-Edit PDF'}
        </span>
      </div>


    </div>
  )
}
