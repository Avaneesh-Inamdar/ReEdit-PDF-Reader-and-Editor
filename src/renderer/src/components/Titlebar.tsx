import { useEffect, useState, useRef, useCallback } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { canPerformUndo, canPerformRedo } from '../lib/undoManager'

/* ── Adobe Acrobat Windows Titlebar ── */
// Red "A" logo, interactive dropdown menus (File/Edit/View/Sign/Window/Help),
// title: "[filename.pdf] - Readit Pdf Reader (64-bit)", Windows controls.

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
  const activeTabId = useTabStore((s) => s.activeTabId)
  const closeTab = useTabStore((s) => s.closeTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    window.api.isMaximized().then(setIsMax).catch(() => {})
    const off = window.api.onMaximizeChanged(setIsMax)
    return off
  }, [])

  const closeMenu = useCallback(() => setOpenMenu(null), [setOpenMenu])

  const hasDoc = !!usePdfStore.getState().data

  const menuDefs: Record<string, MenuItem[]> = {
    File: [
      { label: 'Open…', shortcut: 'Ctrl+O', action: () => window.api.openFile() },
      { label: 'Close', shortcut: 'Ctrl+W', action: () => { if (activeTabId) closeTab(activeTabId); usePdfStore.getState().closeFile() }, disabled: !hasDoc },
      { separator: true, label: '' },
      { label: 'Save', shortcut: 'Ctrl+S', action: () => window.dispatchEvent(new CustomEvent('acrobat:save')), disabled: !hasDoc },
      { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => window.dispatchEvent(new CustomEvent('acrobat:saveAs')), disabled: !hasDoc },
      { label: 'Export Flattened…', action: () => window.dispatchEvent(new CustomEvent('acrobat:saveFlattened')), disabled: !hasDoc },
      { separator: true, label: '' },
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
      { label: 'Fit Visible', shortcut: 'Ctrl+Shift+W', action: () => usePdfStore.getState().setFitMode('width') },
      { separator: true, label: '' },
      { label: useUIStore.getState().toolbarVisible ? 'Hide Tool Bar' : 'Show Tool Bar', action: () => useUIStore.getState().setToolbarVisible(!useUIStore.getState().toolbarVisible) },
      { label: 'Status Bar', action: () => alert('Status bar at bottom shows page number box, magnification box, page size box – per Guide p8') },
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
      { label: `Theme: Classic`, action: () => setTheme('classic') },
      { label: `Theme: Dark`, action: () => setTheme('dark') },
      { label: `Theme: Light`, action: () => setTheme('light') }
    ],
    Sign: [
      { label: 'Add Signature…', action: () => setActiveModal('signature') },
      { label: 'Fill & Sign Tools', action: () => { useUIStore.getState().setRightPane('sign'); setActiveView('document') } }
    ],
    Window: [
      ...tabs.map((t) => ({
        label: t.fileName + (t.isDirty ? ' •' : ''),
        action: () => setActiveTab(t.id)
      })),
      ...(tabs.length ? [{ separator: true, label: '' } as MenuItem] : []),
      { label: 'Home', action: () => setActiveView('home') },
      { label: 'Tools', action: () => setActiveView('tools') }
    ],
    Help: [
      { label: 'Online Guide…', action: () => {
        const guide = `Adobe Acrobat Reader Online Guide\n\n`+
        `• How to use this guide – click underlined links, Go Back, Next Page, First Page, bookmarks triangle\n`+
        `• About Adobe Acrobat – Exchange, PDF Writer, Search, Distiller, Catalog\n`+
        `• The Acrobat Reader window – bookmarks/thumbnails overview, tool bar, status bar, scroll bars\n`+
        `• Status bar – window splitter, page number box (Go to Page), magnification box (Zoom To), page size box (units)\n`+
        `• Preferences – General: Default Magnification, Max Fit Visible, Display Large Images, Use Page Cache, Greek Text, Substitution Fonts, Page Units, Splash/Open/Maximize; Full-Screen: Loop, Background, Auto-advance\n`+
        `• Using links – click to follow, Go Back to return, triangle for sub-bookmarks\n`+
        `• Using notes – double-click note icon, edit, delete\n`+
        `• Displaying documents in full-screen mode – View → Full Screen, Esc to exit, Loop/Auto-advance\n`+
        `• Reading an article – follow article thread with arrow, click to jump\n`+
        `See View → Full Screen, Edit → Preferences, Window splitter at status bar left, and link overlays on pages.`
        alert(guide)
      } },
      { label: 'Keyboard Shortcuts', action: () => setActiveModal('shortcuts') },
      { separator: true, label: '' },
      { label: 'About Readit Pdf Reader', action: () => setActiveModal('about') }
    ]
  }

  const menus = Object.keys(menuDefs)

  return (
    <div
      className="flex items-center shrink-0 select-none"
      style={{
        height: 30,
        background: 'var(--acrobat-titlebar)',
        borderBottom: '1px solid var(--acrobat-border)',
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
    >
      {/* Adobe logo */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 3,
            background: 'var(--acrobat-accent)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 900,
            fontSize: 11,
            lineHeight: 1,
            fontFamily: 'Inter, sans-serif'
          }}
        >
          R
        </div>
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
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs truncate" style={{ color: 'var(--acrobat-text-muted)' }}>
          {fileName ? `${fileName}${isDirty ? ' •' : ''} - Readit Pdf Reader (64-bit)` : 'Readit Pdf Reader'}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => void window.api.minimize()}
          className="grid place-items-center hover:opacity-80"
          style={{ width: 46, height: '100%', color: 'var(--acrobat-text-muted)' }}
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          onClick={() => void window.api.maximize()}
          className="grid place-items-center hover:opacity-80"
          style={{ width: 46, height: '100%', color: 'var(--acrobat-text-muted)' }}
          title={isMax ? 'Restore Down' : 'Maximize'}
        >
          {isMax ? (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /><rect x="0" y="2" width="8" height="8" fill="var(--acrobat-titlebar)" stroke="currentColor" strokeWidth="1" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          )}
        </button>
        <button
          onClick={() => void window.api.close()}
          className="grid place-items-center transition-colors"
          style={{ width: 46, height: '100%', color: 'var(--acrobat-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e81123'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--acrobat-text-muted)'
          }}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" /><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
    </div>
  )
}
