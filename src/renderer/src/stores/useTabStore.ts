import { create } from 'zustand'

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
    const { tabs } = get()
    // Check if already open
    const existing = tabs.find((t) => t.filePath === filePath && filePath)
    if (existing) {
      set({ activeTabId: existing.id })
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
  },

  setActiveTab: (activeTabId) => set({ activeTabId }),

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
