import { useState } from 'react'
import { Icon } from './Icon'
import { useUIStore } from '../stores/useUIStore'
import { useTabStore } from '../stores/useTabStore'
import { mergePdfs } from '../lib/pdfEditing'

export function CombineFilesModal(): React.JSX.Element {
  const [files, setFiles] = useState<{ filePath: string; data: ArrayBuffer }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = (): void => {
    if (!busy) useUIStore.getState().setActiveModal('none')
  }
  const add = async (): Promise<void> => {
    try {
      const picked = await window.api.pickPdfs()
      setFiles((previous) => [...previous, ...picked])
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }
  const move = (index: number, delta: number): void => {
    setFiles((previous) => {
      const next = [...previous]
      ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
      return next
    })
  }
  const combine = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const bytes = await mergePdfs(files.map((file) => file.data))
      const path = await window.api.saveFileAs(bytes, 'combined.pdf')
      if (!path) return
      useTabStore.getState().openTab(path, bytes.slice().buffer as ArrayBuffer)
      useUIStore.getState().setActiveView('document')
      useUIStore.getState().setActiveModal('none')
    } catch (cause) {
      setError('Unable to combine PDFs: ' + String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal-card preferences-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="combine-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="combine-heading">Combine PDF files</h2>
          <button className="tb-btn" aria-label="Close combine" disabled={busy} onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="preferences-content">
          <p>Add files, arrange them in the order you want, then save the combined PDF.</p>
          <button
            className="action-button"
            disabled={busy}
            onClick={() => {
              void add()
            }}
          >
            <Icon name="document" />
            Add PDF files
          </button>
          <ol className="combine-list">
            {files.map((file, index) => (
              <li key={`${file.filePath}:${index}`}>
                <span title={file.filePath}>{file.filePath.split(/[\\/]/).pop()}</span>
                <button
                  className="tb-btn"
                  aria-label={`Move file ${index + 1} up`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  className="tb-btn"
                  aria-label={`Move file ${index + 1} down`}
                  disabled={busy || index === files.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  className="tb-btn"
                  aria-label={`Remove file ${index + 1}`}
                  disabled={busy}
                  onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}
                >
                  <Icon name="delete" />
                </button>
              </li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <span>{files.length} files</span>
          <button
            className="action-button primary"
            disabled={busy || files.length < 2}
            onClick={() => {
              void combine()
            }}
          >
            {busy ? 'Combining…' : 'Combine and save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
