import { useEffect, useState, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjsLib } from './lib/pdfjs'
import { usePdfStore } from './stores/usePdfStore'
import { useAnnotationStore } from './stores/useAnnotationStore'
import { useFormStore } from './stores/useFormStore'
import { useDetectionStore } from './stores/useDetectionStore'
import { useEditStore } from './stores/useEditStore'
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
import { bakeAnnotationsToPdf, verifyNonDestructive } from './lib/pdfEditing'
import { fillFormAndSave } from './lib/forms'
import { analyzeDocument } from './lib/detection'
import { inspectForms } from './lib/forms'
import { performUndo, performRedo } from './lib/undoManager'

function App(): React.JSX.Element {
  const { data, filePath, openFile, closeFile, setNumPages, setMetadata, setError, setLoading, setData } = usePdfStore()
  const { activeView, setActiveView, theme, activeModal, setActiveModal, setSpaceHeld, setPointerMode } = useUIStore()
  const { openTab } = useTabStore()
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const imagePickerRef = useRef<HTMLInputElement>(null)
  const prevAnnoLen = useRef(0)
  const prevDataRef = useRef<ArrayBuffer | null>(null)
  const isSavingRef = useRef(false)

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
    if (!data) {
      setPdfDoc(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        setLoading(true)
        let doc: PDFDocumentProxy
        try {
          doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
        } catch (err) {
          console.warn('pdf load failed, retry without worker', err)
          doc = await pdfjsLib.getDocument({ data: data.slice(0), disableWorker: true } as never).promise
        }
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        try {
          const md = await doc.getMetadata().catch(() => null) as unknown as { info?: Record<string,string> } | null
          const info = md?.info
          setMetadata(info?.Title || null, info?.Author || null)
        } catch {}
        // detection & forms in parallel (with their own fallback)
        analyzeDocument(data.slice(0)).then(r=>{ if(!cancelled) useDetectionStore.getState().setDetection(r) }).catch(()=>{})
        inspectForms(data.slice(0)).then(r=>{ if(!cancelled) { useFormStore.getState().setFields(r.fields); useFormStore.getState().setFlags({ hasXfa: r.hasXfa, hasAcroForm: r.hasAcroForm, isEncrypted: r.isEncrypted }) } }).catch(()=>{})
      } catch (e) {
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
    return () => { cancelled = true }
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

  const handleOpen = async (): Promise<void> => {
    const res = await window.api.openFile()
    if (res) {
      openFile(res.filePath, res.data)
      openTab(res.filePath, res.data)
      setActiveView('document')
    }
  }

  // Save logic (unchanged from original, working perfectly)
  const prepareBytesForSave = async (flatten: boolean): Promise<Uint8Array> => {
    if (!data) throw new Error('no data')
    let bytes: Uint8Array
    const annos = useAnnotationStore.getState().annotations
    const hasAnnos = annos.length > 0
    const formVals = useFormStore.getState().fields
    const hasForms = formVals.length > 0
    if (hasAnnos) {
      bytes = await bakeAnnotationsToPdf(data.slice(0), annos, [], { flatten })
    } else {
      bytes = new Uint8Array(data.slice(0))
    }
    if (hasForms) {
      const values: Record<string,string> = {}
      formVals.forEach(f=> values[f.name]= f.value)
      try {
        const filled = await fillFormAndSave(bytes.buffer.slice(0) as ArrayBuffer, values, flatten)
        bytes = filled
      } catch (e) {
        console.warn('form fill failed', e)
      }
    }
    try {
      const origU8 = new Uint8Array(data.slice(0))
      const v = await verifyNonDestructive(origU8, bytes)
      if (!v.ok) {
        console.warn('non-destructive verification failed:', v.reason)
      }
    } catch (e) {
      console.warn('verification check error', e)
    }
    return bytes
  }

  const handleSave = async (flatten: boolean): Promise<void> => {
    if (!data) return alert('No document open')
    if (!window.api) { alert('Save not available (window.api missing)'); return }
    try {
      const bytes = await prepareBytesForSave(flatten)
      const currentPath = await window.api.getCurrentPath().catch(()=> null)
      let saved: string | null = null
      if (currentPath && !flatten) {
        saved = await window.api.saveFile(bytes, filePath?.split(/[\\/]/).pop() || 'document.pdf')
      } else {
        const name = (filePath?.split(/[\\/]/).pop()?.replace('.pdf','') || 'document') + (flatten ? '-flat.pdf' : '.pdf')
        saved = await window.api.saveFileAs(bytes, name)
      }
      if (saved) {
        isSavingRef.current = true
        setData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        usePdfStore.getState().setDirty(false)
        // also mark tab clean if exists
        const tabId = useTabStore.getState().activeTabId
        if (tabId) useTabStore.getState().markClean(tabId)
      } else {
        // user cancelled save dialog – keep dirty
        console.log('Save cancelled or failed, dirty remains')
      }
    } catch (e) { alert('Save failed: ' + String(e)) }
  }

  const handleSaveAs = async (flatten: boolean): Promise<void> => {
    if (!data) return alert('No document open')
    if (!window.api) { alert('Save not available'); return }
    try {
      const bytes = await prepareBytesForSave(flatten)
      const name = (filePath?.split(/[\\/]/).pop()?.replace('.pdf','') || 'document') + (flatten ? '-flat.pdf' : '.pdf')
      const saved = await window.api.saveFileAs(bytes, name)
      if (saved) {
        isSavingRef.current = true
        setData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        usePdfStore.getState().setDirty(false)
        const tabId = useTabStore.getState().activeTabId
        if (tabId) useTabStore.getState().markClean(tabId)
      }
    } catch (e) { alert('Save As failed: ' + String(e)) }
  }

  const onImagePickedForAnnotation = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    if (!f) return
    const buf = await f.arrayBuffer()
    useEditStore.getState().setPendingImage({ bytes: new Uint8Array(buf), mime: f.type || 'image/png' })
    useAnnotationStore.getState().setTool('image')
    e.target.value = ''
  }

  // Track navigation history for Go Back/Go Forward (Adobe Guide) + dirty flag like normal readers
  const watchedPage = usePdfStore(s=> s.currentPage)
  const watchedZoom = usePdfStore(s=> s.zoom)
  const annotationsForDirty = useAnnotationStore(s=> s.annotations)
  const formFieldsForDirty = useFormStore(s=> s.fields)
  useEffect(()=> {
    if (data) useUIStore.getState().pushNavHistory(watchedPage, watchedZoom)
  }, [watchedPage, watchedZoom, data])
  // Mark dirty when annotations or data change (like PDF-XChange, Foxit) – track prev to avoid marking on open
  useEffect(()=> {
    if (!data) { prevAnnoLen.current = 0; prevDataRef.current = null; isSavingRef.current = false; return }
    if (isSavingRef.current) {
      prevDataRef.current = data
      prevAnnoLen.current = annotationsForDirty.length
      isSavingRef.current = false
      return
    }
    if (prevDataRef.current !== data) {
      const wasOpen = prevDataRef.current === null
      prevDataRef.current = data
      prevAnnoLen.current = annotationsForDirty.length
      if (!wasOpen) {
        // data changed due to page edit (insert/delete/rotate/reorder) – mark dirty
        usePdfStore.getState().setDirty(true)
        const tabId = useTabStore.getState().activeTabId
        if (tabId) useTabStore.getState().markDirty(tabId)
      }
      return
    }
    if (annotationsForDirty.length !== prevAnnoLen.current) {
      usePdfStore.getState().setDirty(true)
      const tabId = useTabStore.getState().activeTabId
      if (tabId) useTabStore.getState().markDirty(tabId)
      prevAnnoLen.current = annotationsForDirty.length
    }
  }, [annotationsForDirty, data])
  // Also mark dirty on form field edits
  useEffect(()=> {
    if (data && formFieldsForDirty.some(f=> f.value)) {
      usePdfStore.getState().setDirty(true)
      const tabId = useTabStore.getState().activeTabId
      if (tabId) useTabStore.getState().markDirty(tabId)
    }
  }, [formFieldsForDirty, data])
  // beforeunload prompt – normal readers ask Save / Don't Save / Cancel
  useEffect(()=> {
    const handler = (e: BeforeUnloadEvent): void => {
      if (usePdfStore.getState().isDirty) {
        e.preventDefault()
        // Standard browser dialog for unsaved changes
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return ()=> window.removeEventListener('beforeunload', handler)
  }, [])
  // Also handle Electron window close via Ctrl+Q / X button – main will send close, but we intercept via beforeunload
  const confirmSaveIfDirty = async (): Promise<boolean> => {
    if (!usePdfStore.getState().isDirty) return true
    const name = usePdfStore.getState().fileName || 'document.pdf'
    // Mimic Adobe/Foxit: Do you want to save changes to file? Save / Don't Save / Cancel
    // Use confirm with Save/Cancel, and second confirm for Don't Save vs Cancel
    const save = confirm(`Do you want to save changes to "${name}"?\n\nClick OK to Save (will prompt for location if needed), Cancel to Discard changes.`)
    if (save) {
      try {
        await handleSave(false)
        // After save, check if still dirty (user may have cancelled save dialog)
        if (usePdfStore.getState().isDirty) {
          // Save was cancelled (no file chosen), ask if want to stay
          const discard = confirm('Save was cancelled. Discard changes and close anyway?\nOK = Discard, Cancel = Stay')
          return discard
        }
        return true
      } catch {
        return false
      }
    } else {
      // User chose Don't Save – confirm discard
      const discard = confirm(`Discard changes to "${name}"?\nOK = Discard, Cancel = Stay`)
      return discard
    }
  }

  // IPC listeners
  useEffect(() => {
    const offOpened = window.api.onFileOpened(({ filePath: fp, data: buf }) => {
      openFile(fp, buf)
      openTab(fp, buf)
      setActiveView('document')
    })
    const offClosed = window.api.onFileClosed(async () => {
      if (usePdfStore.getState().isDirty) {
        const ok = await confirmSaveIfDirty()
        if (!ok) return
      }
      closeFile()
      setPdfDoc(null)
      usePdfStore.getState().setDirty(false)
    })
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
      else if (action === 'save') void handleSave(false)
      else if (action === 'saveAs') void handleSaveAs(false)
      else if (action === 'saveFlattened') void handleSaveAs(true)
    })

    return () => { offOpened(); offClosed(); offMenu() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts — full Adobe Acrobat keybindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

      // Spacebar hold for hand tool
      if (e.key === ' ' && !isInput && !e.repeat) {
        e.preventDefault()
        setSpaceHeld(true)
      }

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        void (async () => {
          if (!(await confirmSaveIfDirty())) return
          closeFile(); setPdfDoc(null); usePdfStore.getState().setDirty(false)
        })()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault()
        void (async () => {
          if (!(await confirmSaveIfDirty())) return
          if (window.api) window.api.close()
          else window.close()
        })()
      }

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
    const onPrint = (): void => { void window.api.print() }
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
    const types = Array.from(e.dataTransfer.types || [])
    const hasFiles = types.includes('Files')
    const isInternalMove = types.includes('text/plain') && !hasFiles
    if (isInternalMove) return
    if (hasFiles) setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent): void => { e.preventDefault(); setDragOver(false) }
  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault(); setDragOver(false)
    // Ignore internal reorder drops
    if (e.dataTransfer.getData('text/plain') && !e.dataTransfer.files?.length) return
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    const buf = await file.arrayBuffer()
    openFile(file.name, buf)
    openTab(file.name, buf)
    setActiveView('document')
  }

  // Determine what to show in main area
  const showDocView = activeView === 'document' || (activeView !== 'home' && activeView !== 'tools' && !!data)

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="h-full flex flex-col" style={{ background: 'var(--acrobat-chrome)' }}>
      <Titlebar />
      <TabBar />

      {showDocView ? (
        <>
          <Toolbar
            onOpen={handleOpen}
            onSave={() => void handleSave(false)}
            onSaveAs={() => void handleSaveAs(false)}
            onToggleSearch={() => setShowSearch((v) => !v)}
          />
          <SearchBar pdfDoc={pdfDoc} open={showSearch} onClose={() => setShowSearch(false)} />

          <div className="flex-1 min-h-0 flex">
            <NavigationPane pdfDoc={pdfDoc} />
            <PdfViewer pdfDoc={pdfDoc} />
            <RightPanel pdfDoc={pdfDoc} />
          </div>
          <StatusBar pdfDoc={pdfDoc} />
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

      {/* Modals */}
      {activeModal === 'docProperties' && <DocumentPropertiesModal />}
      {activeModal === 'signature' && <SignatureModal />}
      {activeModal === 'preferences' && <PreferencesModal />}
      {activeModal === 'organizePages' && <OrganizePagesModal />}
      {activeModal === 'about' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-card p-6 text-center" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--acrobat-accent)', display: 'grid', placeItems: 'center', margin: '0 auto 12px', color: '#fff', fontWeight: 900, fontSize: 24 }}>R</div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--acrobat-text)' }}>Readit PDF Reader and Editor</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--acrobat-text-muted)' }}>Created by Avaneesh Inamdar · v1.0.0</p>
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
              <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}>✕</button>
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
