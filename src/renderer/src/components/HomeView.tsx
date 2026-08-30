import { useState, useEffect } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
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

type Section = 'recent' | 'starred' | 'computer' | 'samples'

const SAMPLE_FILES = [
  { name: 'simple-text.pdf', path: 'test-fixtures/simple-text.pdf' },
  { name: 'form-acroform.pdf', path: 'test-fixtures/form-acroform.pdf' },
  { name: 'scanned-image-only.pdf', path: 'test-fixtures/scanned-image-only.pdf' },
  { name: 'image-and-text.pdf', path: 'test-fixtures/image-and-text.pdf' }
]

export function HomeView(): React.JSX.Element {
  const { openFile } = usePdfStore()
  const { setActiveView } = useUIStore()
  const { openTab } = useTabStore()
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [section, setSection] = useState<Section>('recent')
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    window.api.getRecentFiles().then((files) => {
      setRecentFiles(files.map((f) => ({ ...f, starred: false })))
    }).catch(() => {})
  }, [])

  const handleOpenFile = async (): Promise<void> => {
    const res = await window.api.openFile()
    if (res) {
      openTab(res.filePath, res.data)
      openFile(res.filePath, res.data)
      setActiveView('document')
    }
  }

  const handleOpenRecent = async (filePath: string): Promise<void> => {
    try {
      const data = await window.api.readPdf(filePath)
      if (data) {
        openTab(filePath, data)
        openFile(filePath, data)
        setActiveView('document')
      }
    } catch {
      // fallback
    }
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    const buf = await file.arrayBuffer()
    openTab(file.name, buf)
    openFile(file.name, buf)
    setActiveView('document')
  }

  const toggleStar = (path: string): void => {
    setRecentFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, starred: !f.starred } : f))
    )
  }

  const filteredFiles = recentFiles.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    if (section === 'starred') return f.starred
    return true
  })

  const quickActions = [
    { icon: '📝', label: 'Edit PDF', color: 'var(--tool-edit)', action: () => { useUIStore.getState().setRightPane('edit'); setActiveView('tools') } },
    { icon: '✍️', label: 'Fill & Sign', color: 'var(--tool-sign)', action: () => { useUIStore.getState().setRightPane('sign'); setActiveView('tools') } },
    { icon: '📄', label: 'Combine Files', color: 'var(--tool-organize)', action: () => { useUIStore.getState().setRightPane('organize'); setActiveView('tools') } },
    { icon: '🔍', label: 'Scan & OCR', color: 'var(--tool-ocr)', action: () => { useUIStore.getState().setRightPane('ocr'); setActiveView('tools') } }
  ]

  return (
    <div
      className="flex flex-1 min-h-0"
      style={{ background: 'var(--acrobat-pane-bg)' }}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
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
            <div style={{ width: 28, height: 28, borderRadius: 5, background: 'var(--acrobat-accent)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>R</div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--acrobat-pane-text)' }}>Readit Pdf Reader</div>
              <div className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>Desktop Edition</div>
            </div>
          </div>
        </div>

        <button className={`home-sidebar-item ${section === 'recent' ? 'active' : ''}`} onClick={() => setSection('recent')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Recent
        </button>
        <button className={`home-sidebar-item ${section === 'starred' ? 'active' : ''}`} onClick={() => setSection('starred')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={section === 'starred' ? '#ffa726' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          Starred
        </button>
        <button className={`home-sidebar-item ${section === 'computer' ? 'active' : ''}`} onClick={() => setSection('computer')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
          My Computer
        </button>
        <button className={`home-sidebar-item ${section === 'samples' ? 'active' : ''}`} onClick={() => setSection('samples')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          Sample Documents
        </button>

        <div className="flex-1" />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6" style={{ color: 'var(--acrobat-pane-text)' }}>
        {/* Welcome banner */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Welcome to Readit Pdf Reader</h1>
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
                  fontSize: 20
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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--acrobat-text-dim)" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            <p className="text-sm font-medium mb-1">Drag & Drop a PDF here</p>
            <p className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>or click Open File to browse</p>
            <button
              onClick={() => void handleOpenFile()}
              className="mt-4 rounded-lg text-white text-sm font-medium px-6"
              style={{ height: 36, background: 'var(--acrobat-accent)' }}
            >
              Browse Files
            </button>
          </div>
        )}

        {section === 'samples' && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold mb-3">Sample PDF Documents</h3>
            {SAMPLE_FILES.map((sf) => (
              <div key={sf.name} className="file-row" onClick={() => void handleOpenFile()}>
                <svg width="20" height="24" viewBox="0 0 12 14" fill="none"><path d="M0 1C0 .45.45 0 1 0h6l5 5v8c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V1z" fill="var(--acrobat-red)" opacity="0.85" /><path d="M7 0l5 5H8c-.55 0-1-.45-1-1V0z" fill="rgba(255,255,255,0.3)" /></svg>
                <div className="flex-1">
                  <div className="text-sm font-medium">{sf.name}</div>
                  <div className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>test-fixtures/</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(section === 'recent' || section === 'starred') && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{section === 'starred' ? 'Starred Files' : 'Recent Files'}</h3>
              <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>{filteredFiles.length} files</span>
            </div>
            {filteredFiles.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--acrobat-text-dim)' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', opacity: 0.4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <p className="text-sm">{section === 'starred' ? 'No starred files yet' : 'No recent files'}</p>
                <p className="text-xs mt-1">Open a PDF to get started</p>
              </div>
            ) : (
              filteredFiles.map((f) => (
                <div key={f.path} className="file-row">
                  <svg width="20" height="24" viewBox="0 0 12 14" fill="none"><path d="M0 1C0 .45.45 0 1 0h6l5 5v8c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V1z" fill="var(--acrobat-red)" opacity="0.85" /><path d="M7 0l5 5H8c-.55 0-1-.45-1-1V0z" fill="rgba(255,255,255,0.3)" /></svg>
                  <div className="flex-1 min-w-0" onClick={() => void handleOpenRecent(f.path)}>
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--acrobat-text-dim)', maxWidth: 400 }}>{f.path}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(f.path) }}
                    className="tb-btn"
                    title={f.starred ? 'Unstar' : 'Star'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={f.starred ? '#ffa726' : 'none'} stroke={f.starred ? '#ffa726' : 'currentColor'} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Drop overlay */}
        {dragOver && section !== 'computer' && (
          <div className="fixed inset-0 pointer-events-none grid place-items-center" style={{ background: 'rgba(20,115,230,0.08)' }}>
            <div className="drop-zone active pointer-events-none">
              <p className="text-sm font-medium">Drop PDF here to open</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
