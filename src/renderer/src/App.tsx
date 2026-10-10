import { editSelection } from './lib/editSelection'
import { getCurrentTextSelection } from './lib/textSelection'
import { placeImage } from './lib/imagePlacement'
import { openTool } from './lib/toolActions'
import { CombineFilesModal } from './components/CombineFilesModal'
import UpdatesModal from './components/UpdatesModal'
import CertificateModal from './components/CertificateModal'
import { exportWord } from './lib/officeExport'
import { Icon, BrandLogo } from './components/Icon'
import { useEffect, useState, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjsLib, pdfAssetOptions } from './lib/pdfjs'
import { usePdfStore } from './stores/usePdfStore'
import { useAnnotationStore } from './stores/useAnnotationStore'
import { useFormStore } from './stores/useFormStore'
import { useDetectionStore } from './stores/useDetectionStore'
import { useUIStore } from './stores/useUIStore'
import { useTabStore } from './stores/useTabStore'
import { Titlebar } from './components/Titlebar'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { NavigationPane } from './components/NavigationPane'
import { PdfViewer } from './components/PdfViewer'
import { SearchBar } from './components/SearchBar'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { HomeView } from './components/HomeView'
import { ToolsCenterView } from './components/ToolsCenterView'
import { DocumentPropertiesModal } from './components/DocumentPropertiesModal'
import { SignatureModal } from './components/SignatureModal'
import { PreferencesModal } from './components/PreferencesModal'
import { OrganizePagesModal } from './components/OrganizePagesModal'
import { printDocument } from './lib/printDocument'
import { closeDocument, saveDocument } from './lib/documentActions'
import { analyzeDocument } from './lib/detection'
import { inspectForms } from './lib/forms'
import { performUndo, performRedo } from './lib/undoManager'

function App(): React.JSX.Element {
  const { data, setNumPages, setMetadata, setError, setLoading } = usePdfStore()
  const { activeView, setActiveView, theme, isFullScreen, activeModal, setActiveModal, setSpaceHeld, setPointerMode } = useUIStore()
  const { openTab } = useTabStore()
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [printStatus, setPrintStatus] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const internalDrag = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  const imagePickerRef = useRef<HTMLInputElement>(null)

  const startupHandled = useRef(false)
  useEffect(() => {
    if (startupHandled.current) return
    startupHandled.current = true
    const preferences = useUIStore.getState()
    if (preferences.maximizeOnOpen) void window.api.isMaximized().then(maximized => { if (!maximized) void window.api.maximize() })
    if (preferences.displayOpenDialog) void window.api.openFile()
  }, [])

  // Apply theme to document
  useEffect(() => {
    if (theme === 'system') {
      const match = window.matchMedia('(prefers-color-scheme: dark)')
      document.documentElement.setAttribute('data-theme', match.matches ? 'dark' : 'light')
      const listener = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
      match.addEventListener('change', listener)
      return () => match.removeEventListener('change', listener)
    } else {
      document.documentElement.setAttribute('data-theme', theme)
      return undefined
    }
  }, [theme])

  // Load document when data changes + run detection/forms — with worker fallback for file:// black screen
  useEffect(() => {
    setPdfDoc(null)
    if (!data) {
      setPdfDoc(null)
      return
    }
    let cancelled = false
    let loadedDoc: PDFDocumentProxy | null = null
    const load = async (): Promise<void> => {
      try {
        setLoading(true)
        let doc: PDFDocumentProxy
        try {
          doc = await pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) }).promise
        } catch (err) {
          console.warn('pdf load failed, retry without worker', err)
          doc = await pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0), disableWorker: true } as never).promise
        }
        if (cancelled) { await doc.destroy(); return }
        loadedDoc = doc
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        try {
          const md = await doc.getMetadata().catch(() => null) as unknown as { info?: Record<string,string> } | null
          const info = md?.info
          if (!cancelled) setMetadata(info?.Title || null, info?.Author || null)
        } catch {}
        // detection & forms in parallel (with their own fallback)
        analyzeDocument(data, doc).then(r=>{ if(!cancelled) useDetectionStore.getState().setDetection(r) }).catch(()=>{})
        doc.getFieldObjects().then(objects => objects && Object.keys(objects).length ? inspectForms(data) : { fields: [], hasXfa: !!doc.isPureXfa, hasAcroForm: false, isEncrypted: false }).then(r=>{ if(!cancelled && useFormStore.getState().fields.length === 0) { useFormStore.getState().setFields(r.fields); useFormStore.getState().setFlags({ hasXfa: r.hasXfa, hasAcroForm: r.hasAcroForm, isEncrypted: r.isEncrypted }) } }).catch(()=>{})
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Failed to load PDF', msg)
        setError(msg)
        // Ensure user sees error, not black screen
        alert('Failed to open PDF: ' + msg + '\n\nTry File → Open again or check file is not corrupted.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; void loadedDoc?.destroy() }
  }, [data, setLoading, setNumPages, setMetadata, setError])

  // Full-screen handling (Adobe Guide p10)
  useEffect(() => {
    const onFsChange = (): void => {
      const fs = !!document.fullscreenElement
      useUIStore.getState().setFullScreen(fs)
      if (fs && useUIStore.getState().fullScreenAutoAdvance > 0) {
        const interval = useUIStore.getState().fullScreenAutoAdvance * 1000
        const id = window.setInterval(() => {
          const { currentPage, numPages } = usePdfStore.getState()
          const loop = useUIStore.getState().fullScreenLoop
          let next = currentPage + 1
          if (next > numPages) {
            if (loop) next = 1
            else { window.clearInterval(id); return }
          }
          usePdfStore.getState().setCurrentPage(next)
          document.getElementById(`page-${next}`)?.scrollIntoView({ behavior: 'smooth' })
        }, interval)
        const off = (): void => { window.clearInterval(id); document.removeEventListener('fullscreenchange', off) }
        document.addEventListener('fullscreenchange', off)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const handleOpen = async (): Promise<void> => { await window.api.openFile() }

  const handleSave = async (flatten: boolean): Promise<void> => { await saveDocument(false, flatten) }
  const handleSaveAs = async (flatten: boolean): Promise<void> => { await saveDocument(true, flatten) }

  const onImagePickedForAnnotation = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    try { await placeImage(url, 0.3) } finally { URL.revokeObjectURL(url) }
    e.target.value = ''
  }

  // Track navigation history for Go Back/Go Forward (Adobe Guide) + dirty flag like normal readers
  const watchedPage = usePdfStore(s=> s.currentPage)
  const watchedZoom = usePdfStore(s=> s.zoom)
  useEffect(() => {
    if (data) useUIStore.getState().pushNavHistory(watchedPage, watchedZoom)
  }, [watchedPage, watchedZoom, data])

  useEffect(() => {
    let closing = false
    const off = window.api.onCloseRequested(async () => {
      if (closing) return
      closing = true
      try {
        for (const tab of [...useTabStore.getState().tabs]) {
          if (!(await closeDocument(tab.id))) return
        }
        await window.api.forceClose()
      } finally { closing = false }
    })
    return off
  }, [])

  // IPC listeners
  useEffect(() => {
    const offOpened = window.api.onFileOpened(({ filePath: fp, data: buf }) => {
      openTab(fp, buf)
      setActiveView('document')
    })
    const offClosed = window.api.onFileClosed(() => { void closeDocument() })
    const offMenu = window.api.onMenuAction((action) => {
      const store = usePdfStore.getState()
      if (action === 'find') setShowSearch((v) => !v)
      else if (action === 'zoomIn') store.setZoom(Math.min(5, +(store.zoom + 0.15).toFixed(2)))
      else if (action === 'zoomOut') store.setZoom(Math.max(0.25, +(store.zoom - 0.15).toFixed(2)))
      else if (action === 'zoomReset') store.setZoom(1)
      else if (action === 'fitWidth') store.setFitMode('width')
      else if (action === 'fitPage') store.setFitMode('page')
      else if (action === 'rotateCw') store.setRotation((store.rotation + 90) % 360)
      else if (action === 'rotateCcw') store.setRotation((store.rotation + 270) % 360)
      else if (action === 'preferences') setActiveModal('preferences')
      else if (action === 'about') setActiveModal('about')
      else if (action === 'updates') setActiveModal('updates')
      else if (action === 'certificate' && usePdfStore.getState().data) setActiveModal('certificate')
      else if (action === 'exportWord') void exportWord()
      else if (action === 'importOffice') void window.api.importOffice().catch(error=>alert(String(error)))
      else if (action === 'combineFiles') setActiveModal('combineFiles')
      else if (['edit','sign','organize','ocr','forms'].includes(action)) void openTool(action as 'edit' | 'sign' | 'organize' | 'ocr' | 'forms')
      else if (action === 'editSelectedText') { const selection = getCurrentTextSelection(); if (selection) void editSelection(selection) }
      else if (action === 'docProps') setActiveModal('docProperties')
      else if (action === 'undo') { const element = document.activeElement; if (element instanceof HTMLElement && (element.matches('input, textarea') || element.isContentEditable)) document.execCommand('undo'); else performUndo() }
      else if (action === 'redo') { const element = document.activeElement; if (element instanceof HTMLElement && (element.matches('input, textarea') || element.isContentEditable)) document.execCommand('redo'); else performRedo() }
      else if (action === 'print') window.dispatchEvent(new CustomEvent('acrobat:print'))
      else if (action === 'save') void handleSave(false)
      else if (action === 'saveAs') void handleSaveAs(false)
      else if (action === 'saveFlattened') void handleSaveAs(true)
    })

    void window.api.ready()
    return () => { offOpened(); offClosed(); offMenu() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts — full Adobe Acrobat keybindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat && (e.ctrlKey || e.metaKey || e.key.startsWith('F'))) { e.preventDefault(); return }
      const active = document.activeElement as HTMLElement | null
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

      // Spacebar hold for hand tool
      if (e.key === ' ' && !isInput && !e.repeat) {
        e.preventDefault()
        setSpaceHeld(true)
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !isInput) { e.preventDefault(); const selection = getCurrentTextSelection(); if (selection) void editSelection(selection) }

      // Modal shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setActiveModal('preferences') }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setActiveModal('docProperties') }

      // File shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); void handleOpen() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !isInput) { e.preventDefault(); setShowSearch((v) => !v) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (e.shiftKey) void handleSaveAs(false); else void handleSave(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); void closeDocument() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') { e.preventDefault(); void window.api.close() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); window.dispatchEvent(new CustomEvent('acrobat:print')) }

      // Zoom – Ctrl + +/- handle factor 2 and Ctrl+0/1/2 per Adobe & open-source pdf.js viewer
      // Check both e.key and e.code for Numpad and Shift+Equal
      const isCtrl = e.ctrlKey || e.metaKey
      if (isCtrl && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || (e.key === '+' && e.shiftKey))) {
        e.preventDefault()
        const z = usePdfStore.getState().zoom
        usePdfStore.getState().setZoom(Math.min(5, +(z * 1.25).toFixed(2)))
      }
      if (isCtrl && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.key === '-')) {
        e.preventDefault()
        const z = usePdfStore.getState().zoom
        usePdfStore.getState().setZoom(Math.max(0.25, +(z / 1.25).toFixed(2)))
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); usePdfStore.getState().setFitMode('page') }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); usePdfStore.getState().setZoom(1) }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); usePdfStore.getState().setFitMode('width') }

      // F4 = toggle left pane, Shift+F4 = toggle right pane
      if (e.key === 'F4' && !e.shiftKey) { e.preventDefault(); useUIStore.getState().toggleLeftPane() }
      if (e.key === 'F4' && e.shiftKey) { e.preventDefault(); useUIStore.getState().toggleRightPane() }

      // Go Back / Forward (Adobe: browse buttons + history)
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); const h=useUIStore.getState().goBack(); if(h){ usePdfStore.getState().setCurrentPage(h.page); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) } }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); const h=useUIStore.getState().goForward(); if(h){ usePdfStore.getState().setCurrentPage(h.page); document.getElementById(`page-${h.page}`)?.scrollIntoView({behavior:'smooth'}) } }

      // Full screen Ctrl+L (Adobe) and F11
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='l') { e.preventDefault(); if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else document.documentElement.requestFullscreen().catch(()=>{}) }
      if (e.key === 'F11') { e.preventDefault(); if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else document.documentElement.requestFullscreen().catch(()=>{}) }

      // Tool shortcuts
      if (e.key.toLowerCase() === 'v' && !isInput && !e.ctrlKey) { setPointerMode('select'); useAnnotationStore.getState().setTool('select') }
      if (e.key.toLowerCase() === 'h' && !isInput && !e.ctrlKey) { setPointerMode('hand') }

      // Undo / Redo keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault()
        performUndo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) && !isInput) {
        e.preventDefault()
        performRedo()
      }

      if (e.key === 'Escape') {
        if (document.fullscreenElement) { document.exitFullscreen().catch(()=>{}); return }
        if (activeModal !== 'none') setActiveModal('none')
        else if (showSearch) setShowSearch(false)
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') setSpaceHeld(false)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch, activeModal])

  // Custom event listeners for menu/toolbar actions
  useEffect(() => {
    const onSave = (): void => { void handleSave(false) }
    const onSaveAs = (): void => { void handleSaveAs(false) }
    const onSaveFlattened = (): void => { void handleSaveAs(true) }
    const onUndo = (): void => { performUndo() }
    const onRedo = (): void => { performRedo() }
    const onFind = (): void => { setShowSearch((v) => !v) }
    const onZoomIn = (): void => { const s = usePdfStore.getState(); s.setZoom(Math.min(5, +(s.zoom + 0.15).toFixed(2))) }
    const onZoomOut = (): void => { const s = usePdfStore.getState(); s.setZoom(Math.max(0.25, +(s.zoom - 0.15).toFixed(2))) }
    const onPrint = (): void => { void printDocument(setPrintStatus) }
    const onImageReq = (): void => { imagePickerRef.current?.click() }

    window.addEventListener('acrobat:save', onSave)
    window.addEventListener('acrobat:saveAs', onSaveAs)
    window.addEventListener('acrobat:saveFlattened', onSaveFlattened)
    window.addEventListener('acrobat:undo', onUndo)
    window.addEventListener('acrobat:redo', onRedo)
    window.addEventListener('acrobat:find', onFind)
    window.addEventListener('acrobat:zoomIn', onZoomIn)
    window.addEventListener('acrobat:zoomOut', onZoomOut)
    window.addEventListener('acrobat:print', onPrint)
    window.addEventListener('pdf:requestImage' as never, onImageReq as never)

    return () => {
      window.removeEventListener('acrobat:save', onSave)
      window.removeEventListener('acrobat:saveAs', onSaveAs)
      window.removeEventListener('acrobat:saveFlattened', onSaveFlattened)
      window.removeEventListener('acrobat:undo', onUndo)
      window.removeEventListener('acrobat:redo', onRedo)
      window.removeEventListener('acrobat:find', onFind)
      window.removeEventListener('acrobat:zoomIn', onZoomIn)
      window.removeEventListener('acrobat:zoomOut', onZoomOut)
      window.removeEventListener('acrobat:print', onPrint)
      window.removeEventListener('pdf:requestImage' as never, onImageReq as never)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

    // Drag & drop – external PDFs only; ignore internal page reorder drags (like Organize modal)
  const onDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    if (internalDrag.current) { setDragOver(false); return }
    const types = Array.from(e.dataTransfer.types || [])
    const hasFiles = types.includes('Files')
    const isInternalMove = types.includes('text/plain') && !hasFiles
    if (isInternalMove) return
    const items = Array.from(e.dataTransfer.items || [])
    if (hasFiles && !types.includes('text/html') && items.some(item => item.kind === 'file' && (!item.type || item.type === 'application/pdf'))) setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent): void => { e.preventDefault(); setDragOver(false) }
  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault(); setDragOver(false)
    if (internalDrag.current) { internalDrag.current = false; return }
    // Ignore internal reorder drops
    if (e.dataTransfer.getData('text/plain') && !e.dataTransfer.files?.length) return
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    const buf = await file.arrayBuffer()
    openTab(file.name, buf)
    setActiveView('document')
  }

  // Determine what to show in main area
  const showDocView = activeView === 'document' || (activeView !== 'home' && activeView !== 'tools' && !!data)

  return (
    <div onDragStart={e => { if (!e.defaultPrevented) internalDrag.current = true }} onDragEnd={() => { internalDrag.current = false; setDragOver(false) }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="h-full flex flex-col" style={{ background: 'var(--acrobat-chrome)' }}>
      {!isFullScreen && <Titlebar />}
      {!isFullScreen && <TabBar />}

      {showDocView ? (
        <>
          {!isFullScreen && <Toolbar
            onOpen={handleOpen}
            onSave={() => void handleSave(false)}
            onSaveAs={() => void handleSaveAs(false)}
            onToggleSearch={() => setShowSearch((v) => !v)}
          />}
          <SearchBar pdfDoc={pdfDoc} open={showSearch} onClose={() => setShowSearch(false)} />

          <div className="flex-1 min-h-0 flex">
            {!isFullScreen && <NavigationPane pdfDoc={pdfDoc} />}
            <PdfViewer pdfDoc={pdfDoc} />
            {!isFullScreen && <RightPanel pdfDoc={pdfDoc} />}
          </div>
          {!isFullScreen && <StatusBar pdfDoc={pdfDoc} />}
        </>
      ) : activeView === 'tools' ? (
        <ToolsCenterView />
      ) : (
        <HomeView />
      )}

      {/* Hidden image picker for annotation images */}
      <input ref={imagePickerRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onImagePickedForAnnotation} />

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 grid place-items-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 5000 }}>
          <div className="drop-zone active pointer-events-none" style={{ background: 'var(--acrobat-chrome)' }}>
            <div className="text-sm font-medium" style={{ color: 'var(--acrobat-text)' }}>Drop PDF here</div>
            <div className="text-xs" style={{ color: 'var(--acrobat-text-muted)' }}>Release to open</div>
          </div>
        </div>
      )}

      {printStatus && <div className="modal-overlay"><div className="modal-card p-6" role="status" aria-live="polite">{printStatus}</div></div>}
      {/* Modals */}
      {activeModal === 'combineFiles' && <CombineFilesModal />}
      {activeModal === 'docProperties' && <DocumentPropertiesModal />}
      {activeModal === 'signature' && <SignatureModal />}
      {activeModal === 'preferences' && <PreferencesModal />}
      {activeModal === 'updates' && <UpdatesModal />}
      {activeModal === 'certificate' && <CertificateModal />}
      {activeModal === 'organizePages' && <OrganizePagesModal />}
      {activeModal === 'about' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-card p-6 text-center" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3"><BrandLogo size={64} /></div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--acrobat-text)' }}>Re-Edit PDF</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--acrobat-text-muted)' }}>Created by Avaneesh Inamdar · v1.4.1 · AGPL-3.0</p>
            <p className="text-xs mt-2" style={{ color: 'var(--acrobat-text-dim)' }}>
              Modern Windows PDF Reader & Editor
            </p>
            <button onClick={() => setActiveModal('none')} className="mt-4 rounded text-xs font-medium text-white px-6" style={{ height: 30, background: 'var(--acrobat-accent)' }}>Close</button>
          </div>
        </div>
      )}
      {activeModal === 'shortcuts' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-card p-5" style={{ width: 440, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: 'var(--acrobat-text)' }}>Keyboard Shortcuts</h2>
              <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}><Icon name="close" /></button>
            </div>
            <div className="space-y-1 text-xs" style={{ color: 'var(--acrobat-text)' }}>
              {[
                ['Ctrl+O', 'Open file'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save As'],
                ['Ctrl+W', 'Close tab'], ['Ctrl+Q', 'Exit'],
                ['Ctrl+F', 'Find text'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'],
                ['Ctrl+D', 'Document Properties'], ['Ctrl+K', 'Preferences'],
                ['Ctrl+0', 'Fit Page'], ['Ctrl+1', 'Actual Size'], ['Ctrl+2', 'Fit Width'],
                ['Ctrl++', 'Zoom In'], ['Ctrl+-', 'Zoom Out'],
                ['F4', 'Toggle Navigation Pane'], ['Shift+F4', 'Toggle Tools Pane'],
                ['V', 'Selection Tool'], ['H', 'Hand Tool'], ['Space (hold)', 'Temp Hand Tool'],
                ['Delete', 'Delete annotation'], ['Escape', 'Cancel / Close']
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--acrobat-border)' }}>
                  <span>{desc}</span>
                  <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--acrobat-chrome-alt)', fontSize: 10 }}>{key}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
