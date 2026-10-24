import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PdfTextRun } from './pdfText'
import type { Annotation } from '../stores/useAnnotationStore'
import { requestText } from './requestText'
import { bundledFonts, bundledFontData, originalFontSelected } from './fonts'
import { fontkitForPdfGlyphs } from './embeddedFont'
import { registerPreviewFont } from './fontFaces'
import { inlinePlacement, requestInlineText } from './inlineText'
import { alternativeFontLabel, suggestedFont } from './fontAlternatives'
import { matchingSystemFonts } from './fontMatching'

export async function requestPdfText(
  source: PdfTextRun | undefined,
  initial: string,
  annotation?: Annotation,
  placement?: { page: HTMLElement; matrix: number[] },
  selectedRange?: { start: number; end: number }
): Promise<{ text: string; style: Partial<Annotation> } | null> {
  const system = await window.api.getSystemFonts().catch(() => [])
  const suggested = suggestedFont(annotation?.fontFamily || source?.fontFamily || '')
  let selection = 'original',
    selectedBytes: Uint8Array | undefined
  let resolvedStyle: Partial<Annotation> = {}
  let geometryStyle: Partial<Annotation> = {}
  const bold = annotation?.bold ?? source?.bold,
    italic = annotation?.italic ?? source?.italic
  const fits = (bytes: Uint8Array, value: string, original = false): boolean => {
    try {
      return !(
        original ? fontkitForPdfGlyphs(source?.fontGlyphs, source?.fontGlyphWidths) : fontkit
      )
        .create(bytes)
        .layout(value.replace(/[\r\n]/g, ''))
        .glyphs.some((glyph) => glyph.id === 0)
    } catch {
      return false
    }
  }
  const resolved = new Map<string, Promise<{ family: string; data: Uint8Array; preview: string }>>()
  const fontBytes = new Map<string, Promise<Uint8Array | null>>()
  const cachedBytes = (
    key: string,
    load: () => Promise<Uint8Array | null>
  ): Promise<Uint8Array | null> => {
    if (!fontBytes.has(key))
      fontBytes.set(
        key,
        load().catch(() => null)
      )
    return fontBytes.get(key)!
  }
  const fallback = async (
    value: string
  ): Promise<{ family: string; data: Uint8Array; preview: string }> => {
    const family = annotation?.fontFamily || source?.fontFamily || ''
    const choices = [
      ...matchingSystemFonts(system, family, !!bold, !!italic).map((font) => ({
        family: font.family,
        load: () => cachedBytes('system:' + font.id, () => window.api.readSystemFont(font.id))
      })),
      ...[
        family,
        suggestedFont(family),
        /courier|mono|consolas/i.test(family)
          ? 'Source Code Pro'
          : /times|serif|minion|cambria/i.test(family) && !/sans/i.test(family)
            ? 'Source Serif 4'
            : 'Source Sans 3',
        'Noto Sans',
        'Noto Serif'
      ]
        .filter((name, index, names): name is string => !!name && names.indexOf(name) === index)
        .map((name) => ({
          family: name,
          load: () => cachedBytes(name, () => bundledFontData(name, bold, italic))
        }))
    ]
    for (const choice of choices) {
      try {
        const data = await choice.load()
        if (!data || !fits(data, value)) continue
        const preview = await registerPreviewFont(data, !!bold, !!italic)
        return { family: choice.family, data, preview: preview.name }
      } catch {
        /* A bad installed font must not block bundled alternatives. */
      }
    }
    throw new Error(
      'No available font covers these characters. Import a font for this language in Format.'
    )
  }
  const replacement = async (
    value: string
  ): Promise<{ family: string; data: Uint8Array; preview: string }> => {
    const key = value.replace(/[\r\n]/g, '')
    if (!resolved.has(key)) {
      if (resolved.size >= 4) resolved.delete(resolved.keys().next().value!)
      resolved.set(key, fallback(value))
    }
    return resolved.get(key)!
  }
  const choices = [
    {
      id: 'original',
      name:
        'Keep current font' +
        (annotation?.fontFamily || source?.fontFamily
          ? ' · ' + (annotation?.fontFamily || source?.fontFamily)
          : '')
    },
    ...bundledFonts.map(([name]) => ({
      id: 'bundled:' + name,
      name: alternativeFontLabel(name) + (name === suggested ? ' · suggested' : '')
    })),
    ...system.map((font) => ({ id: 'system:' + font.id, name: font.name + ' · installed' }))
  ]
  const options = {
    onGeometryChange: (changed: PdfTextRun | undefined) => {
      if (!changed) {
        geometryStyle = {}
        return
      }
      geometryStyle = {
        sourceText: changed,
        ...(annotation && !annotation.maskTexts && source ? { maskTexts: [source] } : {})
      }
    },
    fonts: choices,
    selectedRange,
    onFontChange: (id: string) => {
      selection = id
    },
    validate: async (value: string, id: string) => {
      resolvedStyle = {}
      if (id === 'original' && value === initial && !geometryStyle.sourceText) return null
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
          if (shaped.glyphs.some((glyph) => glyph.id === 0)) {
            if (id !== 'original')
              return 'This font does not cover these characters. Choose another font.'
            bytes = undefined
          }
        } catch {
          if (id !== 'original') return 'This font cannot encode the text. Choose another font.'
          bytes = undefined
        }
        if (bytes) {
          selectedBytes = id === 'original' ? undefined : bytes
          return null
        }
      }
      const name = annotation?.fontFamily || source?.fontFamily || 'Helvetica'
      try {
        if (annotation?.fontData || source?.fontData)
          throw new Error('Embedded subset lacks these glyphs')
        if (!Object.values(StandardFonts).includes(name as StandardFonts))
          throw new Error('External font')
        const pdf = await PDFDocument.create(),
          font = await pdf.embedFont(name as StandardFonts)
        font.encodeText(value.replace(/[\r\n]/g, ''))
        return null
      } catch {
        try {
          const match = await replacement(value)
          resolvedStyle = {
            fontFamily: match.family,
            fontData: match.data,
            previewFont: match.preview,
            bold,
            italic
          }
          return null
        } catch (error) {
          return String(error instanceof Error ? error.message : error)
        }
      }
    },
    preview: async (value: string, id: string) => {
      if (id === 'original') {
        const original =
          annotation?.fontData ||
          (annotation && !originalFontSelected(annotation)
            ? await bundledFontData(annotation.fontFamily || '', bold, italic)
            : source?.fontData)
        if (
          original &&
          fits(
            original,
            value,
            !annotation?.fontData && (!annotation || originalFontSelected(annotation))
          )
        )
          return {
            fontFamily:
              annotation?.previewFont || source?.previewFont || source?.fontFamily || 'Helvetica',
            notice: ''
          }
        const family = annotation?.fontFamily || source?.fontFamily || 'Helvetica'
        if (!original && Object.values(StandardFonts).includes(family as StandardFonts))
          return { fontFamily: family, notice: '' }
        const match = await replacement(value)
        return {
          fontFamily: match.preview,
          notice: `Using ${match.family} to match the original font. Size and color are preserved.`
        }
      }
      const installed = system.find((font) => 'system:' + font.id === id)
      const bytes = id.startsWith('system:')
        ? await window.api.readSystemFont(id.slice(7))
        : await bundledFontData(id.slice(8), bold, italic)
      if (!bytes) return { fontFamily: id.slice(8), notice: '' }
      const face = await registerPreviewFont(
        bytes,
        installed?.bold ?? !!bold,
        installed?.italic ?? !!italic
      )
      return { fontFamily: face.name, notice: '' }
    }
  }
  const text =
    source && (placement || inlinePlacement(source))
      ? await requestInlineText(source, initial, options, annotation, placement)
      : await requestText('Edit PDF text', initial, options)
  if (text === null) return null
  if (selection === 'original') return { text, style: { ...resolvedStyle, ...geometryStyle } }
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
      ...geometryStyle,
      fontFamily: family,
      fontData: preview?.data,
      previewFont: preview?.name,
      bold: installed?.bold ?? annotation?.bold ?? source?.bold,
      italic: installed?.italic ?? annotation?.italic ?? source?.italic
    }
  }
}
