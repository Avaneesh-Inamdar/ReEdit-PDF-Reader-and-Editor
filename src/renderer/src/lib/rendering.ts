import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'

// Cache parsed text for a small working set rather than re-extracting it on every zoom.
const texts = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextContent>>>()
export function pageText(document: PDFDocumentProxy, number: number): Promise<TextContent> {
  let cache = texts.get(document)
  if (!cache) {
    cache = new Map()
    texts.set(document, cache)
  }
  let text = cache.get(number)
  if (!text) {
    text = document.getPage(number).then((page) => page.getTextContent())
    cache.set(number, text)
    if (cache.size > 24) cache.delete(cache.keys().next().value!)
    text.catch(() => cache!.delete(number))
  }
  return text
}

export function outputScale(width: number, height: number, deviceRatio: number): number {
  return Math.min(
    Math.max(1.5, deviceRatio || 1),
    Math.sqrt(12000000 / Math.max(1, width * height))
  )
}

let active = 0
const waiting: (() => void)[] = []
export async function renderPage<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await job()
  } finally {
    active--
    waiting.shift()?.()
  }
}
