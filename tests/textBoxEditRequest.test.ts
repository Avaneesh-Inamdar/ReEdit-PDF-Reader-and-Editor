import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfTextRun } from '../src/renderer/src/lib/pdfText'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'
const state = vi.hoisted(() => ({ changed: undefined as PdfTextRun | undefined, cancelled: false }))
vi.mock('../src/renderer/src/lib/fonts', () => ({
  bundledFonts: [],
  bundledFontData: async () => null,
  originalFontSelected: () => true
}))
vi.mock('../src/renderer/src/lib/fontFaces', () => ({ registerPreviewFont: vi.fn() }))
vi.mock('../src/renderer/src/lib/inlineText', () => ({
  inlinePlacement: () => null,
  requestInlineText: async (
    _source: PdfTextRun,
    initial: string,
    options: {
      onGeometryChange: (source: PdfTextRun | undefined) => void
      validate: (text: string, font: string) => Promise<string | null>
    }
  ) => {
    if (state.cancelled) return null
    options.onGeometryChange(state.changed)
    const error = await options.validate(initial, 'original')
    if (error) throw new Error(error)
    return initial
  }
}))
import { requestPdfText } from '../src/renderer/src/lib/textEditRequest'
const source: PdfTextRun = {
  key: '1:0',
  text: 'Original words',
  x: 72,
  y: 700,
  width: 120,
  size: 12,
  ascent: 10,
  descent: 2,
  angle: 0,
  fontFamily: 'Helvetica',
  textBox: { width: 120, lineHeight: 15 }
}
const placement = { page: {} as HTMLElement, matrix: [1, 0, 0, 1, 72, 92] }
afterEach(() => {
  vi.unstubAllGlobals()
  state.changed = undefined
  state.cancelled = false
})
const setup = (): void => {
  vi.stubGlobal('window', { api: { getSystemFonts: async () => [] } })
}
describe('confirmed text box geometry', () => {
  it('returns geometry for a text-unchanged edit without changing typography', async () => {
    setup()
    state.changed = { ...source, x: 100, textBox: { width: 80, lineHeight: 15 } }
    expect(await requestPdfText(source, source.text, undefined, placement)).toEqual({
      text: source.text,
      style: { sourceText: state.changed }
    })
    expect(source.x).toBe(72)
    expect(source.textBox!.width).toBe(120)
  })
  it('retains original removal bounds when an older edit has no maskTexts', async () => {
    setup()
    state.changed = { ...source, x: 100 }
    const annotation = { sourceText: source, text: source.text } as Annotation
    const result = await requestPdfText(source, source.text, annotation, placement)
    expect(result?.style.maskTexts).toEqual([source])
    expect(result?.style.sourceText?.x).toBe(100)
  })
  it('discards cancelled geometry and keeps an unchanged editor result empty', async () => {
    setup()
    expect((await requestPdfText(source, source.text, undefined, placement))?.style).toEqual({})
    state.changed = { ...source, x: 100 }
    state.cancelled = true
    expect(await requestPdfText(source, source.text, undefined, placement)).toBeNull()
  })
  it('validates original font availability when only geometry changes', async () => {
    setup()
    const unavailable = { ...source, fontFamily: 'UnavailableFont' }
    state.changed = { ...unavailable, x: 100 }
    await expect(requestPdfText(unavailable, source.text, undefined, placement)).rejects.toThrow(
      'No available font'
    )
  })
})
