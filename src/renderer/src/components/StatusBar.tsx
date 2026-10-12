import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useUIStore } from '../stores/useUIStore'

export function StatusBar({ pdfDoc }: { pdfDoc: PDFDocumentProxy | null }): React.JSX.Element {
  const { currentPage, isDirty, data } = usePdfStore()
  const units = useUIStore((s) => s.pageUnits)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    setSize(null)
    if (pdfDoc)
      void pdfDoc
        .getPage(currentPage)
        .then((page) => {
          const viewport = page.getViewport({ scale: 1 })
          if (!cancelled) setSize({ width: viewport.width, height: viewport.height })
        })
        .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pdfDoc, currentPage])
  const dimension = size
    ? units === 'inches'
      ? `${(size.width / 72).toFixed(2)} × ${(size.height / 72).toFixed(2)} in`
      : units === 'millimeters'
        ? `${((size.width * 25.4) / 72).toFixed(1)} × ${((size.height * 25.4) / 72).toFixed(1)} mm`
        : `${Math.round(size.width)} × ${Math.round(size.height)} pt`
    : ''
  return (
    <footer className="workspace-status">
      <span>{data ? (isDirty ? 'Unsaved changes' : 'Saved') : ''}</span>
      <span>{dimension}</span>
    </footer>
  )
}
