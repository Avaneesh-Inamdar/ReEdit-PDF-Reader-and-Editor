import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/useUIStore'

export default function UpdatesModal(): React.JSX.Element {
  const close=useUIStore(s => s.setActiveModal)
  const [result,setResult]=useState<Awaited<ReturnType<typeof window.api.checkForUpdates>> | null>(null)
  const [busy,setBusy]=useState(true)
  const check=async (): Promise<void> => { setBusy(true); try { setResult(await window.api.checkForUpdates()) } finally { setBusy(false) } }
  useEffect(() => { void check() }, [])
  return <div className="modal-overlay" onClick={() => close('none')}><div className="modal-card p-6" style={{width:420}} onClick={e => e.stopPropagation()}>
    <h2 className="text-sm font-bold">Check for Updates</h2>
    <p className="text-xs mt-3">{busy ? 'Checking GitHub Releases…' : result?.message}</p>
    {result && <p className="text-xs mt-2">Installed: {result.current}{result.latest && ` · Latest: ${result.latest}`}</p>}
    <div className="flex gap-3 mt-5"><button disabled={busy} onClick={() => void check()}>Check again</button><button onClick={() => void window.api.openReleases()}>Open releases</button><button onClick={() => close('none')}>Close</button></div>
  </div></div>
}
