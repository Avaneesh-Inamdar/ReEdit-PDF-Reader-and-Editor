import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'

export function ThumbnailRail({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { currentPage, setCurrentPage, numPages, rotation } = usePdfStore()
  const [thumbs, setThumbs] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pdfDoc) {
      setThumbs([])
      return
    }
    let cancelled = false
    const gen = async (): Promise<void> => {
      const out: string[] = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) break
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 0.22, rotation })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        // @ts-ignore pdf.js render types
        await page.render({ canvasContext: ctx, viewport }).promise
        out[i - 1] = canvas.toDataURL('image/png')
        if (!cancelled) setThumbs([...out])
      }
    }
    gen()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, rotation])

  return (
    <div ref={containerRef} className="w-[160px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto overflow-x-hidden">
      <div className="p-2 flex flex-col gap-2">
        {!pdfDoc && <div className="text-xs text-zinc-500 p-4 text-center">No PDF opened<br />Ctrl+O to open</div>}
        {thumbs.map((src, idx) => {
          const pageNum = idx + 1
          const active = currentPage === pageNum
          return (
            <button
              key={pageNum}
              onClick={() => {
                setCurrentPage(pageNum)
                document.getElementById(`page-${pageNum}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`relative rounded overflow-hidden border bg-zinc-950 ${active ? 'border-red-500 ring-1 ring-red-500' : 'border-zinc-800 hover:border-zinc-700'}`}
            >
              {src ? <img src={src} alt={`page ${pageNum}`} className="w-full block" /> : <div className="h-[140px] bg-zinc-800 animate-pulse" />}
              <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded ${active ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{pageNum}</span>
            </button>
          )
        })}
        {pdfDoc && thumbs.length === 0 && <div className="text-xs text-zinc-500 p-2">Generating thumbnails… {numPages} pages</div>}
      </div>
    </div>
  )
}
