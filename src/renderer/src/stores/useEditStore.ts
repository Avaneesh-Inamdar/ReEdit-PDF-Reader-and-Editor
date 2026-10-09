import { create } from 'zustand'
import type { Annotation } from './useAnnotationStore'

export interface Redaction extends Annotation { isRedaction: true }

interface EditState {
  redactions: Annotation[]
  pendingText: { text: string; color: string; size: number } | null
  pendingImage: { bytes: Uint8Array; mime: string; dataUrl?: string; widthNorm?: number; aspectRatio?: number } | null
  addRedaction: (r: Annotation) => void
  removeRedaction: (id: string) => void
  clearRedactions: () => void
  setPendingText: (v: EditState['pendingText']) => void
  setPendingImage: (v: EditState['pendingImage']) => void
}

export const useEditStore = create<EditState>((set, get) => ({
  redactions: [],
  pendingText: null,
  pendingImage: null,
  addRedaction: (r) => set({ redactions: [...get().redactions, r] }),
  removeRedaction: (id) => set({ redactions: get().redactions.filter((x) => x.id !== id) }),
  clearRedactions: () => set({ redactions: [] }),
  setPendingText: (pendingText) => set({ pendingText }),
  setPendingImage: (pendingImage) => set({ pendingImage })
}))
