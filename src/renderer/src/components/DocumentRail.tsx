import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'
import { openTool } from '../lib/toolActions'

export function DocumentRail(): React.JSX.Element {
  const {
    currentPage,
    numPages,
    setCurrentPage,
    zoom,
    setZoom,
    setFitMode,
    data,
    rotation,
    setRotation
  } = usePdfStore()
  const { leftPane, setLeftPane, displayMode, setDisplayMode } = useUIStore()
  const [page, setPage] = useState(String(currentPage))
  const [viewOpen, setViewOpen] = useState(false)
  useEffect(() => setPage(String(currentPage)), [currentPage])
  const go = (value: number): void => {
    if (!Number.isInteger(value) || value < 1 || value > numPages) {
      setPage(String(currentPage))
      return
    }
    setCurrentPage(value)
    document.getElementById(`page-${value}`)?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <aside className="workspace-document-rail" aria-label="Document navigation">
      <div className="document-rail-top">
        <button className="tb-btn" title="Comment" onClick={() => void openTool('comment')}>
          <Icon name="comment" size={20} />
        </button>
        <button
          className={`tb-btn ${leftPane === 'bookmarks' ? 'active' : ''}`}
          title="Bookmarks and Page – show bookmarks"
          onClick={() => setLeftPane(leftPane === 'bookmarks' ? 'closed' : 'bookmarks')}
        >
          <Icon name="bookmark" size={20} />
        </button>
        <button
          className={`tb-btn ${leftPane === 'thumbnails' ? 'active' : ''}`}
          title="Toggle navigation sidebar (F4)"
          aria-label="Toggle navigation sidebar"
          aria-expanded={leftPane !== 'closed'}
          onClick={() => useUIStore.getState().toggleLeftPane()}
        >
          <Icon name="thumbnails" size={20} />
        </button>
        <button
          className={`tb-btn ${leftPane === 'attachments' ? 'active' : ''}`}
          title="Attachments"
          onClick={() => setLeftPane(leftPane === 'attachments' ? 'closed' : 'attachments')}
        >
          <Icon name="attachments" size={20} />
        </button>
      </div>
      <div className="document-rail-bottom">
        <div className="document-view-menu-anchor">
          <button
            className={`tb-btn ${viewOpen ? 'active' : ''}`}
            title="Page display options"
            aria-expanded={viewOpen}
            onClick={() => setViewOpen(!viewOpen)}
          >
            <Icon name="pages" size={20} />
          </button>
          {viewOpen && (
            <div
              className="document-view-menu"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setViewOpen(false)
              }}
            >
              <button
                onClick={() => {
                  setFitMode('page')
                  setViewOpen(false)
                }}
              >
                Fit page
              </button>
              <button
                onClick={() => {
                  setFitMode('width')
                  setViewOpen(false)
                }}
              >
                Fit width
              </button>
              <button
                onClick={() => {
                  setZoom(1)
                  setViewOpen(false)
                }}
              >
                Actual size
              </button>
              <div className="acrobat-menu-sep" />
              <button
                aria-pressed={displayMode === 'continuous'}
                onClick={() => {
                  setDisplayMode('continuous')
                  setViewOpen(false)
                }}
              >
                Continuous scrolling
              </button>
              <button
                aria-pressed={displayMode === 'single'}
                onClick={() => {
                  setDisplayMode('single')
                  setViewOpen(false)
                }}
              >
                Single page
              </button>
              <button
                onClick={() => {
                  setRotation((rotation + 90) % 360)
                  setViewOpen(false)
                }}
              >
                Rotate clockwise
              </button>
            </div>
          )}
        </div>
        <span className="document-rail-divider" />
        <button
          className="tb-btn"
          title="Previous Page"
          disabled={!data || currentPage <= 1}
          onClick={() => go(currentPage - 1)}
        >
          <Icon name="previous" size={19} />
        </button>
        <button
          className="tb-btn"
          title="Next Page"
          disabled={!data || currentPage >= numPages}
          onClick={() => go(currentPage + 1)}
        >
          <Icon name="next" size={19} />
        </button>
        <input
          className="document-rail-page"
          title="Go to page"
          aria-label="Page number"
          value={page}
          disabled={!data}
          onChange={(e) => setPage(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => go(Number(page))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(Number(page))
            if (e.key === 'Escape') setPage(String(currentPage))
          }}
        />
        <span className="document-rail-total" aria-label="Total pages">
          {numPages || '—'}
        </span>
        <span className="document-rail-divider" />
        <button
          className="tb-btn"
          title="Zoom In"
          disabled={!data}
          onClick={() => setZoom(Math.min(5, zoom + 0.15))}
        >
          <Icon name="zoomIn" size={20} />
        </button>
        <button
          className="tb-btn"
          title="Zoom Out"
          disabled={!data}
          onClick={() => setZoom(Math.max(0.25, zoom - 0.15))}
        >
          <Icon name="zoomOut" size={20} />
        </button>
        <button
          className="document-rail-zoom"
          title="Actual size (100%)"
          disabled={!data}
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </aside>
  )
}
