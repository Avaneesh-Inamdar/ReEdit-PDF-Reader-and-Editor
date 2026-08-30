import { create } from 'zustand'

export type AnnotationTool = 'select' | 'highlight' | 'underline' | 'strike' | 'draw' | 'rect' | 'ellipse' | 'arrow' | 'note' | 'eraser' | 'redact' | 'text' | 'image'
export type AnnotationType = 'highlight' | 'underline' | 'strike' | 'draw' | 'rect' | 'ellipse' | 'arrow' | 'note' | 'redact' | 'text' | 'image'

export interface Annotation {
  id: string
  page: number
  type: AnnotationType
  // normalized 0..1 relative to page viewport at render time
  x: number
  y: number
  w: number
  h: number
  color: string
  strokeWidth: number
  opacity: number
  points?: { x: number; y: number }[] // for draw/arrow normalized
  text?: string // for note/text
  fontSize?: number // for text
  fontFamily?: string // for text: Helvetica, TimesRoman, Courier, etc (pdf-lib StandardFonts)
  bold?: boolean
  italic?: boolean
}

interface HistoryState {
  annotations: Annotation[]
  timestamp?: number
}

interface AnnotationState {
  tool: AnnotationTool
  color: string
  strokeWidth: number
  annotations: Annotation[]
  past: HistoryState[]
  future: HistoryState[]
  selectedId: string | null
  // actions
  setTool: (t: AnnotationTool) => void
  setColor: (c: string) => void
  setStrokeWidth: (n: number) => void
  addAnnotation: (a: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  deleteAnnotation: (id: string) => void
  clearPage: (page: number) => void
  clearAll: () => void
  undo: () => void
  redo: () => void
  setSelected: (id: string | null) => void
  replaceAll: (next: Annotation[]) => void
}

function pushHistory(get: () => AnnotationState, set: (s: Partial<AnnotationState>) => void): void {
  const { annotations, past } = get()
  const nextPast = [...past, { annotations: [...annotations], timestamp: Date.now() }]
  if (nextPast.length > 50) nextPast.shift()
  set({ past: nextPast, future: [] })
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  tool: 'select',
  color: '#facc15', // yellow for highlight default
  strokeWidth: 2,
  annotations: [],
  past: [],
  future: [],
  selectedId: null,
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  addAnnotation: (a) => {
    pushHistory(get, set as never)
    set({ annotations: [...get().annotations, a] })
  },
  updateAnnotation: (id, patch) => {
    set({ annotations: get().annotations.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  },
  deleteAnnotation: (id) => {
    pushHistory(get, set as never)
    set({ annotations: get().annotations.filter((x) => x.id !== id), selectedId: null })
  },
  clearPage: (page) => {
    pushHistory(get, set as never)
    set({ annotations: get().annotations.filter((x) => x.page !== page) })
  },
  clearAll: () => {
    pushHistory(get, set as never)
    set({ annotations: [] })
  },
  undo: () => {
    const { past, annotations, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ annotations: prev.annotations, past: past.slice(0, -1), future: [...future, { annotations: [...annotations] }] })
  },
  redo: () => {
    const { future, annotations, past } = get()
    if (!future.length) return
    const next = future[future.length - 1]
    set({ annotations: next.annotations, future: future.slice(0, -1), past: [...past, { annotations: [...annotations] }] })
  },
  setSelected: (selectedId) => set({ selectedId }),
  replaceAll: (annotations) => {
    pushHistory(get, set as never)
    set({ annotations })
  }
}))
