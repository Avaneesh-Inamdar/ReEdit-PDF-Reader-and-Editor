import '../assets/fonts/fonts.css'
import type { Annotation } from '../stores/useAnnotationStore'

const assets = import.meta.glob('../assets/fonts/*.woff', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>
export const bundledFonts = [
  ['Lato', 'lato'],
  ['Libre Baskerville', 'libre-baskerville'],
  ['Noto Sans', 'noto-sans'],
  ['Noto Serif', 'noto-serif'],
  ['Open Sans', 'open-sans'],
  ['Roboto', 'roboto'],
  ['Source Code Pro', 'source-code-pro'],
  ['Ubuntu', 'ubuntu']
] as const
export const standardFonts = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique'
]
const bytes = new Map<string, Promise<Uint8Array>>()
export async function bundledFontData(
  family: string,
  bold = false,
  italic = false
): Promise<Uint8Array | null> {
  const entry = bundledFonts.find(([name]) => name === family)
  if (!entry) return null
  const path = `../assets/fonts/${entry[1]}-latin-${bold ? 700 : 400}-${italic ? 'italic' : 'normal'}.woff`
  const url = assets[path]
  if (!url)
    throw new Error(`The ${family} font does not include this weight/style. Choose another style.`)
  if (!bytes.has(path))
    bytes.set(
      path,
      fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load ${family}`)
        return new Uint8Array(await response.arrayBuffer())
      })
    )
  return bytes.get(path)!
}
export function originalFontSelected(annotation: Annotation): boolean {
  const source = annotation.sourceText
  return (
    !!source &&
    annotation.fontFamily === source.fontFamily &&
    !!annotation.bold === !!source.bold &&
    !!annotation.italic === !!source.italic
  )
}
export function previewFont(annotation: Annotation): string {
  if (annotation.fontData && annotation.previewFont) return annotation.previewFont
  if (originalFontSelected(annotation) && annotation.sourceText?.previewFont)
    return annotation.sourceText.previewFont
  if (annotation.fontFamily?.includes('Times')) return 'Times New Roman'
  if (annotation.fontFamily?.includes('Courier')) return 'Courier New'
  if (annotation.fontFamily?.includes('Helvetica')) return 'Arial'
  return annotation.fontFamily || 'Arial'
}
export function previewSpaceAdjustment(annotation: Annotation): number {
  const source = annotation.sourceText
  if (
    !originalFontSelected(annotation) ||
    !source?.fontData ||
    source.fontGlyphWidths?.[' '] === undefined
  )
    return 0
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return 0
  const size = annotation.fontSize || source.size
  context.font = `${size}px "${source.previewFont}"`
  return (source.fontGlyphWidths[' '] * size) / 1000 - context.measureText(' ').width
}
