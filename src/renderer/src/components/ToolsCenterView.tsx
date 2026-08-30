import { useUIStore } from '../stores/useUIStore'

/* ── Adobe Acrobat Tools Center Hub ── */
// Categorized tool cards organized by function, like Acrobat's All Tools view

interface ToolDef {
  label: string
  desc: string
  color: string
  icon: string
  pane: 'comment' | 'sign' | 'edit' | 'organize' | 'ocr' | 'forms' | 'redact' | 'protect'
}

const TOOL_CATEGORIES: { category: string; tools: ToolDef[] }[] = [
  {
    category: 'View & Review',
    tools: [
      { label: 'Comment', desc: 'Add notes, highlights, and text comments to your PDF', color: 'var(--tool-comment)', icon: '💬', pane: 'comment' },
    ]
  },
  {
    category: 'Edit PDF',
    tools: [
      { label: 'Edit Text & Images', desc: 'Add and edit text, images on PDF pages', color: 'var(--tool-edit)', icon: '✏️', pane: 'edit' },
      { label: 'Organize Pages', desc: 'Reorder, rotate, delete, insert, split, and merge pages', color: 'var(--tool-organize)', icon: '📑', pane: 'organize' },
      { label: 'Scan & OCR', desc: 'Recognize text in scanned documents using local OCR', color: 'var(--tool-ocr)', icon: '🔍', pane: 'ocr' }
    ]
  },
  {
    category: 'Forms & Signatures',
    tools: [
      { label: 'Fill & Sign', desc: 'Fill form fields and add your signature or initials', color: 'var(--tool-sign)', icon: '✍️', pane: 'sign' },
      { label: 'Prepare Form', desc: 'Detect and edit form fields in your PDF', color: 'var(--tool-forms)', icon: '📋', pane: 'forms' }
    ]
  },
  {
    category: 'Protect & Standardize',
    tools: [
      { label: 'Redact', desc: 'Permanently remove sensitive content from your PDF', color: 'var(--tool-redact)', icon: '█', pane: 'redact' },
      { label: 'Security Properties', desc: 'View encryption status and document permissions', color: 'var(--tool-protect)', icon: '🔒', pane: 'protect' }
    ]
  }
]

export function ToolsCenterView(): React.JSX.Element {
  const { setActiveView, setRightPane } = useUIStore()

  const openTool = (pane: ToolDef['pane']): void => {
    setRightPane(pane)
    setActiveView('document')
  }

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ background: 'var(--acrobat-pane-bg)', color: 'var(--acrobat-pane-text)' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-1">All Tools</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--acrobat-text-dim)' }}>
          Select a tool to open it in your document workspace.
        </p>

        {TOOL_CATEGORIES.map((cat) => (
          <div key={cat.category} className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--acrobat-text-muted)' }}>
              {cat.category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.tools.map((tool) => (
                <button
                  key={tool.label}
                  className="tool-card flex items-start gap-3 text-left"
                  onClick={() => openTool(tool.pane)}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: tool.color,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 22,
                      flexShrink: 0
                    }}
                  >
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold mb-0.5">{tool.label}</div>
                    <div className="text-xs" style={{ color: 'var(--acrobat-text-dim)', lineHeight: 1.4 }}>
                      {tool.desc}
                    </div>
                    <div className="mt-2 text-xs font-medium" style={{ color: 'var(--acrobat-accent)' }}>
                      Open →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
