import { Icon, BrandLogo } from './Icon'
import { openTool } from '../lib/toolActions'
import { useState, useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'

/* ── Adobe Acrobat Home Screen ── */
// Left sidebar: Recent / Starred / My Computer / Samples
// Main: Welcome banner, search, recent files table, drag & drop

interface RecentFile {
  path: string
  name: string
  starred?: boolean
}

type Section = 'recent' | 'starred' | 'computer'

export function HomeView(): React.JSX.Element {
  const { setActiveView } = useUIStore()
  const { openTab } = useTabStore()
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [section, setSection] = useState<Section>('recent')
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    window.api
      .getRecentFiles()
      .then((files) => {
        let starred: string[] = []
        try {
          starred = JSON.parse(localStorage.getItem('re-edit-starred') || '[]')
        } catch {}
        setRecentFiles(files.map((f) => ({ ...f, starred: starred.includes(f.path) })))
      })
      .catch(() => {})
  }, [])

  const handleOpenFile = async (): Promise<void> => {
    await window.api.openFile()
  }

  const handleOpenRecent = async (filePath: string): Promise<void> => {
    try {
      const data = await window.api.readPdf(filePath)
      if (data) {
        openTab(filePath, data)
        setActiveView('document')
      }
    } catch (error) {
      alert('Unable to open PDF: ' + String(error))
    }
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    const buf = await file.arrayBuffer()
    openTab(file.name, buf)
    setActiveView('document')
  }

  const toggleStar = (path: string): void => {
    const next = recentFiles.map((f) => (f.path === path ? { ...f, starred: !f.starred } : f))
    localStorage.setItem(
      're-edit-starred',
      JSON.stringify(next.filter((f) => f.starred).map((f) => f.path))
    )
    setRecentFiles(next)
  }
  const removeRecent = async (path: string): Promise<void> => {
    try {
      await window.api.removeRecentFile(path)
      const next = recentFiles.filter((f) => f.path !== path)
      localStorage.setItem(
        're-edit-starred',
        JSON.stringify(next.filter((f) => f.starred).map((f) => f.path))
      )
      setRecentFiles(next)
    } catch (error) {
      alert('Unable to remove recent entry: ' + String(error))
    }
  }

  const filteredFiles = recentFiles.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    if (section === 'starred') return f.starred
    return true
  })

  const quickActions = [
    {
      icon: <Icon name="edit" size={22} />,
      label: 'Edit PDF',
      color: 'var(--tool-edit)',
      action: () => {
        void openTool('edit')
      }
    },
    {
      icon: <Icon name="sign" size={22} />,
      label: 'Fill & Sign',
      color: 'var(--tool-sign)',
      action: () => {
        void openTool('sign')
      }
    },
    {
      icon: <Icon name="organize" size={22} />,
      label: 'Combine Files',
      color: 'var(--tool-organize)',
      action: () => useUIStore.getState().setActiveModal('combineFiles')
    },
    {
      icon: <Icon name="ocr" size={22} />,
      label: 'Scan & OCR',
      color: 'var(--tool-ocr)',
      action: () => {
        void openTool('ocr')
      }
    }
  ]

  return (
    <div
      className="flex flex-1 min-h-0"
      style={{ background: 'var(--acrobat-pane-bg)' }}
      onDragOver={(e) => {
        e.preventDefault()
        if (
          Array.from(e.dataTransfer.items).some(
            (item) => item.kind === 'file' && (!item.type || item.type === 'application/pdf')
          ) &&
          !e.dataTransfer.types.includes('text/html')
        )
          setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      {/* Left sidebar */}
      <div
        className="flex flex-col shrink-0 py-4"
        style={{
          width: 220,
          borderRight: '1px solid var(--acrobat-pane-border)',
          background: 'var(--acrobat-pane-bg)'
        }}
      >
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <BrandLogo size={32} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--acrobat-pane-text)' }}>
                Re-Edit PDF
              </div>
              <div className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>
                Desktop Edition
              </div>
            </div>
          </div>
        </div>

        <button
          className={`home-sidebar-item ${section === 'recent' ? 'active' : ''}`}
          onClick={() => setSection('recent')}
        >
          <Icon name="recent" size={16} />
          Recent
        </button>
        <button
          className={`home-sidebar-item ${section === 'starred' ? 'active' : ''}`}
          onClick={() => setSection('starred')}
        >
          <Icon name="star" size={16} />
          Starred
        </button>
        <button
          className={`home-sidebar-item ${section === 'computer' ? 'active' : ''}`}
          onClick={() => setSection('computer')}
        >
          <Icon name="computer" size={16} />
          My Computer
        </button>

        <div className="flex-1" />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6" style={{ color: 'var(--acrobat-pane-text)' }}>
        {/* Welcome banner */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Welcome to Re-Edit PDF</h1>
          <p className="text-sm" style={{ color: 'var(--acrobat-text-dim)' }}>
            Open a PDF to get started, or choose a tool below.
          </p>
        </div>

        {/* Quick action cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={qa.action}
              className="tool-card flex flex-col items-center gap-2 text-center"
              style={{ padding: '16px 12px' }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: qa.color,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff'
                }}
              >
                {qa.icon}
              </div>
              <span className="text-xs font-medium">{qa.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recent files…"
            className="text-sm"
            style={{
              width: '100%',
              maxWidth: 400,
              height: 34,
              borderRadius: 6,
              border: '1px solid var(--acrobat-pane-border)',
              padding: '0 12px',
              background: 'var(--acrobat-surface)',
              color: 'var(--acrobat-pane-text)',
              outline: 'none'
            }}
          />
        </div>

        {/* Section content */}
        {section === 'computer' && (
          <div className={`drop-zone ${dragOver ? 'active' : ''}`}>
            <Icon name="open" size={48} />
            <p className="text-sm font-medium mb-1">Drag & Drop a PDF here</p>
            <p className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>
              or click Open File to browse
            </p>
            <button
              onClick={() => void handleOpenFile()}
              className="mt-4 rounded-lg text-white text-sm font-medium px-6"
              style={{ height: 36, background: 'var(--acrobat-accent)' }}
            >
              Browse Files
            </button>
          </div>
        )}

        {(section === 'recent' || section === 'starred') && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                {section === 'starred' ? 'Starred Files' : 'Recent Files'}
              </h3>
              <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>
                {filteredFiles.length} files
              </span>
            </div>
            {filteredFiles.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--acrobat-text-dim)' }}>
                <Icon name="document" size={48} />
                <p className="text-sm">
                  {section === 'starred' ? 'No starred files yet' : 'No recent files'}
                </p>
                <p className="text-xs mt-1">Open a PDF to get started</p>
              </div>
            ) : (
              filteredFiles.map((f) => (
                <div key={f.path} className="file-row">
                  <Icon name="document" size={28} />
                  <button
                    className="flex-1 min-w-0 text-left"
                    title={`Open ${f.name}`}
                    onClick={() => void handleOpenRecent(f.path)}
                  >
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div
                      className="text-xs truncate"
                      style={{ color: 'var(--acrobat-text-dim)', maxWidth: 400 }}
                    >
                      {f.path}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleStar(f.path)
                    }}
                    className="tb-btn"
                    title={f.starred ? 'Unstar' : 'Star'}
                    aria-label={`${f.starred ? 'Unstar' : 'Star'} ${f.name}`}
                    aria-pressed={!!f.starred}
                    style={{
                      color: f.starred ? 'var(--acrobat-accent)' : 'var(--acrobat-pane-text)'
                    }}
                  >
                    <Icon name="star" size={16} filled={!!f.starred} />
                  </button>
                  <button
                    className="tb-btn"
                    title="Remove from recent files"
                    aria-label={`Remove ${f.name} from recent files`}
                    onClick={() => {
                      void removeRecent(f.path)
                    }}
                    style={{ color: 'var(--acrobat-pane-text)' }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Drop overlay */}
        {dragOver && section !== 'computer' && (
          <div
            className="fixed inset-0 pointer-events-none grid place-items-center"
            style={{ background: 'rgba(20,115,230,0.08)' }}
          >
            <div className="drop-zone active pointer-events-none">
              <p className="text-sm font-medium">Drop PDF here to open</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
