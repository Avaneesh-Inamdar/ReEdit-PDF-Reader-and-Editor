import { createWorker } from 'tesseract.js'

let worker: Awaited<ReturnType<typeof createWorker>> | null = null

export async function getOcrWorker(onProgress?: (p:number)=>void): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (worker) return worker
  // Use absolute URL via window.location for both http (dev) and file:// (prod preview)
  // Previous '/tessdata/worker.min.js' is invalid on file:// (file:///tessdata) – needs file://E:/.../out/renderer/tessdata/...
  // out/renderer/tessdata is copied from public/tessdata via vite publicDir. See scripts/download-tessdata.js
  // Reference: tesseract.js importScripts in WorkerGlobalScope needs resolvable URL; electron needs file:// absolute.
  const base = (() => {
    try {
      if (typeof window !== 'undefined' && (window as unknown as { location: Location }).location) {
        const u = new URL('./tessdata/', (window as unknown as { location: Location }).location.href).href
        // Remove trailing slash for consistency, createWorker will append
        return u.replace(/\/$/, '')
      }
    } catch {}
    return './tessdata'
  })()
  worker = await createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/tesseract-core.wasm.js`,
    langPath: `${base}`,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress*100))
    },
    // @ts-ignore — tesseract.js options type incomplete
    cacheMethod: 'none',
    gzip: false,
  } as never)
  return worker
}

export async function runOcrOnCanvas(canvas: HTMLCanvasElement, onProgress?: (p:number)=>void): Promise<string> {
  const preprocessed = preprocessCanvasForOcr(canvas)
  const w = await getOcrWorker(onProgress)
  const { data: { text } } = await w.recognize(preprocessed)
  return text
}

export async function runOcrOnCanvasFull(canvas: HTMLCanvasElement, onProgress?: (p:number)=>void): Promise<import('tesseract.js').Page> {
  const preprocessed = preprocessCanvasForOcr(canvas)
  const w = await getOcrWorker(onProgress)
  const { data } = await w.recognize(preprocessed)
  return data
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate()
    } catch {}
    worker = null
  }
}

// Advanced OCR image preprocessing: grayscale + contrast stretch + thresholding for maximum accuracy
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const processed = document.createElement('canvas')
    processed.width = canvas.width
    processed.height = canvas.height
    const ctx = processed.getContext('2d')
    if (!ctx) return canvas

    ctx.drawImage(canvas, 0, 0)
    const imgData = ctx.getImageData(0, 0, processed.width, processed.height)
    const d = imgData.data

    let minLum = 255
    let maxLum = 0

    // 1. Grayscale luminance calculation & min/max detection
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      d[i] = lum
      if (lum < minLum) minLum = lum
      if (lum > maxLum) maxLum = lum
    }

    const range = maxLum - minLum || 1

    // 2. Contrast stretching and clean-up threshold
    for (let i = 0; i < d.length; i += 4) {
      let stretched = ((d[i] - minLum) / range) * 255
      if (stretched > 195) {
        stretched = 255
      } else if (stretched < 80) {
        stretched = Math.max(0, stretched * 0.6)
      }
      d[i] = stretched
      d[i + 1] = stretched
      d[i + 2] = stretched
    }

    ctx.putImageData(imgData, 0, 0)
    return processed
  } catch {
    return canvas
  }
}

// Bakes OCR recognized text as an invisible selectable text layer into the PDF (preserves images underneath untouched)
export async function bakeOcrToPdf(
  data: ArrayBuffer,
  ocrResults: Record<number, import('tesseract.js').Page>
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.load(data)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()

  for (const [pageStr, pageData] of Object.entries(ocrResults)) {
    const pageNum = parseInt(pageStr, 10)
    const pageIdx = pageNum - 1
    if (pageIdx < 0 || pageIdx >= pages.length || !pageData) continue

    const page = pages[pageIdx]
    const { width, height } = page.getSize()

    const words = (pageData as unknown as { words?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }).words || []
    for (const w of words) {
      if (!w.text || !w.text.trim()) continue
      const { x0, y0, y1 } = w.bbox
      const x = x0 * width
      const y = height - y1 * height
      const wordH = (y1 - y0) * height
      const fontSize = Math.max(6, Math.min(72, wordH * 0.95))

      page.drawText(w.text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.005
      })
    }
  }

  return await pdf.save()
}

// Full-doc OCR helper — iterates canvases rendered at 2x (like pdf-ocrmypdf / ocrmypdf.js)
// Returns map pageNum -> Page data
export async function ocrAllPagesCanvases(
  canvases: Map<number, HTMLCanvasElement>,
  onProgress?: (page: number, progress: number, total: number) => void
): Promise<Map<number, import('tesseract.js').Page>> {
  const out = new Map<number, import('tesseract.js').Page>()
  const entries = [...canvases.entries()].sort((a,b)=>a[0]-b[0])
  for (let i=0;i<entries.length;i++) {
    const [pageNum, canvas] = entries[i]
    const data = await runOcrOnCanvasFull(canvas, (p)=> onProgress?.(pageNum, p, entries.length))
    out.set(pageNum, data)
  }
  return out
}
