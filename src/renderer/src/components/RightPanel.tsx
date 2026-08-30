import { useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore } from '../stores/useUIStore'
import { useDetectionStore } from '../stores/useDetectionStore'

import { EditPanel } from './EditPanel'
import { FormPanel } from './FormPanel'
import { DetectionPanel } from './DetectionPanel'

/* ── Acrobat Right-Hand Tools Pane ── */
// Colored tool buttons: Comment, Sign, Edit, Organize, OCR, Forms, Redact, Protect
// Each expands into its own sub-panel content

const IconComment = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IconSign = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const IconEdit = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconOrganize = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
const IconOCR = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconForms = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
const IconRedact = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
const IconProtect = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>

const TOOLS = [
  { id: 'comment' as const, label: 'Comment', color: 'var(--tool-comment)', icon: <IconComment /> },
  { id: 'sign' as const, label: 'Fill & Sign', color: 'var(--tool-sign)', icon: <IconSign /> },
  { id: 'edit' as const, label: 'Edit PDF', color: 'var(--tool-edit)', icon: <IconEdit /> },
  { id: 'organize' as const, label: 'Organize Pages', color: 'var(--tool-organize)', icon: <IconOrganize /> },
  { id: 'ocr' as const, label: 'Scan & OCR', color: 'var(--tool-ocr)', icon: <IconOCR /> },
  { id: 'forms' as const, label: 'Prepare Form', color: 'var(--tool-forms)', icon: <IconForms /> },
  { id: 'redact' as const, label: 'Redact', color: 'var(--tool-redact)', icon: <IconRedact /> },
  { id: 'protect' as const, label: 'Protect', color: 'var(--tool-protect)', icon: <IconProtect /> }
]

function CommentPanel(): React.JSX.Element {
  const { annotations } = useAnnotationStore()
  const [filter, setFilter] = useState('')

  const filtered = annotations.filter((a) => {
    if (!filter) return true
    return a.type.includes(filter) || (a.text || '').toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">COMMENTS LIST</h3>
        <div className="relative">
          <svg className="absolute left-2.5 top-2 text-zinc-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a comment"
            className="w-full h-8 pl-8 pr-2 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-40 text-zinc-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p className="text-xs">No comments yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-all group"
                onClick={() => {
                  useAnnotationStore.getState().setSelected(a.id)
                  document.getElementById(`page-${a.page}`)?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                <div
                  style={{ width: 14, height: 14, borderRadius: 3, background: a.color, flexShrink: 0, marginTop: 2, border: '1px solid rgba(0,0,0,0.1)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold capitalize text-zinc-700 dark:text-zinc-300">{a.type}</span>
                    <span className="text-[10px] text-zinc-400">Page {a.page}</span>
                  </div>
                  {a.text && <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug break-words">{a.text}</div>}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 tb-btn p-1 ml-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                  onClick={(e) => { e.stopPropagation(); useAnnotationStore.getState().deleteAnnotation(a.id) }}
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SignPanel(): React.JSX.Element {
  const { setActiveModal, signatures } = useUIStore()
  const { setTool } = useAnnotationStore()

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">FILL & SIGN</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setActiveModal('signature')}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Add Signature
          </button>
          <button
            onClick={() => setActiveModal('signature')}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Add Initials
          </button>
        </div>
      </div>

      {signatures.length > 0 && (
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">SAVED</h3>
          <div className="space-y-2">
            {signatures.map((sig) => (
              <div key={sig.id} className="flex items-center justify-between p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group">
                <img src={sig.dataUrl} alt={sig.label} className="max-h-8 max-w-[150px] object-contain" />
                <button className="opacity-0 group-hover:opacity-100 tb-btn" style={{ width: 24, height: 24, fontSize: 12 }} onClick={() => useUIStore.getState().removeSignature(sig.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">TOOLS</h3>
        <div className="flex gap-1 flex-wrap">
          {[
            { id: 'text', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>, label: 'Add Text' },
            { id: 'check', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>, label: 'Add Checkmark' },
            { id: 'x', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>, label: 'Add Crossmark' },
            { id: 'dot', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5"/></svg>, label: 'Add Dot' },
            { id: 'line', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>, label: 'Add Line' }
          ].map((t) => (
            <button
              key={t.id}
              className="tb-btn h-8 w-8 border border-transparent rounded hover:border-zinc-300 dark:hover:border-zinc-700 flex items-center justify-center"
              onClick={() => setTool('text')}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function RedactPanel(): React.JSX.Element {
  const { setTool } = useAnnotationStore()
  return (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">REDACT</h3>
        <div className="flex flex-col gap-1.5 mb-4">
          <button
            onClick={() => setTool('redact')}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            Mark for Redaction
          </button>
          <button
            className="flex items-center gap-3 px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left w-full transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Properties
          </button>
        </div>
        
        <div className="rounded p-3 text-xs bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-300">
          <strong>Security Warning:</strong> Redaction is visual and opaque on Save. It is not forensic-grade, and underlying text data may still exist in the PDF structure.
        </div>
      </div>
    </div>
  )
}

function ProtectPanel(): React.JSX.Element {
  const det = useDetectionStore()
  return (
    <div className="space-y-3">
      <div className="pane-title">Security Summary</div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span style={{ color: 'var(--acrobat-text-dim)' }}>Encryption</span>
          <span style={{ color: det.isEncrypted ? '#ef5350' : 'var(--acrobat-pane-text)' }}>
            {det.isEncrypted ? 'Encrypted' : 'None'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: 'var(--acrobat-text-dim)' }}>AcroForm</span>
          <span>{det.hasAcroForm ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: 'var(--acrobat-text-dim)' }}>XFA</span>
          <span style={{ color: det.hasXfa ? '#ffa726' : 'inherit' }}>{det.hasXfa ? 'Detected (unsupported)' : 'None'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: 'var(--acrobat-text-dim)' }}>Document Type</span>
          <span>{det.isScanned ? 'Scanned' : 'Text'}</span>
        </div>
      </div>
    </div>
  )
}

export function RightPanel({ pdfDoc: _pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element | null {
  const { rightPane, setRightPane } = useUIStore()

  if (rightPane === 'none') {
    // Show only the icon strip
    return (
      <div
        className="flex flex-col items-center py-2 shrink-0"
        style={{
          width: 42,
          borderLeft: '1px solid var(--acrobat-pane-border)',
          background: 'var(--acrobat-chrome-alt)'
        }}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className="tb-btn"
            style={{ width: 34, height: 34, marginBottom: 2, fontSize: 16 }}
            onClick={() => setRightPane(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
    )
  }

  const activeTool = TOOLS.find((t) => t.id === rightPane)

  return (
    <div
      className="flex shrink-0 overflow-hidden"
      style={{
        width: 300,
        borderLeft: '1px solid var(--acrobat-pane-border)',
        background: 'var(--acrobat-pane-bg)'
      }}
    >
      {/* Icon strip */}
      <div
        className="flex flex-col items-center py-2 shrink-0"
        style={{
          width: 42,
          borderRight: '1px solid var(--acrobat-pane-border)',
          background: 'var(--acrobat-chrome-alt)'
        }}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tb-btn ${rightPane === t.id ? 'active' : ''}`}
            style={{ width: 34, height: 34, marginBottom: 2, fontSize: 16 }}
            onClick={() => setRightPane(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ color: 'var(--acrobat-pane-text)' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 shrink-0"
          style={{
            height: 36,
            borderBottom: '1px solid var(--acrobat-pane-border)'
          }}
        >
          <div className="flex items-center gap-2">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: activeTool?.color, flexShrink: 0 }} />
            <span className="text-xs font-semibold">{activeTool?.label}</span>
          </div>
          <button className="tb-btn" style={{ width: 24, height: 24, fontSize: 11 }} onClick={() => setRightPane('none')} title="Close pane">
            ✕
          </button>
        </div>

        <div className="p-3">
          {rightPane === 'comment' && <CommentPanel />}
          {rightPane === 'sign' && <SignPanel />}
          {rightPane === 'edit' && <EditPanel />}
          {rightPane === 'organize' && (
            <div className="flex flex-col gap-3 mt-2">
              <div className="text-xs" style={{ color: 'var(--acrobat-text-muted)' }}>
                Reorder, rotate, delete, and extract pages in your document.
              </div>
              <button
                className="rounded text-xs font-medium text-white p-2 w-full mt-2"
                style={{ background: 'var(--acrobat-accent)' }}
                onClick={() => useUIStore.getState().setActiveModal('organizePages')}
              >
                Open Organize Pages
              </button>
            </div>
          )}
          {rightPane === 'ocr' && <DetectionPanel />}
          {rightPane === 'forms' && <FormPanel />}
          {rightPane === 'redact' && <RedactPanel />}
          {rightPane === 'protect' && <ProtectPanel />}
        </div>
      </div>
    </div>
  )
}
