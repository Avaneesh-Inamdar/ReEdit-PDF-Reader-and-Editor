import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PdfTextRun } from './pdfText'
import type { Annotation } from '../stores/useAnnotationStore'
import { requestText } from './requestText'
import { bundledFonts, bundledFontData, originalFontSelected } from './fonts'
import { fontkitForPdfGlyphs } from './embeddedFont'
import { registerPreviewFont } from './fontFaces'

export async function requestPdfText(
  source: PdfTextRun | undefined,
  initial: string,
  annotation?: Annotation
): Promise<{ text: string; style: Partial<Annotation> } | null> {
  const system = await window.api.getSystemFonts().catch(() => [])
  let selection = 'original',
    selectedBytes: Uint8Array | undefined
  const choices = [
    {
      id: 'original',
      name:
        'Keep current font' +
        (annotation?.fontFamily || source?.fontFamily
          ? ' · ' + (annotation?.fontFamily || source?.fontFamily)
          : '')
    },
    ...bundledFonts.map(([name]) => ({ id: 'bundled:' + name, name })),
    ...system.map((font) => ({ id: 'system:' + font.id, name: font.name + ' · installed' }))
  ]
  const text = await requestText('Edit PDF text', initial, {
    fonts: choices,
    onFontChange: (id) => {
      selection = id
    },
    validate: async (value, id) => {
      if (!value.trim()) return null
      let bytes: Uint8Array | undefined
      if (id.startsWith('bundled:'))
        bytes =
          (await bundledFontData(
            id.slice(8),
            annotation?.bold ?? source?.bold,
            annotation?.italic ?? source?.italic
          )) || undefined
      else if (id.startsWith('system:')) bytes = await window.api.readSystemFont(id.slice(7))
      else
        bytes =
          annotation?.fontData ||
          (annotation && !originalFontSelected(annotation)
            ? (await bundledFontData(
                annotation.fontFamily || '',
                annotation.bold,
                annotation.italic
              )) || undefined
            : source?.fontData)
      if (bytes) {
        const adapter =
          id === 'original' &&
          !annotation?.fontData &&
          (!annotation || originalFontSelected(annotation))
            ? fontkitForPdfGlyphs(source?.fontGlyphs, source?.fontGlyphWidths)
            : fontkit
        try {
          const shaped = adapter.create(bytes).layout(value.replace(/[\r\n]/g, ''))
          if (shaped.glyphs.some((glyph) => glyph.id === 0))
            return 'This font is missing one or more characters. Select a full bundled or installed font above.'
        } catch {
          return 'The current font cannot encode this text. Select a full bundled or installed font above.'
        }
        selectedBytes = id === 'original' ? undefined : bytes
        return null
      }
      const name = annotation?.fontFamily || source?.fontFamily || 'Helvetica'
      if (!Object.values(StandardFonts).includes(name as StandardFonts))
        return 'The PDF does not embed this font. Choose a bundled or installed font above.'
      try {
        const pdf = await PDFDocument.create(),
          font = await pdf.embedFont(name as StandardFonts)
        font.encodeText(value.replace(/[\r\n]/g, ''))
        return null
      } catch {
        return 'This font does not contain these characters. Choose a bundled or installed font above.'
      }
    }
  })
  if (text === null) return null
  if (selection === 'original') return { text, style: {} }
  const installed = system.find((font) => 'system:' + font.id === selection)
  const family = installed?.name || selection.slice(8)
  const preview = selectedBytes
    ? await registerPreviewFont(
        selectedBytes,
        installed?.bold ?? annotation?.bold ?? source?.bold,
        installed?.italic ?? annotation?.italic ?? source?.italic
      )
    : undefined
  return {
    text,
    style: {
      fontFamily: family,
      fontData: preview?.data,
      previewFont: preview?.name,
      bold: installed?.bold ?? annotation?.bold ?? source?.bold,
      italic: installed?.italic ?? annotation?.italic ?? source?.italic
    }
  }
}
