import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { usePdfStore } from '../stores/usePdfStore'

/* ── Acrobat Tab Bar ── */
// Home (house icon), Tools (grid), document tabs with close buttons, + new tab
export function TabBar(): React.JSX.Element {
  const { activeView, setActiveView } = useUIStore()
  const { tabs, activeTabId, closeTab, setActiveTab } = useTabStore()
  const openFile = usePdfStore((s) => s.openFile)

  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId)
    setActiveView('document')
    // sync PDF store with this tab's data
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) {
      openFile(tab.filePath || tab.fileName, tab.data)
    }
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string): void => {
    e.stopPropagation()
    closeTab(tabId)
    // If no more tabs, go home
    const remaining = tabs.filter((t) => t.id !== tabId)
    if (remaining.length === 0) {
      setActiveView('home')
      usePdfStore.getState().closeFile()
    }
  }

  const handleNewTab = async (): Promise<void> => {
    const res = await window.api.openFile()
    if (res) {
      const { useTabStore: ts } = await import('../stores/useTabStore')
      ts.getState().openTab(res.filePath, res.data)
      usePdfStore.getState().openFile(res.filePath, res.data)
      setActiveView('document')
    }
  }

  return (
    <div
      className="flex items-center shrink-0 overflow-x-auto"
      style={{
        height: 34,
        background: 'var(--acrobat-tab-inactive)',
        borderBottom: '1px solid var(--acrobat-border)'
      }}
    >
      {/* Home tab */}
      <button
        className={`acrobat-tab ${activeView === 'home' && !activeTabId ? 'active' : ''}`}
        onClick={() => setActiveView('home')}
        title="Home"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Home</span>
      </button>

      {/* Tools tab */}
      <button
        className={`acrobat-tab ${activeView === 'tools' ? 'active' : ''}`}
        onClick={() => setActiveView('tools')}
        title="Tools"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        <span>Tools</span>
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'var(--acrobat-border)', margin: '0 2px', flexShrink: 0 }} />

      {/* Document tabs */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`acrobat-tab ${activeView === 'document' && activeTabId === tab.id ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.id)}
          title={tab.filePath || tab.fileName}
        >
          {/* PDF icon */}
          <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
            <path d="M0 1C0 .45.45 0 1 0h6l5 5v8c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V1z" fill="var(--acrobat-red)" opacity="0.85" />
            <path d="M7 0l5 5H8c-.55 0-1-.45-1-1V0z" fill="rgba(255,255,255,0.3)" />
          </svg>
          <span className="max-w-[120px] truncate">{tab.fileName}</span>
          {tab.isDirty && <span style={{ color: 'var(--acrobat-text-muted)', fontSize: 14, lineHeight: 1 }}>•</span>}
          <span
            className="close-btn"
            onClick={(e) => handleCloseTab(e, tab.id)}
            title="Close tab"
          >
            ✕
          </span>
        </button>
      ))}

      {/* New tab button */}
      <button
        className="tb-btn ml-1"
        onClick={() => void handleNewTab()}
        title="Open new document"
        style={{ fontSize: 16, fontWeight: 300 }}
      >
        +
      </button>

      <div className="flex-1" />
    </div>
  )
}
