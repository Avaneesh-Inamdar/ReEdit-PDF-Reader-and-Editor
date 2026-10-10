import { useThumbnails } from '../lib/useThumbnails'
import { Icon } from './Icon'
import { useEffect, useRef } from 'react'
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
                <Icon name={item.expanded ? 'down' : 'right'} size={12} />
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
  const { leftPane, setLeftPane, leftPaneWidth, bookmarks, setBookmarks, attachments, setAttachments } = useUIStore()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setAttachments([])
    if (pdfDoc) void pdfDoc.getAttachments().then(entries => {
      if (!cancelled) setAttachments(Object.values((entries || {}) as Record<string, { filename: string; content: Uint8Array }>).map(entry => ({ name: entry.filename, size: entry.content.length, data: entry.content })))
    }).catch(error => { if (!cancelled) console.warn('Unable to read attachments', error) })
    return () => { cancelled = true }
  }, [pdfDoc, setAttachments])

  const thumbs = useThumbnails(pdfDoc, rotation, 0.3, containerRef, leftPane === 'thumbnails')

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
      icon: <Icon name="thumbnails" />
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: <Icon name="bookmark" />
    },
    {
      id: 'attachments',
      label: 'Attachments',
      icon: <Icon name="attachments" />
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
            onClick={() => setLeftPane(leftPane === t.id ? 'closed' : t.id)}
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
                  className="relative rounded overflow-hidden"
                  style={{
                    width: Math.min(leftPaneWidth - 54, 184),
                    alignSelf: 'center',
                    border: active ? '2px solid var(--acrobat-accent)' : '1px solid var(--acrobat-pane-border)',
                    background: '#fff'
                  }}
                >
                  {src ? (
                    <img draggable={false} src={src} alt={`page ${pageNum}`} className="w-full block" />
                  ) : (
                    <div style={{ aspectRatio: '612 / 792', background: 'var(--acrobat-pane-hover)' }} className="animate-pulse" />
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
            {pdfDoc && Object.keys(thumbs).length === 0 && (
              <div className="text-xs p-2" style={{ color: 'var(--acrobat-text-dim)' }}>
                Generating thumbnails… {numPages} pages
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
                  <button key={i} className="file-row text-xs w-full" title="Save attachment" onClick={() => { if (a.data) void window.api.saveAttachment(a.data, a.name).catch(error => alert('Unable to save attachment: ' + String(error))) }}>
                    <Icon name="attachments" />
                    <span className="flex-1 truncate">{a.name}</span>
                    <span style={{ color: 'var(--acrobat-text-dim)' }}>{(a.size / 1024).toFixed(1)}KB</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
