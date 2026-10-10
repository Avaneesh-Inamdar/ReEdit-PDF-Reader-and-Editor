import { OPS, type PDFPageProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import { textRun, type PdfTextRun } from './pdfText'
import { mapPdfGlyphs } from './fontEncoding'

interface FontInfo {
  name?: string
  loadedName?: string
  data?: Uint8Array
  bold?: boolean
  italic?: boolean
  toFontChar?: (number | string)[]
  toUnicode?: { _map?: (number | string)[] }
}
interface Glyph {
  unicode?: string
  fontChar?: string
  width?: number
}
interface Style {
  font: string
  color: string
  size: number
  characterSpacing: number
  wordSpacing: number
}
const cachedPages: PDFPageProxy[] = []
const pages = new WeakMap<
  PDFPageProxy,
  Promise<{
    characters: { value: string; style: Style }[]
    glyphs: Map<string, Record<string, string>>
    widths: Map<string, Record<string, number>>
    extended: Set<string>
  }>
>()

// PDF text extraction omits color and uses generic font families. Read the drawing
// operators too, retaining the exact font that PDF.js uses to paint the document.
async function styles(page: PDFPageProxy) {
  let cached = pages.get(page)
  if (!cached) {
    cached = page.getOperatorList().then((operators) => {
      let current: Style = {
        font: '',
        color: '#000000',
        size: 1,
        characterSpacing: 0,
        wordSpacing: 0
      }
      const stack: Style[] = []
      const characters: { value: string; style: Style }[] = []
      const glyphs = new Map<string, Record<string, string>>()
      const widths = new Map<string, Record<string, number>>()
      for (let i = 0; i < operators.fnArray.length; i++) {
        const operation = operators.fnArray[i],
          args = operators.argsArray[i]
        if (operation === OPS.save) stack.push({ ...current })
        else if (operation === OPS.restore) current = stack.pop() || current
        else if (operation === OPS.setFont)
          current = { ...current, font: args[0], size: Math.abs(args[1]) || 1 }
        else if (operation === OPS.setCharSpacing)
          current = { ...current, characterSpacing: args[0] }
        else if (operation === OPS.setWordSpacing) current = { ...current, wordSpacing: args[0] }
        else if (operation === OPS.setFillRGBColor)
          current = {
            ...current,
            color:
              '#' +
              Array.from(args as number[])
                .map((value) => Math.round(value).toString(16).padStart(2, '0'))
                .join('')
          }
        else if (
          operation === OPS.showText ||
          operation === OPS.showSpacedText ||
          operation === OPS.nextLineShowText ||
          operation === OPS.nextLineSetSpacingShowText
        ) {
          const values = args.find((value: unknown) => Array.isArray(value)) as
            (Glyph | number)[] | undefined
          if (!values) continue
          const encoding = glyphs.get(current.font) || {}
          glyphs.set(current.font, encoding)
          const advances = widths.get(current.font) || {}
          widths.set(current.font, advances)
          for (const value of values) {
            if (typeof value !== 'object' || !value.unicode) continue
            if (value.fontChar) encoding[value.unicode] = value.fontChar
            if (value.width !== undefined) advances[value.unicode] = value.width
            for (const character of value.unicode.normalize('NFKC')) {
              if (!/\s/.test(character)) characters.push({ value: character, style: current })
            }
          }
        }
      }
      return { characters, glyphs, widths, extended: new Set<string>() }
    })
    pages.set(page, cached)
    cachedPages.push(page)
    if (cachedPages.length > 24) pages.delete(cachedPages.shift()!)
    cached.catch(() => pages.delete(page))
  }
  return cached
}

export async function styledTextRuns(
  page: PDFPageProxy,
  content: TextContent,
  pageNumber: number
): Promise<Map<number, PdfTextRun>> {
  const drawing = await styles(page)
  let position = 0
  const runs = new Map<number, PdfTextRun>()
  for (let index = 0; index < content.items.length; index++) {
    const item = content.items[index]
    if (!('str' in item)) continue
    const run = textRun(item, content.styles[item.fontName] || {}, `${pageNumber}:${index}`)
    if (!run) continue
    const text = item.str.normalize('NFKC').replace(/\s/g, '')
    const length = Array.from(text).length
    const candidate = drawing.characters.slice(position, position + length)
    if (candidate.map((character) => character.value).join('') === text) {
      run.color = candidate[0]?.style.color || '#000000'
      run.characterSpacing =
        ((candidate[0]?.style.characterSpacing || 0) * run.size) /
        (candidate[0]?.style.size || run.size)
      run.wordSpacing =
        ((candidate[0]?.style.wordSpacing || 0) * run.size) / (candidate[0]?.style.size || run.size)
      position += length
    }
    try {
      const font = page.commonObjs.get(item.fontName) as FontInfo
      const name = (font.name || run.fontFamily).replace(/^[A-Z]{6}\+/, '')
      run.fontFamily = name
      run.bold = !!font.bold || /bold|black|heavy|semibold/i.test(name)
      run.italic = !!font.italic || /italic|oblique/i.test(name)
      if (font.data?.length) {
        run.fontData = font.data
        run.previewFont = font.loadedName
        const encoding = drawing.glyphs.get(item.fontName) || {}
        if (!drawing.extended.has(item.fontName))
          font.toUnicode?._map?.forEach((unicode, code) => {
            const mapped = font.toFontChar?.[code]
            if (unicode !== undefined && mapped !== undefined)
              encoding[typeof unicode === 'number' ? String.fromCodePoint(unicode) : unicode] =
                typeof mapped === 'number' ? String.fromCodePoint(mapped) : mapped
          })
        drawing.extended.add(item.fontName)
        run.fontGlyphs = encoding
        run.fontGlyphWidths = drawing.widths.get(item.fontName)
      }
    } catch {
      /* Non-embedded fonts still retain the extracted metrics. */
    }
    runs.set(index, run)
  }
  return runs
}

export function encodedPreview(text: string, glyphs?: Record<string, string>): string {
  if (!glyphs) return text
  return mapPdfGlyphs(text, glyphs, true)
}
