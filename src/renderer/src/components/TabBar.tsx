import { Icon } from './Icon'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { closeDocument } from '../lib/documentActions'

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
    <div className="acrobat-workspace-tabs" role="tablist" aria-label="Documents"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
          !(event.target instanceof Element) || event.target.getAttribute('role') !== 'tab') return
        event.preventDefault(); event.stopPropagation()
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        const current = tabs.indexOf(event.target as HTMLButtonElement)
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (current + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length
        tabs[index]?.click(); tabs[index]?.focus()
      }}>
      <button
        className={`acrobat-tab workspace-home-tab ${activeView === 'home' ? 'active' : ''}`}
        role="tab"
        aria-label="Home"
        aria-selected={activeView === 'home'}
        onClick={() => setActiveView('home')}
        title="Home"
      >
        <Icon name="home" size={18} />
        <span className="sr-only">Home</span>
      </button>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`acrobat-tab workspace-document-tab ${activeView === 'document' && activeTabId === tab.id ? 'active' : ''}`}
        >
          <button
            className="workspace-document-tab-label"
            role="tab"
            aria-selected={activeView === 'document' && activeTabId === tab.id}
            onClick={() => handleTabClick(tab.id)}
            title={tab.filePath || tab.fileName}
          >
            <Icon name="document" size={18} />
            <span className="workspace-document-name">{tab.fileName}</span>
            {tab.isDirty && <span className="workspace-document-dirty" aria-label="Unsaved changes">•</span>}
          </button>
          <button
            className="close-btn"
            onClick={(e) => handleCloseTab(e, tab.id)}
            aria-label={`Close ${tab.fileName}`}
            title="Close tab"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
      <button
        className="workspace-new-tab"
        onClick={() => void handleNewTab()}
        title="Open new document"
        aria-label="Open new document"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}
