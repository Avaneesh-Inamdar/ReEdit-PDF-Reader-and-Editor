import { Icon } from './Icon'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { closeDocument } from '../lib/documentActions'

/* ── Acrobat Tab Bar ── */
// Home (house icon), Tools (grid), document tabs with close buttons, + new tab
export function TabBar(): React.JSX.Element {
  const { activeView, setActiveView } = useUIStore()
  const { tabs, activeTabId, setActiveTab } = useTabStore()
  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId)
    setActiveView('document')
  }
  const handleCloseTab = (e: React.MouseEvent, tabId: string): void => {
    e.stopPropagation()
    void closeDocument(tabId)
  }
  const handleNewTab = async (): Promise<void> => { await window.api.openFile() }

  return (
    <div
      className="flex items-center shrink-0 overflow-x-auto"
      style={{
        height: 30,
        background: 'var(--acrobat-tab-inactive)',
        borderBottom: '1px solid var(--acrobat-border)'
      }}
    >
      {/* Home tab */}
      <button
        className={`acrobat-tab ${activeView === 'home' ? 'active' : ''}`}
        onClick={() => setActiveView('home')}
        title="Home"
      >
        <Icon name="home" size={14} />
        <span>Home</span>
      </button>

      {/* Tools tab */}
      <button
        className={`acrobat-tab ${activeView === 'tools' ? 'active' : ''}`}
        onClick={() => setActiveView('tools')}
        title="Tools"
      >
        <Icon name="thumbnails" size={14} />
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
          <Icon name="document" size={22} />
          <span className="max-w-[120px] truncate">{tab.fileName}</span>
          {tab.isDirty && <span style={{ color: 'var(--acrobat-text-muted)', fontSize: 14, lineHeight: 1 }}>•</span>}
          <span
            className="close-btn"
            onClick={(e) => handleCloseTab(e, tab.id)}
            title="Close tab"
          >
            <Icon name="close" />
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
        <Icon name="plus" />
      </button>

      <div className="flex-1" />
    </div>
  )
}
