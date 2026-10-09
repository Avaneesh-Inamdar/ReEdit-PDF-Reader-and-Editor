import { describe, expect, it } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { outputScale, pageText, renderPage } from '../src/renderer/src/lib/rendering'

describe('bounded PDF rendering', () => {
  it('renders sharply at device scale without allocating oversized canvases', () => {
    expect(outputScale(612, 792, 2)).toBe(2)
    expect(outputScale(612, 792, 1)).toBe(1.5)
    const scale = outputScale(6120, 7920, 3)
    expect(6120 * 7920 * scale * scale).toBeCloseTo(12000000)
  })
  it('shares text extraction and bounds its working set', async () => {
    let extracted = 0
    const document = {
      getPage: async () => ({
        getTextContent: async () => {
          extracted++
          return { items: [], styles: {} }
        }
      })
    } as unknown as PDFDocumentProxy
    await Promise.all([pageText(document, 1), pageText(document, 1)])
    expect(extracted).toBe(1)
    for (let page = 2; page <= 26; page++) await pageText(document, page)
    await pageText(document, 1)
    expect(extracted).toBe(27)
  })
  it('limits concurrent work and releases slots after failures', async () => {
    let active = 0,
      peak = 0
    const jobs = Array.from({ length: 12 }, (_, index) =>
      renderPage(async () => {
        peak = Math.max(peak, ++active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        if (index === 2) throw new Error('render failed')
        return index
      })
    )
    const result = await Promise.allSettled(jobs)
    expect(peak).toBe(3)
    expect(result.filter((job) => job.status === 'rejected')).toHaveLength(1)
    expect(active).toBe(0)
  })
})
