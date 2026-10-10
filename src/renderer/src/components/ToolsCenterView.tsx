import { Icon, type IconName } from './Icon'
import { openTool } from '../lib/toolActions'
import { useUIStore } from '../stores/useUIStore'

/* ── Adobe Acrobat Tools Center Hub ── */
// Categorized tool cards organized by function, like Acrobat's All Tools view

interface ToolDef {
  label: string
  desc: string
  color: string
  icon: IconName
  pane: 'comment' | 'sign' | 'edit' | 'organize' | 'ocr' | 'forms' | 'redact' | 'protect'
}

const TOOL_CATEGORIES: { category: string; tools: ToolDef[] }[] = [
  {
    category: 'View & Review',
    tools: [
      {
        label: 'Comment',
        desc: 'Add notes, highlights, and text comments to your PDF',
        color: 'var(--tool-comment)',
        icon: 'comment',
        pane: 'comment'
      }
    ]
  },
  {
    category: 'Edit PDF',
    tools: [
      {
        label: 'Edit Text & Images',
        desc: 'Replace visible text and add text or images',
        color: 'var(--tool-edit)',
        icon: 'edit',
        pane: 'edit'
      },
      {
        label: 'Organize Pages',
        desc: 'Reorder, rotate, delete, insert blank pages, and extract pages',
        color: 'var(--tool-organize)',
        icon: 'organize',
        pane: 'organize'
      },
      {
        label: 'Scan & OCR',
        desc: 'Recognize text in scanned documents using local OCR',
        color: 'var(--tool-ocr)',
        icon: 'ocr',
        pane: 'ocr'
      }
    ]
  },
  {
    category: 'Forms & Signatures',
    tools: [
      {
        label: 'Fill & Sign',
        desc: 'Fill form fields and add your signature or initials',
        color: 'var(--tool-sign)',
        icon: 'sign',
        pane: 'sign'
      },
      {
        label: 'Fill Forms',
        desc: 'Fill existing PDF form fields',
        color: 'var(--tool-forms)',
        icon: 'forms',
        pane: 'forms'
      }
    ]
  },
  {
    category: 'Protect & Standardize',
    tools: [
      {
        label: 'Redact',
        desc: 'Remove marked content when saving',
        color: 'var(--tool-redact)',
        icon: 'mask',
        pane: 'redact'
      },
      {
        label: 'Security Properties',
        desc: 'View encryption and form status',
        color: 'var(--tool-protect)',
        icon: 'protect',
        pane: 'protect'
      }
    ]
  }
]

export function ToolsCenterView(): React.JSX.Element {
  return (
    <div
      className="flex-1 overflow-y-auto p-8"
      style={{ background: 'var(--acrobat-pane-bg)', color: 'var(--acrobat-pane-text)' }}
    >
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-1">All Tools</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--acrobat-text-dim)' }}>
          Select a tool to open it in your document workspace.
        </p>

        <button
          className="tool-card mb-5 flex items-center gap-3"
          onClick={() => useUIStore.getState().setActiveModal('combineFiles')}
        >
          <Icon name="organize" size={24} />
          <span>Combine PDF files</span>
        </button>
        <div className="tools-grid">
          {TOOL_CATEGORIES.flatMap((cat) =>
            cat.tools.map((tool) => (
              <button
                key={tool.label}
                className="tool-card flex items-start gap-3 text-left"
                onClick={() => {
                  void openTool(tool.pane)
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    background: tool.color,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    flexShrink: 0
                  }}
                >
                  <Icon name={tool.icon} size={20} />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--acrobat-text-dim)' }}>
                    {cat.category}
                  </div>
                  <div className="text-sm font-semibold mb-1">{tool.label}</div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--acrobat-text-dim)', lineHeight: 1.5 }}
                  >
                    {tool.desc}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
