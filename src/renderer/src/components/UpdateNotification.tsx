import { useEffect, useState } from 'react'
import { scheduleUpdateNotification } from '../lib/updateNotification'
import { useUIStore } from '../stores/useUIStore'
import { Icon } from './Icon'

export function UpdateNotification(): React.JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  const activeModal = useUIStore((state) => state.activeModal)
  useEffect(() => scheduleUpdateNotification(() => window.api.checkForUpdates(), setVersion), [])
  if (!version || activeModal !== 'none') return null
  return (
    <aside className="update-notification" role="status" aria-label="Update available">
      <div>
        <strong>Re-Edit PDF {version} is available</strong>
        <p>Review the release and download the update.</p>
      </div>
      <button
        className="operation-primary"
        onClick={() => {
          setVersion(null)
          useUIStore.getState().setActiveModal('updates')
        }}
      >
        View update
      </button>
      <button
        className="tb-btn"
        title="Dismiss update notification"
        onClick={() => setVersion(null)}
      >
        <Icon name="close" />
      </button>
    </aside>
  )
}
