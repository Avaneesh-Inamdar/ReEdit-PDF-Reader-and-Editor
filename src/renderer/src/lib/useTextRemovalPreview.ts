import { useEffect, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { pdfjsLib, pdfAssetOptions } from './pdfjs'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'
import { textRemovalRegions } from './textRemoval'

// Repaint actual content removal, preserving colored/vector/image backgrounds.
// Text/style changes reuse the same removal preview; only source regions matter.
export function useTextRemovalPreview(pageNumber: number): PDFPageProxy | null {
  const data = usePdfStore(state => state.data)
  const annotations = useAnnotationStore(state => state.annotations)
  const key = JSON.stringify(textRemovalRegions(annotations.filter(a => a.page === pageNumber)))
  const [preview, setPreview] = useState<PDFPageProxy | null>(null)
  useEffect(() => {
    let cancelled = false
    let document: import('pdfjs-dist').PDFDocumentProxy | undefined
    setPreview(null)
    const regions = JSON.parse(key)
    if (!data || !regions.length) return
    const timer = setTimeout(() => {
      void (async () => {
        const bytes = await window.api.removePdfContent(new Uint8Array(data.slice(0)), regions, false)
        if (cancelled) return
        document = await pdfjsLib.getDocument({ ...pdfAssetOptions(), data: new Uint8Array(bytes) }).promise
        if (!cancelled) setPreview(await document.getPage(pageNumber))
        if (cancelled) await document.destroy()
      })().catch(error => { if (!cancelled) console.error('Text removal preview failed', error) })
    }, 80)
    return () => { cancelled = true; clearTimeout(timer); void document?.destroy() }
  }, [data, pageNumber, key])
  return preview
}
