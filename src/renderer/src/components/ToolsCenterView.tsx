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
    <main className="tools-workspace">
      <div className="tools-workspace-content">
        <header className="tools-heading">
          <h1>All Tools</h1>
          <p>Select a tool to open it in your document workspace.</p>
        </header>

        <button
          className="tool-card tools-combine-row tools-workspace-row"
          onClick={() => useUIStore.getState().setActiveModal('combineFiles')}
        >
          <span className="tools-row-icon" style={{ color: 'var(--tool-organize)' }}>
            <Icon name="organize" size={26} />
          </span>
          <span className="tools-row-copy">
            <span className="tools-row-name">Combine PDF files</span>
            <span className="tools-row-description">
              Bring multiple PDF files together in one document.
            </span>
          </span>
          <span className="tools-open-button">Open</span>
        </button>
        <div className="tools-category-grid">
          {TOOL_CATEGORIES.map((cat) => (
            <section className="tools-category" key={cat.category} aria-label={cat.category}>
              <h2>{cat.category}</h2>
              {cat.tools.map((tool) => (
                <button
                  key={tool.label}
                  className="tool-card tools-workspace-row"
                  onClick={() => {
                    void openTool(tool.pane)
                  }}
                >
                  <span className="tools-row-icon" style={{ color: tool.color }}>
                    <Icon name={tool.icon} size={26} />
                  </span>
                  <span className="tools-row-copy">
                    <span className="tools-row-name">{tool.label}</span>
                    <span className="tools-row-description">{tool.desc}</span>
                  </span>
                  <span className="tools-open-button">Open</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
