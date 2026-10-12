import { create } from 'zustand'
import type { OcrPage } from '../lib/ocrTypes'

interface OcrState {
  ocrResults: Record<number, OcrPage>
  isProcessing: boolean
  processingPage: number | null
  isCancelled: boolean
  setProcessing: (isProcessing: boolean, page: number | null) => void
  setOcrResult: (page: number, result: OcrPage) => void
  clearOcrResults: () => void
  cancelOcr: () => void
  resetCancel: () => void
}

export const useOcrStore = create<OcrState>((set) => ({
  ocrResults: {},
  isProcessing: false,
  processingPage: null,
  isCancelled: false,
  setProcessing: (isProcessing, processingPage) => set({ isProcessing, processingPage }),
  setOcrResult: (page, result) =>
    set((state) => ({ ocrResults: { ...state.ocrResults, [page]: result } })),
  clearOcrResults: () =>
    set({ ocrResults: {}, isProcessing: false, processingPage: null, isCancelled: false }),
  cancelOcr: () => set({ isCancelled: true }),
  resetCancel: () => set({ isCancelled: false })
}))
