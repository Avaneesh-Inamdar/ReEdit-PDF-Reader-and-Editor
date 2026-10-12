export interface OcrWord {
  text: string
  confidence?: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}
export interface OcrPage {
  text: string
  confidence?: number
  words: OcrWord[]
}
