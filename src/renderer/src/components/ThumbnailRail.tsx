import { useThumbnails } from '../lib/useThumbnails'
import { useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'

export function ThumbnailRail({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { currentPage, setCurrentPage, numPages, rotation } = usePdfStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const thumbs = useThumbnails(pdfDoc, rotation, 0.22, containerRef)

  return (
    <div ref={containerRef} className="w-[160px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto overflow-x-hidden">
      <div className="p-2 flex flex-col gap-2">
        {!pdfDoc && <div className="text-xs text-zinc-500 p-4 text-center">No PDF opened<br />Ctrl+O to open</div>}
        {Array.from({ length: numPages }, (_, idx) => {
              const src = thumbs[idx+1]
          const pageNum = idx + 1
          const active = currentPage === pageNum
          return (
            <button
              key={pageNum}
                  data-thumbnail={pageNum}
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
        {pdfDoc && Object.keys(thumbs).length === 0 && <div className="text-xs text-zinc-500 p-2">Generating thumbnails… {numPages} pages</div>}
      </div>
    </div>
  )
}
