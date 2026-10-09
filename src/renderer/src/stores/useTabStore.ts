import { useUIStore } from './useUIStore'
import { create } from 'zustand'
import { captureSession, restoreSession, restoringSession, type DocumentSession } from '../lib/documentSession'
import { usePdfStore } from './usePdfStore'
import { useOcrStore } from './useOcrStore'

export interface DocTab {
  id: string
  fileName: string
  filePath: string | null
  data: ArrayBuffer
  isDirty: boolean
  zoom: number
  rotation: number
  currentPage: number
  scrollTop: number
  session?: DocumentSession
}

interface TabState {
  tabs: DocTab[]
  activeTabId: string | null // null means home or tools view

  openTab: (filePath: string, data: ArrayBuffer) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  updateTab: (id: string, patch: Partial<DocTab>) => void
  markDirty: (id: string) => void
  markClean: (id: string) => void
  getActiveTab: () => DocTab | null
}

let tabCounter = 0
function nextTabId(): string {
  return `tab-${++tabCounter}-${Date.now()}`
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (filePath, data) => {
    if (useOcrStore.getState().isProcessing) return get().activeTabId || ''
    const active = get().activeTabId
    if (active) get().updateTab(active, { session: captureSession(), data: usePdfStore.getState().data!, isDirty: usePdfStore.getState().isDirty })
    const { tabs } = get()
    // Check if already open
    const existing = tabs.find((t) => t.filePath === filePath && filePath)
    if (existing) {
      get().setActiveTab(existing.id)
      return existing.id
    }
    const id = nextTabId()
    const fileName = filePath.split(/[\\/]/).pop() || 'Untitled.pdf'
    const tab: DocTab = {
      id,
      fileName,
      filePath,
      data,
      isDirty: false,
      zoom: 1.25,
      rotation: 0,
      currentPage: 1,
      scrollTop: 0
    }
    set({ tabs: [...tabs, tab], activeTabId: id })
    restoreSession()
    usePdfStore.getState().openFile(filePath, data)
    const magnification = useUIStore.getState().defaultMagnification
    if (magnification === 'Fit Page') usePdfStore.getState().setFitMode('page')
    else if (magnification === 'Fit Width') usePdfStore.getState().setFitMode('width')
    else usePdfStore.getState().setZoom(Math.max(0.25, Math.min(5, parseInt(magnification, 10) / 100 || 1)))
    return id
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    const filtered = tabs.filter((t) => t.id !== id)
    let newActive = activeTabId
    if (activeTabId === id) {
      if (filtered.length > 0) {
        // Activate neighbor
        newActive = filtered[Math.min(idx, filtered.length - 1)].id
      } else {
        newActive = null
      }
    }
    set({ tabs: filtered, activeTabId: newActive })
    if (activeTabId === id) {
      const next = filtered.find(tab => tab.id === newActive)
      restoreSession(next?.session)
      if (next && !next.session) usePdfStore.getState().openFile(next.filePath || next.fileName, next.data)
    }
  },

  setActiveTab: (activeTabId) => {
    if (activeTabId === get().activeTabId || useOcrStore.getState().isProcessing) return
    const current = get().activeTabId
    if (current) get().updateTab(current, { session: captureSession(), data: usePdfStore.getState().data!, isDirty: usePdfStore.getState().isDirty })
    const tab = get().tabs.find(t => t.id === activeTabId)
    if (!tab) return
    set({ activeTabId })
    restoreSession(tab.session)
    if (!tab.session) usePdfStore.getState().openFile(tab.filePath || tab.fileName, tab.data)
  },

  updateTab: (id, patch) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  },

  markDirty: (id) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, isDirty: true } : t)) })
  },

  markClean: (id) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)) })
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) || null
  }
}))

usePdfStore.subscribe((state, previous) => {
  if (restoringSession || state.isDirty === previous.isDirty) return
  const id = useTabStore.getState().activeTabId
  if (id) useTabStore.getState().updateTab(id, { isDirty: state.isDirty })
})
