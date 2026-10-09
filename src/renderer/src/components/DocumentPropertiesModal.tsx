import { Icon } from './Icon'
import { useState } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useDetectionStore } from '../stores/useDetectionStore'
import { useFormStore } from '../stores/useFormStore'
import { useUIStore } from '../stores/useUIStore'

/* ── Document Properties Modal (Ctrl+D) ── */
// Tabs: Description, Security, Fonts

type Tab = 'description' | 'security' | 'fonts'

export function DocumentPropertiesModal(): React.JSX.Element {
  const { fileName, filePath, numPages, title, author, data } = usePdfStore()
  const det = useDetectionStore()
  const form = useFormStore()
  const { setActiveModal } = useUIStore()
  const [tab, setTab] = useState<Tab>('description')

  const fileSize = data ? `${(data.byteLength / 1024).toFixed(1)} KB` : '—'

  return (
    <div className="modal-overlay" onClick={() => setActiveModal('none')}>
      <div className="modal-card" style={{ width: 520, minHeight: 360 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4" style={{ height: 44, borderBottom: '1px solid var(--acrobat-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--acrobat-text)' }}>Document Properties</span>
          <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}><Icon name="close" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--acrobat-border)' }}>
          {(['description', 'security', 'fonts'] as Tab[]).map((t) => (
            <button
              key={t}
              className="px-4 py-2 text-xs font-medium capitalize"
              style={{
                borderBottom: tab === t ? '2px solid var(--acrobat-accent)' : '2px solid transparent',
                color: tab === t ? 'var(--acrobat-text)' : 'var(--acrobat-text-muted)',
                background: 'transparent'
              }}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3" style={{ color: 'var(--acrobat-text)' }}>
          {tab === 'description' && (
            <>
              <Row label="File" value={fileName || '—'} />
              <Row label="File Path" value={filePath || '—'} />
              <Row label="File Size" value={fileSize} />
              <Row label="Title" value={title || '—'} />
              <Row label="Author" value={author || '—'} />
              <Row label="Pages" value={String(numPages)} />
              <Row label="PDF Version" value={det.metadata.PDFFormatVersion || "Unknown"} />
              <Row label="Document Type" value={det.isScanned ? 'Scanned PDF' : 'Text PDF'} />
              <Row label={det.sampledPages && det.sampledPages < numPages ? "Sampled characters" : "Total Characters"} value={String(det.textChars)} />
              <Row label="Avg Chars/Page" value={String(det.avgCharsPerPage)} />
              {Object.entries(det.metadata).slice(0, 8).map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </>
          )}

          {tab === 'security' && (
            <>
              <Row label="Encryption" value={det.isEncrypted ? 'Yes — Password Protected' : 'None'} />
              <Row label="AcroForm" value={form.hasAcroForm ? `Yes — ${form.fields.length} fields` : 'No'} />
              <Row label="XFA Forms" value={form.hasXfa ? 'Detected — Unsupported' : 'None'} />
              <p className="text-xs">Document permission restrictions are not assessed by this app.</p>
            </>
          )}

          {tab === 'fonts' && (
            <>
              {det.fonts.length === 0 ? (
                <div className="text-xs py-4 text-center" style={{ color: 'var(--acrobat-text-muted)' }}>
                  No fonts detected in this document
                </div>
              ) : (
                det.fonts.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1" style={{ borderBottom: '1px solid var(--acrobat-border)' }}>
                    <Icon name="text" size={14} />
                    <span>{f}</span>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3" style={{ borderTop: '1px solid var(--acrobat-border)' }}>
          <button
            onClick={() => setActiveModal('none')}
            className="rounded text-xs font-medium text-white px-4"
            style={{ height: 30, background: 'var(--acrobat-accent)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex gap-4 text-xs">
      <span style={{ width: 120, flexShrink: 0, color: 'var(--acrobat-text-muted)' }}>{label}</span>
      <span className="truncate flex-1">{value}</span>
    </div>
  )
}
