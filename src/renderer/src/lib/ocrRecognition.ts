import type { OcrWord } from './ocrTypes'
export function mergeRecognizedWords(primary: OcrWord[], additional: OcrWord[]): OcrWord[] {
  const words = primary
    .filter((word) => word.text.trim())
    .map((word) => ({ ...word, bbox: { ...word.bbox } }))
  for (const word of additional) {
    if (!word.text.trim() || (word.confidence !== undefined && word.confidence < 25)) continue
    const b = word.bbox,
      area = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (area <= 0) continue
    const duplicate = words.findIndex((existing) => {
      const a = existing.bbox,
        intersection =
          Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
          Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
      return intersection / Math.min(area, (a.x1 - a.x0) * (a.y1 - a.y0)) > 0.65
    })
    if (duplicate < 0) words.push(word)
    // Keep the primary pass's segmentation; a sparse pass may join several words.
  }
  return words.sort((a, b) => {
    const ah = a.bbox.y1 - a.bbox.y0,
      bh = b.bbox.y1 - b.bbox.y0,
      dy = (a.bbox.y0 + a.bbox.y1 - b.bbox.y0 - b.bbox.y1) / 2
    return Math.abs(dy) < Math.min(ah, bh) * 0.5 ? a.bbox.x0 - b.bbox.x0 : dy
  })
}
// Preserve pale strokes for Tesseract's adaptive thresholding. Hard whitening
// above a fixed luminance removes faint text, punctuation and thin underlines.
export function ocrLuminance(luminance: number, min: number, max: number): number {
  if (max - min < 8) return luminance
  return Math.max(0, Math.min(255, ((luminance - min) * 255) / (max - min)))
}
