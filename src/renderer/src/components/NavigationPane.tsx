import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore, type BookmarkItem } from '../stores/useUIStore'

/* ── Acrobat Left Navigation Pane ── */
// Icon strip tabs: Thumbnails, Bookmarks, Attachments
// Collapsible via F4, resizable width

function BookmarkTree({
  items,
  depth,
  path
}: {
  items: BookmarkItem[]
  depth: number
  path: number[]
}): React.JSX.Element {
  const { toggleBookmark } = useUIStore()
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {items.map((item, i) => (
        <div key={`${item.title}-${i}`}>
          <div
            className="bm-item"
            onClick={() => {
              const pg = item.pageNumber
              if (pg > 0) {
                usePdfStore.getState().setCurrentPage(pg)
                document.getElementById(`page-${pg}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            }}
          >
            {item.children.length > 0 && (
              <button
                className="tb-btn"
                onClick={(e) => { e.stopPropagation(); toggleBookmark([...path, i]) }}
                style={{ width: 16, height: 16, minWidth: 16, fontSize: 10, padding: 0 }}
              >
                {item.expanded ? '▾' : '▸'}
              </button>
            )}
            <span className="truncate flex-1" style={{ fontSize: 12 }}>{item.title}</span>
            <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)', flexShrink: 0 }}>{item.pageNumber > 0 ? `p.${item.pageNumber}` : ''}</span>
          </div>
          {item.expanded && item.children.length > 0 && (
            <BookmarkTree items={item.children} depth={depth + 1} path={[...path, i]} />
          )}
        </div>
      ))}
    </div>
  )
}

export function NavigationPane({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element | null {
  const { currentPage, setCurrentPage, numPages, rotation } = usePdfStore()
  const { leftPane, setLeftPane, leftPaneWidth, thumbnailScale, setThumbnailScale, bookmarks, setBookmarks, attachments, setAttachments: _setAttachments } = useUIStore()
  const [thumbs, setThumbs] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Generate thumbnails
  useEffect(() => {
    if (!pdfDoc) { setThumbs([]); return }
    let cancelled = false
    const gen = async (): Promise<void> => {
      const out: string[] = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) break
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: thumbnailScale, rotation })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        // @ts-ignore
        await page.render({ canvasContext: ctx, viewport }).promise
        out[i - 1] = canvas.toDataURL('image/png')
        if (!cancelled) setThumbs([...out])
      }
    }
    gen()
    return () => { cancelled = true }
  }, [pdfDoc, rotation, thumbnailScale])

  // Extract bookmarks / outline
  useEffect(() => {
    if (!pdfDoc) { setBookmarks([]); return }
    let cancelled = false
    const extract = async (): Promise<void> => {
      try {
        const outline = await (pdfDoc as unknown as { getOutline: () => Promise<unknown[]> }).getOutline()
        if (cancelled || !outline) return
        const convertItems = async (items: unknown[]): Promise<BookmarkItem[]> => {
          const result: BookmarkItem[] = []
          for (const item of items) {
            const it = item as { title: string; dest: unknown; items?: unknown[] }
            let pageNumber = 0
            try {
              if (it.dest) {
                const dest = Array.isArray(it.dest) ? it.dest : await (pdfDoc as unknown as { getDestination: (d: unknown) => Promise<unknown[]> }).getDestination(it.dest)
                if (dest && dest[0]) {
                  const pgIdx = await (pdfDoc as unknown as { getPageIndex: (r: unknown) => Promise<number> }).getPageIndex(dest[0])
                  pageNumber = pgIdx + 1
                }
              }
            } catch {}
            const children = it.items ? await convertItems(it.items) : []
            result.push({ title: it.title || 'Untitled', pageNumber, children, expanded: false })
          }
          return result
        }
        const bms = await convertItems(outline)
        if (!cancelled) setBookmarks(bms)
      } catch {}
    }
    extract()
    return () => { cancelled = true }
  }, [pdfDoc, setBookmarks])

  if (leftPane === 'closed') return null

  const tabs: { id: typeof leftPane; icon: React.ReactNode; label: string }[] = [
    {
      id: 'thumbnails',
      label: 'Page Thumbnails',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /></svg>
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
    },
    {
      id: 'attachments',
      label: 'Attachments',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
    }
  ]

  return (
    <div
      ref={containerRef}
      className="flex shrink-0 overflow-hidden"
      style={{
        width: leftPaneWidth,
        borderRight: '1px solid var(--acrobat-pane-border)',
        background: 'var(--acrobat-pane-bg)'
      }}
    >
      {/* Icon strip */}
      <div
        className="flex flex-col items-center py-1 shrink-0"
        style={{
          width: 36,
          borderRight: '1px solid var(--acrobat-pane-border)',
          background: 'var(--acrobat-chrome-alt)'
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tb-btn ${leftPane === t.id ? 'active' : ''}`}
            style={{ width: 32, height: 32, marginBottom: 2 }}
            onClick={() => setLeftPane(t.id as typeof leftPane)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ color: 'var(--acrobat-pane-text)' }}>
        {/* Thumbnails */}
        {leftPane === 'thumbnails' && (
          <div className="p-2 flex flex-col gap-2">
            {!pdfDoc && <div className="text-xs p-3 text-center" style={{ color: 'var(--acrobat-text-dim)' }}>No PDF opened</div>}
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
                  className="relative rounded overflow-hidden"
                  style={{
                    border: active ? '2px solid var(--acrobat-accent)' : '1px solid var(--acrobat-pane-border)',
                    background: '#fff'
                  }}
                >
                  {src ? (
                    <img src={src} alt={`page ${pageNum}`} className="w-full block" />
                  ) : (
                    <div style={{ height: 140, background: 'var(--acrobat-pane-hover)' }} className="animate-pulse" />
                  )}
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: active ? 'var(--acrobat-accent)' : 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      fontSize: 10
                    }}
                  >
                    {pageNum}
                  </span>
                </button>
              )
            })}
            {pdfDoc && thumbs.length === 0 && (
              <div className="text-xs p-2" style={{ color: 'var(--acrobat-text-dim)' }}>
                Generating thumbnails… {numPages} pages
              </div>
            )}
            {/* Thumbnail size slider */}
            {pdfDoc && (
              <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>Size:</span>
                <input
                  type="range"
                  min="0.12"
                  max="0.4"
                  step="0.02"
                  value={thumbnailScale}
                  onChange={(e) => setThumbnailScale(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--acrobat-accent)' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Bookmarks */}
        {leftPane === 'bookmarks' && (
          <div className="py-2">
            {bookmarks.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>
                No bookmarks in this document
              </div>
            ) : (
              <BookmarkTree items={bookmarks} depth={0} path={[]} />
            )}
          </div>
        )}

        {/* Attachments */}
        {leftPane === 'attachments' && (
          <div className="p-3">
            {attachments.length === 0 ? (
              <div className="text-center text-xs py-6" style={{ color: 'var(--acrobat-text-dim)' }}>
                No attachments in this document
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="file-row text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    <span className="flex-1 truncate">{a.name}</span>
                    <span style={{ color: 'var(--acrobat-text-dim)' }}>{(a.size / 1024).toFixed(1)}KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
