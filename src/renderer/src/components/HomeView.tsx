import { Icon } from './Icon'
import { openTool } from '../lib/toolActions'
import { useState, useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import '../assets/home-workspace.css'

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
      className="home-workspace"
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
      <nav className="home-navigation" aria-label="Your files">
        <p className="home-navigation-heading">Your files</p>

        <button
          className={`home-sidebar-item ${section === 'recent' ? 'active' : ''}`}
          onClick={() => setSection('recent')}
          aria-current={section === 'recent' ? 'page' : undefined}
        >
          <Icon name="recent" size={16} />
          Recent
        </button>
        <button
          className={`home-sidebar-item ${section === 'starred' ? 'active' : ''}`}
          onClick={() => setSection('starred')}
          aria-current={section === 'starred' ? 'page' : undefined}
        >
          <Icon name="star" size={16} />
          Starred
        </button>
        <p className="home-navigation-heading home-storage-heading">File storage</p>
        <button
          className={`home-sidebar-item ${section === 'computer' ? 'active' : ''}`}
          onClick={() => setSection('computer')}
          aria-current={section === 'computer' ? 'page' : undefined}
        >
          <Icon name="computer" size={16} />
          My Computer
        </button>

        <button className="home-browse-button" onClick={() => void handleOpenFile()}>
          <Icon name="open" size={16} />
          Open a file
        </button>
      </nav>

      {/* Main content */}
      <main className="home-main">
        <header className="home-welcome">
          <h1>Welcome to Re-Edit PDF</h1>
          <p>Open a PDF to get started, or choose a tool below.</p>
          <button className="home-see-tools home-outline-button" title="See all tools" onClick={() => setActiveView('tools')}>See all tools</button>
        </header>

        <div className="home-quick-tools" aria-label="Common PDF tools">
          {quickActions.map((qa) => (
            <button key={qa.label} onClick={qa.action} className="home-quick-tool">
              <span className="home-tool-icon" style={{ color: qa.color }}>
                {qa.icon}
              </span>
              <span>{qa.label}</span>
              <Icon name="right" size={14} />
            </button>
          ))}
        </div>

        {section === 'computer' && (
          <section className={`home-computer drop-zone ${dragOver ? 'active' : ''}`}>
            <Icon name="open" size={40} />
            <h2>Drag & Drop a PDF here</h2>
            <p>or click Open File to browse</p>
            <button onClick={() => void handleOpenFile()} className="home-primary-button">
              Browse Files
            </button>
          </section>
        )}

        {(section === 'recent' || section === 'starred') && (
          <section
            className="home-files"
            aria-label={section === 'starred' ? 'Starred Files' : 'Recent Files'}
          >
            <div className="home-files-heading">
              <div>
                <h2>{section === 'starred' ? 'Starred Files' : 'Recent Files'}</h2>
                <span className="home-file-count">{filteredFiles.length} files</span>
              </div>
              <label className="home-search">
                <Icon name="search" size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recent files…"
                  aria-label="Search recent files"
                />
              </label>
            </div>
            <table className="home-file-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="home-location-column">
                    Location
                  </th>
                  <th scope="col" className="home-actions-column">
                    <span className="sr-only">File actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="home-empty">
                        <Icon name="document" size={40} />
                        <p>{section === 'starred' ? 'No starred files yet' : 'No recent files'}</p>
                        <span>Open a PDF to get started</span>
                        <button
                          className="home-outline-button"
                          onClick={() => void handleOpenFile()}
                        >
                          Open a file
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((f) => (
                    <tr key={f.path} className="file-row">
                      <td>
                        <button
                          className="home-file-name"
                          title={`Open ${f.name}`}
                          onClick={() => void handleOpenRecent(f.path)}
                        >
                          <Icon name="document" size={28} />
                          <span>{f.name}</span>
                        </button>
                      </td>
                      <td className="home-location-column">
                        <span className="home-file-location" title={f.path}>
                          {f.path}
                        </span>
                      </td>
                      <td className="home-file-actions">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
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
      </main>
    </div>
  )
}
