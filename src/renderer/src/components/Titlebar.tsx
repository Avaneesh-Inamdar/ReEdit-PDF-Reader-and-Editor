import { openTool } from '../lib/toolActions'
import { Icon } from './Icon'
import { exportWord } from '../lib/officeExport'
import { closeDocument } from '../lib/documentActions'
import { useEffect, useRef, useCallback } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { canPerformUndo, canPerformRedo } from '../lib/undoManager'
import '../assets/header-workspace.css'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
}

function MenuDropdown({
  items,
  onClose
}: {
  items: MenuItem[]
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="acrobat-menu workspace-menu-flyout" role="menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="acrobat-menu-sep" role="separator" />
        ) : (
          <button
            key={item.label}
            className="acrobat-menu-item"
            role="menuitem"
            disabled={item.disabled}
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
          </button>
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
  const menuRef = useRef<HTMLDivElement>(null)
  const focusMenu = useRef(false)
  const openAndFocus = useCallback((name: string): void => {
    if (useUIStore.getState().openMenu === name) {
      menuRef.current?.querySelector<HTMLButtonElement>(name === 'Menu'
        ? '.workspace-menu-root > .workspace-menu-group > button'
        : '.workspace-menu-flyout button:not(:disabled)')?.focus()
    } else {
      focusMenu.current = true
      setOpenMenu(name)
    }
  }, [setOpenMenu])
  useEffect(() => {
    if (!openMenu || !focusMenu.current) return
    focusMenu.current = false
    menuRef.current?.querySelector<HTMLButtonElement>(openMenu === 'Menu'
      ? '.workspace-menu-root > .workspace-menu-group > button'
      : '.workspace-menu-flyout button:not(:disabled)')?.focus()
  }, [openMenu])

  const menuKey = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement
    const menu = target.closest<HTMLElement>('[role="menu"]')
    if (!menu) return
    const flyout = menu.classList.contains('workspace-menu-flyout')
    if (event.key === 'Tab') {
      closeMenu()
      menuRef.current?.querySelector<HTMLButtonElement>('.workspace-menu-trigger')?.focus()
      return
    }
    if (event.key === 'Escape' || (event.key === 'ArrowLeft' && flyout)) {
      event.preventDefault(); event.stopPropagation()
      if (flyout) {
        const parent = menu.parentElement?.querySelector<HTMLButtonElement>(':scope > button')
        setOpenMenu('Menu'); parent?.focus()
      } else {
        closeMenu()
        menuRef.current?.querySelector<HTMLButtonElement>('.workspace-menu-trigger')?.focus()
      }
      return
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (keys.includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .filter(button => !button.disabled && button.closest('[role="menu"]') === menu)
      const current = buttons.indexOf(target.closest('button')!)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
      if (!flyout) setOpenMenu('Menu')
      buttons[index]?.focus()
    }
    if (event.key === 'ArrowRight' && !flyout) {
      event.preventDefault(); event.stopPropagation()
      openAndFocus(target.closest<HTMLButtonElement>('[data-menu-group]')?.dataset.menuGroup || 'Menu')
    }
  }

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F10' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
          useUIStore.getState().activeModal !== 'none' || document.querySelector('[aria-modal="true"], .app-dialog, .file-dialog')) return
      event.preventDefault()
      openAndFocus('Menu')
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [openAndFocus])

  useEffect(() => {
    if (!openMenu) return
    const onClick = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        closeMenu()
        menuRef.current?.querySelector<HTMLButtonElement>('.workspace-menu-trigger')?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu, closeMenu])

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
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => window.dispatchEvent(new CustomEvent('acrobat:selectAll')), disabled: !hasDoc || useUIStore.getState().activeView !== 'document' },
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
    <div className="acrobat-workspace-titlebar">
      <div ref={menuRef} className="workspace-menu-anchor" onKeyDown={menuKey}>
        <button
          className={`workspace-menu-trigger ${openMenu ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={!!openMenu}
          onClick={() => { if (openMenu) closeMenu(); else openAndFocus('Menu') }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault(); openAndFocus('Menu')
            }
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M3 4.5h12M3 9h12M3 13.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Menu</span>
        </button>
        {openMenu && (
          <div className="acrobat-menu workspace-menu-root" role="menu" aria-label="Application menu">
            {menus.map((name) => (
              <div key={name} className="workspace-menu-group" onMouseEnter={() => setOpenMenu(name)}>
                <button
                  className={`acrobat-menu-item ${openMenu === name ? 'is-open' : ''}`}
                  role="menuitem"
                  data-menu-group={name}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === name}
                  onClick={() => openAndFocus(name)}
                >
                  <span>{name}</span>
                  <Icon name="right" size={14} />
                </button>
                {openMenu === name && <MenuDropdown items={menuDefs[name]} onClose={closeMenu} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
