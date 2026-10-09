import { placeImage, placeMark } from '../lib/imagePlacement'
import { openTool } from '../lib/toolActions'
import { useEditStore } from '../stores/useEditStore'
import { Icon } from './Icon'
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

const IconComment = () => <Icon name="comment" size={18} />
const IconSign = () => <Icon name="sign" size={18} />
const IconEdit = () => <Icon name="edit" size={18} />
const IconOrganize = () => <Icon name="organize" size={18} />
const IconOCR = () => <Icon name="ocr" size={18} />
const IconForms = () => <Icon name="forms" size={18} />
const IconRedact = () => <Icon name="mask" size={18} />
const IconProtect = () => <Icon name="protect" size={18} />

const TOOLS = [
  { id: 'comment' as const, label: 'Comment', color: 'var(--tool-comment)', icon: <IconComment /> },
  { id: 'sign' as const, label: 'Fill & Sign', color: 'var(--tool-sign)', icon: <IconSign /> },
  { id: 'edit' as const, label: 'Edit PDF', color: 'var(--tool-edit)', icon: <IconEdit /> },
  { id: 'organize' as const, label: 'Organize Pages', color: 'var(--tool-organize)', icon: <IconOrganize /> },
  { id: 'ocr' as const, label: 'Scan & OCR', color: 'var(--tool-ocr)', icon: <IconOCR /> },
  { id: 'forms' as const, label: 'Fill Forms', color: 'var(--tool-forms)', icon: <IconForms /> },
  { id: 'redact' as const, label: 'Redact', color: 'var(--tool-redact)', icon: <IconRedact /> },
  { id: 'protect' as const, label: 'Security Summary', color: 'var(--tool-protect)', icon: <IconProtect /> }
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
          <span className="absolute left-2.5 top-2 text-zinc-400"><Icon name="search" size={14} /></span>
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
            <span className="mb-2"><Icon name="comment" size={32} /></span>
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
                  <Icon name="close" size={14} />
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
            <Icon name="edit" size={16} />
            Add Signature
          </button>
          <button
            onClick={() => setActiveModal('signature')}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Icon name="highlight" size={16} />
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
                <button title="Place saved signature" onClick={() => { void placeImage(sig.dataUrl) }}><img src={sig.dataUrl} alt={sig.label} draggable={false} className="max-h-8 max-w-[150px] object-contain" /></button>
                <button className="opacity-0 group-hover:opacity-100 tb-btn" style={{ width: 24, height: 24, fontSize: 12 }} onClick={() => useUIStore.getState().removeSignature(sig.id)}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4">
        <p className="text-xs mb-3">Choose a signature or mark, then click the page to place it.</p>
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">TOOLS</h3>
        <div className="flex gap-1 flex-wrap">
          {[
            { id: 'text', icon: <Icon name="text" size={14} />, label: 'Add Text' },
            { id: 'check', icon: <Icon name="check" size={14} />, label: 'Add Checkmark' },
            { id: 'x', icon: <Icon name="close" size={14} />, label: 'Add Crossmark' },
            { id: 'dot', icon: <Icon name="dot" size={14} />, label: 'Add Dot' },
            { id: 'line', icon: <Icon name="minus" size={14} />, label: 'Add Line' }
          ].map((t) => (
            <button
              key={t.id}
              className="tb-btn h-8 w-8 border border-transparent rounded hover:border-zinc-300 dark:hover:border-zinc-700 flex items-center justify-center"
              onClick={() => {
                if (t.id === 'text') { useEditStore.getState().setPendingText(null); setTool('text') }
                else placeMark(t.id)
              }}
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
            <Icon name="thumbnails" size={16} />
            Mark area for redaction
          </button>

        </div>
        
        <div className="rounded p-3 text-xs bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-300">
          Saving removes text, image pixels, graphics and comments in marked areas and rewrites the PDF. Form fields become permanent page content; document metadata and catalog attachments are removed. Review the saved copy before sharing; undo remains available in this editing session.
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
            onClick={() => { void openTool(t.id) }}
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
            onClick={() => { void openTool(t.id) }}
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
            <Icon name="close" />
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
