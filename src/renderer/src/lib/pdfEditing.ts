import { PDFDocument, rgb, StandardFonts, degrees, PDFName, PDFString, PDFNumber } from 'pdf-lib'
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

  // ensure page has Annots array
  const pageNodeAny = page.node as unknown as { get: (k: unknown)=> unknown; set: (k: unknown, v: unknown)=> void; has: (k: unknown)=> boolean }
  const annotsKey = PDFName.of('Annots')
  let annotsArray: unknown
  if (pageNodeAny.has(annotsKey)) {
    annotsArray = pageNodeAny.get(annotsKey)
  }
  if (annotsArray && typeof (annotsArray as { lookupMaybe?: unknown }).lookupMaybe === 'function') {
    // pdf-lib Annots is indirect ref to PDFArray
    try {
      const arr = context.lookup(annotsArray as never) as unknown as { push: (v: unknown)=> void }
      if (arr && typeof arr.push === 'function') arr.push(annotRef)
      else {
        const newArr = context.obj([annotRef])
        pageNodeAny.set(annotsKey, newArr)
      }
    } catch {
      const newArr = context.obj([annotRef])
      pageNodeAny.set(annotsKey, newArr)
    }
  } else {
    const newArr = context.obj([annotRef])
    pageNodeAny.set(annotsKey, newArr)
  }
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
  const pages = pdf.getPages()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontTimes = await pdf.embedFont(StandardFonts.TimesRoman)
  const fontTimesBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const fontCourier = await pdf.embedFont(StandardFonts.Courier)
  const resolveFont = (fam?: string, bold?: boolean) => {
    const f = (fam||'').toLowerCase()
    if (f.includes('times')) return bold ? fontTimesBold : fontTimes
    if (f.includes('courier')) return fontCourier
    return bold ? fontBold : font
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
        page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(col.r, col.g, col.b), borderWidth: anno.strokeWidth, opacity: 0, borderOpacity: 1 })
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
        const text = (anno.text || '').slice(0, 500)
        const col2 = hexToRgb(anno.color)
        const size = anno.fontSize || 12
        const f = resolveFont((anno as unknown as { fontFamily?: string }).fontFamily, (anno as unknown as { bold?: boolean }).bold)
        page.drawText(text, { x, y: y + h - size, size, font: f, color: rgb(col2.r, col2.g, col2.b), maxWidth: w, lineHeight: size + 2 })
      } else if (anno.type === 'image') {
        const map = (globalThis as unknown as Record<string, unknown>).__imageMap as Record<string, { bytes: Uint8Array; mime: string }> | undefined
        const entry = map?.[anno.id]
        if (entry) {
          try {
            const img = entry.mime.includes('png') ? await pdf.embedPng(entry.bytes) : await pdf.embedJpg(entry.bytes)
            page.drawImage(img, { x, y, width: w, height: h })
          } catch {}
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
      addPdfAnnotation(pdf, pageIdx, 'FreeText', rect, {
        Contents: PDFString.of(anno.text || ''),
        DA: PDFString.of(`${col.r.toFixed(2)} ${col.g.toFixed(2)} ${col.b.toFixed(2)} rg /Helv ${size} Tf`),
        C: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)]),
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
      const entry = map?.[anno.id]
      if (entry) {
        try {
          const img = entry.mime.includes('png') ? await pdf.embedPng(entry.bytes) : await pdf.embedJpg(entry.bytes)
          page.drawImage(img, { x, y, width: w, height: h })
        } catch {}
      }
      addPdfAnnotation(pdf, pageIdx, 'Square', rect, {
        Contents: PDFString.of('Image'),
        C: ctx.obj([PDFNumber.of(0.5), PDFNumber.of(0.5), PDFNumber.of(0.5)]),
      })
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

// Strong redaction: paint opaque box AND best-effort text removal via whiteout of same region.
// Spec notes this is not forensic-grade — full operator removal would need parsing q/Q and TJ arrays.
export async function applyStrongRedaction(
  data: ArrayBuffer,
  redactions: { page: number; xNorm: number; yNorm: number; wNorm: number; hNorm: number; colorHex?: string }[]
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data)
  for (const r of redactions) {
    const page = pdf.getPage(r.page - 1)
    if (!page) continue
    const { width, height } = page.getSize()
    const x = r.xNorm * width
    const y = height - (r.yNorm * height + r.hNorm * height)
    const w = r.wNorm * width
    const h = r.hNorm * height
    const col = hexToRgb(r.colorHex || '#000000')
    // First whiteout (removes visual underlay) then opaque black cover
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1,1,1), opacity: 1 })
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(col.r, col.g, col.b), opacity: 1 })
    // Also add Redact annot for interoperability
    try {
      const ctx = pdf.context
      const rect: [number,number,number,number] = [x, y, x+w, y+h]
      const annotDict = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Redact'),
        Rect: ctx.obj(rect.map(n=> PDFNumber.of(n))),
        QuadPoints: ctx.obj([x, y+h, x+w, y+h, x, y, x+w, y].map(n=> PDFNumber.of(n))),
        IC: ctx.obj([PDFNumber.of(col.r), PDFNumber.of(col.g), PDFNumber.of(col.b)] as never),
        Contents: PDFString.of('Redacted'),
      } as never)
      const ref = ctx.register(annotDict)
      const pageNodeAny = page.node as unknown as { get: (k: unknown)=> unknown; set: (k: unknown, v: unknown)=> void; has: (k: unknown)=> boolean }
      const key = PDFName.of('Annots')
      if (pageNodeAny.has(key)) {
        try {
          const arr = ctx.lookup(pageNodeAny.get(key) as never) as unknown as { push: (v: unknown)=> void }
          arr.push(ref)
        } catch {
          pageNodeAny.set(key, ctx.obj([ref]))
        }
      } else {
        pageNodeAny.set(key, ctx.obj([ref]))
      }
    } catch {}
  }
  return await pdf.save()
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
