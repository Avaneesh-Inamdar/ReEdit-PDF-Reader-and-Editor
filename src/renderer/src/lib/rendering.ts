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
    text = document.getPage(number).then(async page => {
      const content = await page.getTextContent()
      const annotations = await page.getAnnotations?.().catch(() => []) || []
      for (const annotation of annotations) {
        if (annotation.subtype !== 'FreeText' || !annotation.rect || !annotation.contentsObj?.str) continue
        const [left, , right, top] = annotation.rect
        const size = annotation.defaultAppearanceData?.fontSize || 12
        const name = annotation.defaultAppearanceData?.fontName || 'Helvetica'
        content.styles[name] ||= { fontFamily: name, ascent: 0.8, descent: -0.2, vertical: false }
        content.items.push(Object.assign({ str: annotation.contentsObj.str, dir: 'ltr', transform: [size, 0, 0, size, left + 4, top - size - 2], width: Math.max(1, right - left - 8), height: size, fontName: name, hasEOL: true }, { pdfAnnotationId: annotation.id, pdfAnnotationColor: annotation.defaultAppearanceData?.fontColor }))
      }
      return content
    })
    cache.set(number, text)
    if (cache.size > 24) cache.delete(cache.keys().next().value!)
    text.catch(() => cache!.delete(number))
  }
  return text
}

export function outputScale(width: number, height: number, deviceRatio: number): number {
  return Math.min(
    Math.max(2, deviceRatio || 1),
    Math.sqrt(24000000 / Math.max(1, width * height))
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
