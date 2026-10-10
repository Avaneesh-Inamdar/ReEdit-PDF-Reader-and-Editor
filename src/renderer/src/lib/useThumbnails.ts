import { useEffect, useState, type RefObject } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from './rendering'

export function useThumbnails(
  pdfDoc: PDFDocumentProxy | null,
  rotation: number,
  scale: number,
  root: RefObject<HTMLDivElement | null>,
  enabled = true
): Record<number, string> {
  const [nearby, setNearby] = useState<number[]>([])
  const [images, setImages] = useState<Record<number, string>>({})
  useEffect(() => {
    setImages({})
    const container = root.current
    if (!container || !pdfDoc || !enabled) return
    const visible = new Set<number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const page = Number((entry.target as HTMLElement).dataset.thumbnail)
          if (entry.isIntersecting) visible.add(page)
          else visible.delete(page)
        })
        setNearby([...visible])
      },
      { root: container, rootMargin: '200px' }
    )
    container.querySelectorAll('[data-thumbnail]').forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [pdfDoc, enabled, root, rotation, scale])
  useEffect(() => {
    if (!pdfDoc || !enabled) return
    let cancelled = false
    const tasks: { cancel: () => void }[] = []
    const generate = async (): Promise<void> => {
      const result: Record<number, string> = {}
      for (const number of nearby) {
        if (cancelled) return
        if (images[number]) {
          result[number] = images[number]
          continue
        }
        const page = await pdfDoc.getPage(number)
        if (cancelled) return
        const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
        const canvas = document.createElement('canvas')
        const ratio = Math.max(2, window.devicePixelRatio || 1)
        canvas.width = Math.ceil(viewport.width * ratio)
        canvas.height = Math.ceil(viewport.height * ratio)
        await renderPage(async () => {
          if (cancelled) return
          const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
          tasks.push(task)
          await task.promise
        })
        if (cancelled) return
        result[number] = canvas.toDataURL('image/png')
        canvas.width = canvas.height = 0
      }
      if (!cancelled) setImages(result)
    }
    void generate().catch((error) => {
      if (!cancelled) console.warn(error)
    })
    return () => {
      cancelled = true
      tasks.forEach((task) => task.cancel())
    }
  }, [pdfDoc, nearby, rotation, scale, enabled])
  return images
}
