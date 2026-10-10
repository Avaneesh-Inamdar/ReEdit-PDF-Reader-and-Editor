import { PDFDocument, rgb, StandardFonts, degrees, PDFName, PDFString, PDFNumber, breakTextIntoLines, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setCharacterSpacing, setWordSpacing } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { bundledFontData, originalFontSelected } from './fonts'
import { fontkitForPdfGlyphs } from './embeddedFont'
import type { Annotation } from '../stores/useAnnotationStore'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#','')
  const v = parseInt(m.length===3 ? m.split('').map(c=>c+c).join('') : m, 16)
  return { r: ((v>>16)&255)/255, g: ((v>>8)&255)/255, b: (v&255)/255 }
}

// WHY: spec requires serialized annotations as real PDF objects (editable), not flattened drawings.
// Flatten burns content; editable keeps Annots array. This function creates real Annot dictionaries via pdf-lib low-level.
function addPdfAnnotation(
  pdf: PDFDocument,
  pageIndex: number,
  subtype: string,
  rect: [number, number, number, number],
  dictEntries: Record<string, unknown>
): void {
  const page = pdf.getPages()[pageIndex]
  const context = pdf.context

  // build annot dict
  const dict: Record<string, unknown> = {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of(subtype),
    Rect: context.obj(rect.map(n => PDFNumber.of(n))),
    Border: context.obj([PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(1)]),
    C: context.obj([PDFNumber.of(1), PDFNumber.of(1), PDFNumber.of(0)]),
    ...dictEntries
  }

  // Wrap dictEntries that already are PDF objects — assume caller passes PDFObjects when needed
  const annotDict = context.obj(dict as never)
  const annotRef = context.register(annotDict)

  page.node.addAnnot(annotRef)
}

// Core baking: editable (default) creates Annot objects; flatten draws directly.
// WHY: spec §4 — save editable vs flattened distinct modes.
export async function bakeAnnotationsToPdf(
  data: ArrayBuffer,
  annotations: Annotation[],
  redactions: Annotation[],
  opts: { flatten?: boolean } = {}
): Promise<Uint8Array> {
  const flatten = opts.flatten ?? false
  const pdf = await PDFDocument.load(data)
  pdf.registerFontkit(fontkit)
  const pages = pdf.getPages()
  const fonts = new Map<string, Awaited<ReturnType<typeof pdf.embedFont>>>()
  for (const name of [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
    StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic,
    StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique, StandardFonts.Symbol, StandardFonts.ZapfDingbats]) {
    fonts.set(name, await pdf.embedFont(name))
  }
  const font = fonts.get(StandardFonts.Helvetica)!
  const resolveFont = (fam = '', bold = false, italic = false) => {
    if (fam === 'Symbol' || fam === 'ZapfDingbats') return fonts.get(fam)!
    const family = fam.toLowerCase()
    const weight = bold || family.includes('bold')
    const slant = italic || /italic|oblique/.test(family)
    const name = family.includes('times')
      ? weight ? slant ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold : slant ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman
      : family.includes('courier')
        ? weight ? slant ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold : slant ? StandardFonts.CourierOblique : StandardFonts.Courier
        : weight ? slant ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold : slant ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica
    return fonts.get(name)!
  }

  const customFonts = new Map<Uint8Array, Awaited<ReturnType<typeof pdf.embedFont>>>()
  const annotationFont = async (annotation: Annotation) => {
    const original = originalFontSelected(annotation) ? annotation.sourceText : undefined
    const data = annotation.fontData || original?.fontData || await bundledFontData(annotation.fontFamily || '', annotation.bold, annotation.italic)
    if (data) {
      let embedded = customFonts.get(data)
      if (!embedded) {
        pdf.registerFontkit(original?.fontData === data ? fontkitForPdfGlyphs(original.fontGlyphs, original.fontGlyphWidths) : fontkit)
        embedded = await pdf.embedFont(data, { subset: true })
        customFonts.set(data, embedded)
      }
      // Check coverage before saving, rather than silently producing missing glyphs.
      embedded.encodeText((annotation.text || '').replace(/[\r\n]/g, ''))
      return embedded
    }
    if (original && !Object.values(StandardFonts).includes(original.fontFamily as StandardFonts))
      throw new Error(`The PDF does not embed ${original.fontFamily}. Choose a bundled font or import the original font in Format.`)
    return resolveFont(annotation.fontFamily, annotation.bold, annotation.italic)
  }

  // For editable mode, create Annots; for flatten mode, draw directly (existing behavior)
  for (const anno of [...annotations, ...redactions]) {
    const pageIdx = anno.page - 1
    if (pageIdx < 0 || pageIdx >= pages.length) continue
    const page = pages[pageIdx]
    const { width, height } = page.getSize()
    const x = anno.x * width
    const y = height - (anno.y * height + anno.h * height)
    const w = anno.w * width
    const h = anno.h * height
    const col = hexToRgb(anno.color)
    const rect: [number, number, number, number] = [x, y, x + w, y + h]

    if (anno.sourceText) {
      const source = anno.sourceText
      if (anno.text) {
      const matrix = source.matrix || [Math.cos(source.angle), Math.sin(source.angle), -Math.sin(source.angle), Math.cos(source.angle)]
      const transformed = matrix.some((value, index) => Math.abs(value - [1, 0, 0, 1][index]) > 0.00001)
      page.pushOperators(pushGraphicsState())
      if (transformed) page.pushOperators(concatTransformationMatrix(matrix[0], matrix[1], matrix[2], matrix[3], source.x, source.y))
      page.pushOperators(setCharacterSpacing((source.characterSpacing || 0) * (anno.fontSize || source.size) / source.size), setWordSpacing((source.wordSpacing || 0) * (anno.fontSize || source.size) / source.size))
      page.drawText(anno.text, { x: transformed ? 0 : source.x, y: transformed ? 0 : source.y, size: anno.fontSize || source.size,
        lineHeight: anno.lineHeight || (anno.fontSize || source.size) * 1.2,
        font: await annotationFont(anno), color: rgb(col.r, col.g, col.b) })
      page.pushOperators(popGraphicsState())
      }
      continue
    }

    // If flatten requested, draw directly (burn into content stream)
    if (flatten) {
      if (anno.type === 'highlight') {
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(col.r, col.g, col.b), opacity: 0.35, borderWidth: 0 })
      } else if (anno.type === 'underline') {
        page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: Math.max(1, anno.strokeWidth), color: rgb(col.r, col.g, col.b), opacity: 1 })
      } else if (anno.type === 'strike') {
        const my = y + h/2
        page.drawLine({ start: { x, y: my }, end: { x: x + w, y: my }, thickness: Math.max(1, anno.strokeWidth), color: rgb(col.r, col.g, col.b), opacity: 1 })
      } else if (anno.type === 'rect') {
        page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(col.r, col.g, col.b), borderWidth: anno.strokeWidth, opacity: 0, borderOpacity: 1 })
      } else if (anno.type === 'ellipse') {
        page.drawEllipse({ x: x + w/2, y: y + h/2, xScale: w/2, yScale: h/2, borderColor: rgb(col.r, col.g, col.b), borderWidth: anno.strokeWidth, opacity: 0, borderOpacity: 1 })
      } else if (anno.type === 'draw' || anno.type === 'arrow') {
        if (!anno.points || anno.points.length < 2) continue
        const abs = anno.points.map(p => ({ x: x + p.x * w, y: y + h - p.y * h }))
        for (let i=0;i<abs.length-1;i++) page.drawLine({ start: abs[i], end: abs[i+1], thickness: anno.strokeWidth, color: rgb(col.r, col.g, col.b), opacity: 1 })
        if (anno.type === 'arrow' && abs.length >= 2) {
          const last = abs[abs.length-1], prev = abs[abs.length-2]
          const ang = Math.atan2(last.y - prev.y, last.x - prev.x)
          const len = 10
          page.drawLine({ start: last, end: { x: last.x - len*Math.cos(ang - 0.5), y: last.y - len*Math.sin(ang - 0.5) }, thickness: anno.strokeWidth, color: rgb(col.r, col.g, col.b), opacity: 1})
          page.drawLine({ start: last, end: { x: last.x - len*Math.cos(ang + 0.5), y: last.y - len*Math.sin(ang + 0.5) }, thickness: anno.strokeWidth, color: rgb(col.r, col.g, col.b), opacity: 1})
        }
      } else if (anno.type === 'note') {
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 0.95, 0.55), borderColor: rgb(0.9,0.7,0), borderWidth: 1, opacity: 1 })
        const text = (anno.text || 'Note').slice(0, 200)
        page.drawText(text, { x: x+4, y: y+h-14, size: 8, font, color: rgb(0.1,0.1,0.1), maxWidth: w-8, lineHeight: 10 })
      } else if (anno.type === 'text') {
        const text = anno.text || ''
        const col2 = hexToRgb(anno.color)
        const size = anno.fontSize || 12
        const f = await annotationFont(anno)
        page.drawText(text, { x, y: y + h - size, size, font: f, color: rgb(col2.r, col2.g, col2.b), maxWidth: w, lineHeight: size + 2 })
      } else if (anno.type === 'image') {
        const map = (globalThis as unknown as Record<string, unknown>).__imageMap as Record<string, { bytes: Uint8Array; mime: string }> | undefined
        const entry = anno.image || map?.[anno.id]
        if (entry) {
          try {
            const img = entry.mime.includes('png') ? await pdf.embedPng(entry.bytes) : await pdf.embedJpg(entry.bytes)
            page.drawImage(img, { x, y, width: w, height: h })
          } catch (error) { throw new Error(`Unable to embed image: ${String(error)}`) }
        }
      } else if (anno.type === 'redact') {
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(col.r, col.g, col.b), opacity: 1 })
      }
      continue
    }

    // Editable mode — create real Annot objects (interoperable with Acrobat)
    const ctx = pdf.context
    if (anno.type === 'highlight') {
      const quad: number[] = [x, y+h, x+w, y+h, x, y, x+w, y]
      addPdfAnnotation(pdf, pageIdx, 'Highlight', rect, {
        QuadPoints: ctx.obj(quad.map(n => PDFNumber.of(n))),
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        Contents: PDFString.of(anno.text || 'Highlight'),
        CA: PDFNumber.of(0.35),
      })
      // Also draw visual fallback for viewers that ignore quad? Keep minimal draw for thumbnail? Not needed.
    } else if (anno.type === 'underline') {
      addPdfAnnotation(pdf, pageIdx, 'Underline', rect, {
        QuadPoints: ctx.obj([x, y+h, x+w, y+h, x, y, x+w, y].map(n => PDFNumber.of(n))),
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        Contents: PDFString.of(anno.text || 'Underline'),
      })
    } else if (anno.type === 'strike') {
      addPdfAnnotation(pdf, pageIdx, 'StrikeOut', rect, {
        QuadPoints: ctx.obj([x, y+h, x+w, y+h, x, y, x+w, y].map(n => PDFNumber.of(n))),
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        Contents: PDFString.of(anno.text || 'StrikeOut'),
      })
    } else if (anno.type === 'rect') {
      addPdfAnnotation(pdf, pageIdx, 'Square', rect, {
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        Contents: PDFString.of('Square'),
        BS: ctx.obj({ W: PDFNumber.of(anno.strokeWidth), S: PDFName.of('S') } as never),
        IC: ctx.obj([] as never),
      })
    } else if (anno.type === 'ellipse') {
      addPdfAnnotation(pdf, pageIdx, 'Circle', rect, {
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        Contents: PDFString.of('Circle'),
        BS: ctx.obj({ W: PDFNumber.of(anno.strokeWidth), S: PDFName.of('S') } as never),
      })
    } else if (anno.type === 'draw' || anno.type === 'arrow') {
      // Ink annotation — list of strokes
      if (!anno.points || anno.points.length < 2) continue
      // Convert normalized path to absolute InkList
      const abs = anno.points.map(p => ({ x: x + p.x * w, y: y + h - p.y * h }))
      const inkList = [abs.flatMap(p => [PDFNumber.of(p.x), PDFNumber.of(p.y)])]
      addPdfAnnotation(pdf, pageIdx, 'Ink', rect, {
        InkList: ctx.obj([ctx.obj(inkList[0] as never)] as never),
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
        BS: ctx.obj({ W: PDFNumber.of(anno.strokeWidth), S: PDFName.of('S') } as never),
        Contents: PDFString.of(anno.type === 'arrow' ? 'Arrow' : 'Draw'),
      })
    } else if (anno.type === 'note') {
      addPdfAnnotation(pdf, pageIdx, 'Text', [x, y+h-16, x+16, y+h] as [number,number,number,number], {
        Contents: PDFString.of(anno.text || 'Note'),
        C: ctx.obj([PDFNumber.of(1), PDFNumber.of(0.95), PDFNumber.of(0.33)]),
        Name: PDFName.of('Comment'),
      })
      // also store rect for visual? Text annot icon at top-left.
    } else if (anno.type === 'text') {
      // FreeText annotation — visible text that is editable in Acrobat
      const size = anno.fontSize || 12
      const selectedFont = await annotationFont(anno)
      const lines = breakTextIntoLines(anno.text || '', [' '], Math.max(1, w - 8), text => selectedFont.widthOfTextAtSize(text, size))
      const textHeight = Math.max(h, lines.length * (size + 2) + 4)
      const commands = lines.map((line, index) => `1 0 0 1 4 ${textHeight - size - 2 - index * (size + 2)} Tm ${selectedFont.encodeText(line)} Tj`).join('\n')
      const appearance = ctx.register(ctx.flateStream(`q BT /F0 ${size} Tf ${col.r} ${col.g} ${col.b} rg ${commands} ET Q`, {
        Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, textHeight], Resources: { Font: { F0: selectedFont.ref } }
      }))
      addPdfAnnotation(pdf, pageIdx, 'FreeText', [x, y + h - textHeight, x + w, y + h], {
        AP: ctx.obj({ N: appearance }),
        Contents: PDFString.of(anno.text || ''),
        DA: PDFString.of(`${col.r.toFixed(2)} ${col.g.toFixed(2)} ${col.b.toFixed(2)} rg /Helv ${size} Tf`),
        C: ctx.obj([]),
      })
      // If flatten mode is true, the draw path below handles actual font embedding; for editable keep annot
      if (opts.flatten) {
        // already handled in flatten branch above – but ensure we also draw for visual when editable? Keep annot only
      }
    } else if (anno.type === 'redact') {
      // Redact annotation (spec) — visual box; true redaction requires applyRedactions
      addPdfAnnotation(pdf, pageIdx, 'Redact', rect, {
        Contents: PDFString.of('Redact'),
        IC: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)] as never),
      })
      // Also draw opaque box so flattened viewers see it
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(col.r, col.g, col.b), opacity: 1 })
    } else if (anno.type === 'image') {
      // Stamp-like: embed image as XObject then add Square annot that references it? Simpler: draw image as content (since image annot AP would need appearance stream)
      const map = (globalThis as unknown as Record<string, unknown>).__imageMap as Record<string, { bytes: Uint8Array; mime: string }> | undefined
      const entry = anno.image || map?.[anno.id]
      if (entry) {
        try {
          const img = entry.mime.includes('png') ? await pdf.embedPng(entry.bytes) : await pdf.embedJpg(entry.bytes)
          page.drawImage(img, { x, y, width: w, height: h })
        } catch {}
      }

    }
  }

  return await pdf.save()
}

// WHY: non-destructive text edit — mask original glyphs with precise whiteout + overlay new text.
// Leaves underlying image XObjects and unrelated text streams byte-identical because we only ADD drawing ops.
export async function nonDestructiveEditText(
  data: ArrayBuffer,
  pageNum: number,
  bbox: { xNorm: number; yNorm: number; wNorm: number; hNorm: number },
  newText: string,
  opts: { fontSize?: number; colorHex?: string } = {}
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const page = pdf.getPage(pageNum - 1)
  if (!page) throw new Error('page not found')
  const { width, height } = page.getSize()
  const x = bbox.xNorm * width
  const y = height - (bbox.yNorm * height + bbox.hNorm * height)
  const w = bbox.wNorm * width
  const h = bbox.hNorm * height
  // Check feasibility: if bbox is entire page or extremely large, refuse edit
  if (w > width * 0.95 && h > height * 0.8) {
    throw new Error('Text edit rejected: bounding box covers most of page — would risk corrupting nearby content. Try smaller selection.')
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const col = hexToRgb(opts.colorHex || '#000000')
  const size = opts.fontSize || 12
  // Precise whiteout — sized to original text bbox, not whole page
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1,1,1), opacity: 1, borderWidth: 0 })
  // Overlay new text within same bbox, left-aligned, vertically centered
  const textY = y + h - size - 2
  page.drawText(newText.slice(0, 500), { x: x + 2, y: Math.max(y, textY), size, font, color: rgb(col.r, col.g, col.b), maxWidth: w - 4, lineHeight: size + 2 })
  return await pdf.save()
}

// Redaction is applied by the isolated MuPDF worker, which removes original content.
export async function applyStrongRedaction(
  data: ArrayBuffer,
  redactions: {page: number; xNorm: number; yNorm: number; wNorm: number; hNorm: number; colorHex?: string}[]
): Promise<Uint8Array> {
  return window.api.removePdfContent(new Uint8Array(data), redactions.map(r => ({page:r.page,x:r.xNorm,y:r.yNorm,w:r.wNorm,h:r.hNorm})), true)
}
// Verification helper for non-destructive guarantee — checks page dims and image count unchanged
export async function verifyNonDestructive(
  originalBytes: Uint8Array,
  editedBytes: Uint8Array
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const orig = await PDFDocument.load(originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength) as ArrayBuffer)
    const edited = await PDFDocument.load(editedBytes.buffer.slice(editedBytes.byteOffset, editedBytes.byteOffset + editedBytes.byteLength) as ArrayBuffer)
    if (orig.getPageCount() !== edited.getPageCount()) return { ok: false, reason: `page count changed ${orig.getPageCount()} -> ${edited.getPageCount()}` }
    for (let i=0;i<orig.getPageCount();i++) {
      const a = orig.getPage(i).getSize()
      const b = edited.getPage(i).getSize()
      if (Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5) return { ok: false, reason: `page ${i+1} size changed` }
    }
    // Image count heuristic via raw byte search for /Subtype /Image
    const origStr = new TextDecoder('latin1').decode(originalBytes)
    const editedStr = new TextDecoder('latin1').decode(editedBytes)
    const countImages = (s: string): number => (s.match(/\/Subtype\s*\/Image/g) || []).length
    const ci = countImages(origStr), ce = countImages(editedStr)
    if (ci !== ce) return { ok: false, reason: `image count changed ${ci} -> ${ce}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
}

export async function insertBlankPage(data: ArrayBuffer, index: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const sz = pdf.getPage(0)?.getSize() ?? { width: 612, height: 792 }
  pdf.insertPage(index, [sz.width, sz.height])
  return await pdf.save()
}

export async function deletePages(data: ArrayBuffer, indices: number[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const sorted = [...indices].sort((a,b)=>b-a)
  for (const i of sorted) if (i>=0 && i<pdf.getPageCount()) pdf.removePage(i)
  return await pdf.save()
}

export async function rotatePages(data: ArrayBuffer, indices: number[], deg: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  for (const i of indices) {
    if (i>=0 && i<pdf.getPageCount()) {
      const page = pdf.getPage(i)
      const cur = page.getRotation().angle
      page.setRotation(degrees((cur + deg) % 360))
    }
  }
  return await pdf.save()
}

export async function mergePdfs(datas: ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const data of datas) {
    const doc = await PDFDocument.load(data)
    const copied = await merged.copyPages(doc, doc.getPageIndices())
    copied.forEach(p => merged.addPage(p))
  }
  return await merged.save()
}

export async function splitPdf(data: ArrayBuffer, pageIndices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(data)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pageIndices)
  copied.forEach(p=> out.addPage(p))
  return await out.save()
}

export async function addImageToPage(data: ArrayBuffer, imageBytes: Uint8Array, mime: string, pageNum: number, xNorm: number, yNorm: number, wNorm: number, hNorm: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const page = pdf.getPage(pageNum - 1)
  if (!page) throw new Error('page not found')
  const { width, height } = page.getSize()
  const x = xNorm * width
  const y = height - (yNorm * height + hNorm * height)
  const w = wNorm * width
  const h = hNorm * height
  let img
  if (mime.includes('png')) img = await pdf.embedPng(imageBytes)
  else img = await pdf.embedJpg(imageBytes)
  page.drawImage(img, { x, y, width: w, height: h })
  return await pdf.save()
}

export async function addTextToPage(data: ArrayBuffer, text: string, pageNum: number, xNorm: number, yNorm: number, fontSize: number, colorHex: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  const page = pdf.getPage(pageNum -1)
  if (!page) throw new Error('page not found')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const { width, height } = page.getSize()
  const x = xNorm * width
  const y = height - yNorm * height
  const col = hexToRgb(colorHex)
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(col.r, col.g, col.b) })
  return await pdf.save()
}

export async function reorderPages(data: ArrayBuffer, newOrder: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(data)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, newOrder)
  copied.forEach(p=> out.addPage(p))
  return await out.save()
}
