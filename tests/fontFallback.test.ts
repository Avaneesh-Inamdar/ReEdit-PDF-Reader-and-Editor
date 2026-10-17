import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PdfTextRun } from '../src/renderer/src/lib/pdfText'
const state = vi.hoisted(() => ({
  bytes: new Uint8Array(),
  value: 'Longer replacement',
  systems: [] as { id: string; name: string; family: string; bold: boolean; italic: boolean }[]
}))
vi.mock('../src/renderer/src/lib/fonts', () => ({
  bundledFonts: [['Source Sans 3', 'source-sans-3']],
  bundledFontData: vi.fn(async (name: string) => (name === 'Source Sans 3' ? state.bytes : null)),
  originalFontSelected: () => true
}))
vi.mock('../src/renderer/src/lib/fontFaces', () => ({
  registerPreviewFont: vi.fn(async (data: Uint8Array) => ({ data, name: 'TestPreview' }))
}))
vi.mock('../src/renderer/src/lib/inlineText', () => ({
  inlinePlacement: () => null,
  requestInlineText: vi.fn()
}))
vi.mock('../src/renderer/src/lib/requestText', () => ({
  requestText: async (
    _title: string,
    _initial: string,
    options: { validate: (text: string, id: string) => Promise<string | null> }
  ) => {
    const error = await options.validate(state.value, 'original')
    if (error) throw new Error(error)
    return state.value
  }
}))
import { requestPdfText } from '../src/renderer/src/lib/textEditRequest'
const source: PdfTextRun = {
  key: '1:0',
  text: 'Old word',
  x: 20,
  y: 500,
  width: 90,
  size: 12,
  ascent: 10,
  descent: 2,
  angle: 0,
  fontFamily: 'MissingCommercialFont',
  color: '#992233'
}
afterEach(() => vi.unstubAllGlobals())
function setup(): void {
  state.bytes = new Uint8Array(
    readFileSync('src/renderer/src/assets/fonts/source-sans-3-400-normal.otf')
  )
  state.systems = []
  state.value = 'Longer replacement'
  vi.stubGlobal('window', {
    api: { getSystemFonts: async () => state.systems, readSystemFont: async () => state.bytes }
  })
}
describe('automatic original-font resolution', () => {
  it('replaces an unavailable commercial face with a real bundled font instead of blocking the edit', async () => {
    setup()
    const result = await requestPdfText(source, source.text)
    expect(result?.style.fontFamily).toBe('Source Sans 3')
    expect(result?.style.fontData?.length).toBeGreaterThan(10000)
    expect(result?.style.fontSize).toBeUndefined()
    expect(result?.style.color).toBeUndefined()
  })
  it('uses a matching installed family before a bundled alternative', async () => {
    setup()
    state.systems = [
      {
        id: 'installed-font',
        name: 'MissingCommercialFont',
        family: 'MissingCommercialFont',
        bold: false,
        italic: false
      }
    ]
    expect((await requestPdfText(source, source.text))?.style.fontFamily).toBe(
      'MissingCommercialFont'
    )
  })
  it('recovers from an unusable embedded font and preserves a usable embedded font', async () => {
    setup()
    expect(
      (await requestPdfText({ ...source, fontData: new Uint8Array([0, 1, 2]) }, source.text))?.style
        .fontFamily
    ).toBe('Source Sans 3')
    expect(
      (await requestPdfText({ ...source, fontData: state.bytes }, source.text))?.style
    ).toEqual({})
  })
  it('does not replace the original just because an unchanged edit box was opened', async () => {
    setup()
    state.value = source.text
    expect((await requestPdfText(source, source.text))?.style).toEqual({})
  })
})
