import { useThumbnails } from '../lib/useThumbnails'
import { destinationPage } from '../lib/pdfDestination'
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
  const goToBookmark = (page: number): void => {
    if (page <= 0) return
    usePdfStore.getState().setCurrentPage(page)
    document.getElementById(`page-${page}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {items.map((item, i) => (
        <div key={`${item.title}-${i}`}>
          <div
            className="bm-item"
            role="link"
            tabIndex={item.pageNumber > 0 ? 0 : -1}
            onClick={() => goToBookmark(item.pageNumber)}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault()
                goToBookmark(item.pageNumber)
              }
            }}
          >
            {item.children.length > 0 && (
              <button
                className="tb-btn"
                aria-label={`${item.expanded ? 'Collapse' : 'Expand'} ${item.title}`}
                aria-expanded={item.expanded}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleBookmark([...path, i])
                }}
                style={{ width: 16, height: 16, minWidth: 16, fontSize: 10, padding: 0 }}
              >
                <Icon name={item.expanded ? 'down' : 'right'} size={12} />
              </button>
            )}
            <span className="truncate flex-1" style={{ fontSize: 12 }}>
              {item.title}
            </span>
            <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)', flexShrink: 0 }}>
              {item.pageNumber > 0 ? `p.${item.pageNumber}` : ''}
            </span>
          </div>
          {item.expanded && item.children.length > 0 && (
            <BookmarkTree items={item.children} depth={depth + 1} path={[...path, i]} />
          )}
        </div>
      ))}
    </div>
  )
}

export function NavigationPane({
  pdfDoc
}: {
  pdfDoc: PDFDocumentProxy | null
}): React.JSX.Element | null {
  const { currentPage, setCurrentPage, numPages, rotation } = usePdfStore()
  const {
    leftPane,
    setLeftPane,
    leftPaneWidth,
    bookmarks,
    setBookmarks,
    attachments,
    setAttachments
  } = useUIStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const stopResize = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => stopResize.current?.(), [])

  useEffect(() => {
    let cancelled = false
    setAttachments([])
    if (pdfDoc)
      void pdfDoc
        .getAttachments()
        .then((entries) => {
          if (!cancelled)
            setAttachments(
              Object.values(
                (entries || {}) as Record<string, { filename: string; content: Uint8Array }>
              ).map((entry) => ({
                name: entry.filename,
                size: entry.content.length,
                data: entry.content
              }))
            )
        })
        .catch((error) => {
          if (!cancelled) console.warn('Unable to read attachments', error)
        })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, setAttachments])

  const thumbs = useThumbnails(pdfDoc, rotation, 0.3, containerRef, leftPane === 'thumbnails')

  // Extract bookmarks / outline
  useEffect(() => {
    if (!pdfDoc) {
      setBookmarks([])
      return
    }
    let cancelled = false
    setBookmarks([])
    const extract = async (): Promise<void> => {
      try {
        const outline = await (
          pdfDoc as unknown as { getOutline: () => Promise<unknown[]> }
        ).getOutline()
        if (cancelled || !outline) return
        const convertItems = async (items: unknown[]): Promise<BookmarkItem[]> => {
          const result: BookmarkItem[] = []
          for (const item of items) {
            const it = item as { title: string; dest: unknown; items?: unknown[] }
            let pageNumber = 0
            try {
              if (it.dest) {
                pageNumber = (await destinationPage(pdfDoc, it.dest)) || 0
              }
            } catch {
              // An invalid destination leaves this bookmark without a page link.
            }
            const children = it.items ? await convertItems(it.items) : []
            result.push({ title: it.title || 'Untitled', pageNumber, children, expanded: false })
          }
          return result
        }
        const bms = await convertItems(outline)
        if (!cancelled) setBookmarks(bms)
      } catch {
        // A malformed outline should not prevent the document from opening.
      }
    }
    extract()
    return () => {
      cancelled = true
    }
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
      className="workspace-navigation-pane flex shrink-0 overflow-hidden"
      style={{
        width: leftPaneWidth,
        borderLeft: '1px solid var(--acrobat-pane-border)',
        background: 'var(--acrobat-pane-bg)'
      }}
    >
      <div
        className="navigation-pane-resize"
        title="Drag to adjust navigation width"
        onPointerDown={(event) => {
          event.preventDefault()
          stopResize.current?.()
          const startX = event.clientX,
            startWidth = leftPaneWidth
          const move = (e: PointerEvent): void =>
            useUIStore
              .getState()
              .setLeftPaneWidth(Math.max(160, Math.min(420, startWidth + startX - e.clientX)))
          const stop = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', stop)
          }
          stopResize.current = stop
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', stop)
          window.addEventListener('pointercancel', stop)
        }}
      />
      {/* Pane tabs */}
      <div
        className="navigation-pane-tabs flex items-center py-1 shrink-0"
        style={{
          borderBottom: '1px solid var(--acrobat-pane-border)',
          background: 'var(--acrobat-pane-bg)'
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tb-btn ${leftPane === t.id ? 'active' : ''}`}
            style={{ width: 32, height: 32, marginBottom: 2 }}
            onClick={() => setLeftPane(leftPane === t.id ? 'closed' : t.id)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={leftPane === t.id}
          >
            {t.icon}
          </button>
        ))}
        <span className="flex-1" />
        <button
          className="tb-btn"
          title="Close navigation pane"
          aria-label="Close navigation pane"
          onClick={() => setLeftPane('closed')}
        >
          <Icon name="close" />
        </button>
      </div>

      {/* Content area */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ color: 'var(--acrobat-pane-text)' }}
      >
        {/* Thumbnails */}
        {leftPane === 'thumbnails' && (
          <div className="p-2 flex flex-col gap-2">
            {!pdfDoc && (
              <div className="text-xs p-3 text-center" style={{ color: 'var(--acrobat-text-dim)' }}>
                No PDF opened
              </div>
            )}
            {Array.from({ length: numPages }, (_, idx) => {
              const src = thumbs[idx + 1]
              const pageNum = idx + 1
              const active = currentPage === pageNum
              return (
                <button
                  key={pageNum}
                  data-thumbnail={pageNum}
                  onClick={() => {
                    setCurrentPage(pageNum)
                    document
                      .getElementById(`page-${pageNum}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="relative rounded overflow-hidden"
                  style={{
                    width: Math.min(leftPaneWidth - 54, 184),
                    alignSelf: 'center',
                    border: active
                      ? '2px solid var(--acrobat-accent)'
                      : '1px solid var(--acrobat-pane-border)',
                    background: '#fff'
                  }}
                >
                  {src ? (
                    <img
                      draggable={false}
                      src={src}
                      alt={`page ${pageNum}`}
                      className="w-full block"
                    />
                  ) : (
                    <div
                      style={{ aspectRatio: '612 / 792', background: 'var(--acrobat-pane-hover)' }}
                      className="animate-pulse"
                    />
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
              <div
                className="text-center text-xs py-6"
                style={{ color: 'var(--acrobat-text-dim)' }}
              >
                No attachments in this document
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <button
                    key={i}
                    className="file-row text-xs w-full"
                    title="Save attachment"
                    onClick={() => {
                      if (a.data)
                        void window.api
                          .saveAttachment(a.data, a.name)
                          .catch((error) => alert('Unable to save attachment: ' + String(error)))
                    }}
                  >
                    <Icon name="attachments" />
                    <span className="flex-1 truncate">{a.name}</span>
                    <span style={{ color: 'var(--acrobat-text-dim)' }}>
                      {(a.size / 1024).toFixed(1)}KB
                    </span>
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
