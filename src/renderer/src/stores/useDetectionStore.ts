import { create } from 'zustand'

export interface DetectionInfo {
  sampledPages?: number
  isScanned: boolean
  textChars: number
  avgCharsPerPage: number
  numFonts: number
  fonts: string[]
  metadata: Record<string, string>
  isEncrypted: boolean
  hasXfa: boolean
  hasAcroForm: boolean
  isFlat: boolean
}

interface DetectionState extends DetectionInfo {
  ocrProgress: number
  ocrText: string
  isOcrRunning: boolean
  setDetection: (d: Partial<DetectionInfo>) => void
  setOcrProgress: (n: number) => void
  setOcrText: (t: string) => void
  setOcrRunning: (b: boolean) => void
}

export const useDetectionStore = create<DetectionState>((set) => ({
  isScanned: false,
  textChars: 0,
  avgCharsPerPage: 0,
  numFonts: 0,
  fonts: [],
  metadata: {},
  isEncrypted: false,
  hasXfa: false,
  hasAcroForm: false,
  isFlat: false,
  ocrProgress: 0,
  ocrText: '',
  isOcrRunning: false,
  setDetection: (d) => set(d as never),
  setOcrProgress: (ocrProgress) => set({ ocrProgress }),
  setOcrText: (ocrText) => set({ ocrText }),
  setOcrRunning: (isOcrRunning) => set({ isOcrRunning })
}))
