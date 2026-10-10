import { create } from 'zustand'
import { useAnnotationStore } from './useAnnotationStore'
import { useEditStore } from './useEditStore'
import type { SearchMatch } from '../lib/pdfSearch'

const editSnapshots = new WeakMap<ArrayBuffer, {
  annotations: ReturnType<typeof useAnnotationStore.getState>
  edits: ReturnType<typeof useEditStore.getState>
}>()
function snapshot(data: ArrayBuffer): ArrayBuffer {
  const copy = data.slice(0)
  editSnapshots.set(copy, { annotations: useAnnotationStore.getState(), edits: useEditStore.getState() })
  return copy
}
function restoreEdits(data: ArrayBuffer): void {
  const edits = editSnapshots.get(data)
  if (edits) {
    useAnnotationStore.setState(edits.annotations)
    useEditStore.setState(edits.edits)
  }
}

export interface PdfState {
  filePath: string | null
  fileName: string | null
  data: ArrayBuffer | null
  numPages: number
  currentPage: number
  zoom: number
  fitMode: 'none' | 'width' | 'page'
  rotation: number
  searchQuery: string
  searchMatches: SearchMatch[]
  currentMatch: number
  isLoading: boolean
  error: string | null
  isDirty: boolean
  past: ArrayBuffer[]
  future: ArrayBuffer[]
  lastModifiedTime: number
  // metadata
  title: string | null
  author: string | null
  // actions
  openFile: (filePath: string, data: ArrayBuffer) => void
  closeFile: () => void
  setNumPages: (n: number) => void
  setCurrentPage: (n: number) => void
  setZoom: (z: number) => void
  setFitMode: (m: PdfState['fitMode']) => void
  setRotation: (r: number) => void
  setSearch: (q: string, matches?: PdfState['searchMatches']) => void
  setCurrentMatch: (i: number) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setMetadata: (title: string | null, author: string | null) => void
  setData: (data: ArrayBuffer) => void
  setDirty: (v: boolean) => void
  pushHistory: () => void
  undoPdf: () => boolean
  redoPdf: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void
}

export const usePdfStore = create<PdfState>((set, get) => ({
  filePath: null,
  fileName: null,
  data: null,
  numPages: 0,
  currentPage: 1,
  zoom: 1.25,
  fitMode: 'width',
  rotation: 0,
  searchQuery: '',
  searchMatches: [],
  currentMatch: -1,
  isLoading: false,
  error: null,
  isDirty: false,
  past: [],
  future: [],
  lastModifiedTime: 0,
  title: null,
  author: null,
  openFile: (filePath, data) =>
    set({
      filePath,
      title: null,
      author: null,
      fileName: filePath.split(/[\\/]/).pop() || filePath,
      data,
      numPages: 0,
      currentPage: 1,
      error: null,
      isLoading: true,
      isDirty: false,
      rotation: 0,
      searchQuery: '',
      searchMatches: [],
      currentMatch: -1,
      fitMode: 'width',
      past: [],
      future: [],
      lastModifiedTime: 0
    }),
  closeFile: () =>
    set({
      filePath: null,
      fileName: null,
      data: null,
      numPages: 0,
      currentPage: 1,
      error: null,
      isLoading: false,
      isDirty: false,
      title: null,
      author: null,
      past: [],
      future: [],
      lastModifiedTime: 0
    }),
  setNumPages: (numPages) => set({ numPages, isLoading: false }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoom: (zoom) => set({ zoom, fitMode: 'none' }),
  setFitMode: (fitMode) => set({ fitMode }),
  setRotation: (rotation) => set({ rotation }),
  setSearch: (searchQuery, searchMatches) => set({ searchQuery, searchMatches: searchMatches ?? [], currentMatch: (searchMatches ?? []).length ? 0 : -1 }),
  setCurrentMatch: (currentMatch) => set({ currentMatch }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setMetadata: (title, author) => set({ title, author }),
  setData: (data) => set({ data, isDirty: true }),
  setDirty: (isDirty) => set({ isDirty }),
  pushHistory: () => {
    const s = get()
    if (!s.data) return
    const nextPast = [...s.past, snapshot(s.data)]
    if (nextPast.length > 25) nextPast.shift()
    set({ past: nextPast, future: [], lastModifiedTime: Date.now() })
  },
  undoPdf: () => {
    const s = get()
    if (!s.past.length || !s.data) return false
    const prevData = s.past[s.past.length - 1]
    const nextPast = s.past.slice(0, -1)
    const nextFuture = [...s.future, snapshot(s.data)]
    set({
      data: prevData,
      past: nextPast,
      future: nextFuture,
      isDirty: true,
      lastModifiedTime: Date.now()
    })
    restoreEdits(prevData)
    import('pdf-lib').then(({ PDFDocument }) => {
      PDFDocument.load(prevData).then((doc) => {
        if (get().data === prevData) set({ numPages: doc.getPageCount(), currentPage: Math.min(get().currentPage, doc.getPageCount()) })
      }).catch(() => {})
    }).catch(() => {})
    return true
  },
  redoPdf: () => {
    const s = get()
    if (!s.future.length || !s.data) return false
    const nextData = s.future[s.future.length - 1]
    const nextFuture = s.future.slice(0, -1)
    const nextPast = [...s.past, snapshot(s.data)]
    set({
      data: nextData,
      future: nextFuture,
      past: nextPast,
      isDirty: true,
      lastModifiedTime: Date.now()
    })
    restoreEdits(nextData)
    import('pdf-lib').then(({ PDFDocument }) => {
      PDFDocument.load(nextData).then((doc) => {
        if (get().data === nextData) set({ numPages: doc.getPageCount(), currentPage: Math.min(get().currentPage, doc.getPageCount()) })
      }).catch(() => {})
    }).catch(() => {})
    return true
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  clearHistory: () => set({ past: [], future: [], lastModifiedTime: 0 })
}))
