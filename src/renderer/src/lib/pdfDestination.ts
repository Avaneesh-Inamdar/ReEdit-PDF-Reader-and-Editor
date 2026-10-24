import type { PDFDocumentProxy } from 'pdfjs-dist'

// Explicit PDF destinations may start with a zero-based page index or an
// indirect page reference. Zero is a valid first page, not an absent target.
export async function destinationPage(
  pdf: PDFDocumentProxy,
  destination: unknown
): Promise<number | null> {
  try {
    const resolved =
      typeof destination === 'string' ? await pdf.getDestination(destination) : destination
    if (!Array.isArray(resolved) || !resolved.length) return null
    const target: unknown = resolved[0]
    const index =
      typeof target === 'number'
        ? target
        : target && typeof target === 'object' && 'num' in target && 'gen' in target
          ? await pdf.getPageIndex(target as { num: number; gen: number })
          : -1
    return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null
  } catch {
    return null
  }
}
