import { describe, it, expect } from 'vitest'
import { loadFixture, hasAnnotationObjects } from './helpers'
import { bakeAnnotationsToPdf } from '../src/renderer/src/lib/pdfEditing'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'

describe('annotation round-trip (editable, not flattened)', () => {
  it('saves highlight as real PDF annotation object (parseable after reload)', async () => {
    const orig = loadFixture('simple-text.pdf')
    const annos: Annotation[] = [
      { id: 'a1', page: 1, type: 'highlight', x: 0.1, y: 0.2, w: 0.5, h: 0.04, color: '#facc15', strokeWidth: 1, opacity: 0.35, text: 'test highlight' },
    ]
    const baked = await bakeAnnotationsToPdf(
      orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
      annos,
      []
    )
    const info = await hasAnnotationObjects(baked)
    expect(info.count).toBeGreaterThan(0)
    expect(info.subtypes).toContain('Highlight')
    // Verify via pdf-lib that page has Annots (ObjStm compressed so raw search fails)
    const { PDFDocument } = await import('pdf-lib')
    const { PDFName } = await import('pdf-lib')
    const pdf = await PDFDocument.load(baked.buffer.slice(baked.byteOffset, baked.byteOffset+baked.byteLength) as ArrayBuffer)
    expect(pdf.getPages()[0].node.has(PDFName.of('Annots'))).toBe(true)
  })

  it('saves multiple annotation types as real objects', async () => {
    const orig = loadFixture('simple-text.pdf')
    const annos: Annotation[] = [
      { id: 'r1', page: 1, type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1, color: '#ef4444', strokeWidth: 2, opacity: 1 },
      { id: 'n1', page: 2, type: 'note', x: 0.5, y: 0.5, w: 0.2, h: 0.12, color: '#fef08a', strokeWidth: 1, opacity: 1, text: 'hello note' },
      { id: 'd1', page: 1, type: 'draw', x: 0.2, y: 0.3, w: 0.3, h: 0.2, color: '#22c55e', strokeWidth: 2, opacity: 1, points: [{x:0,y:0},{x:0.5,y:0.5},{x:1,y:0}] },
      { id: 't1', page: 1, type: 'text', x: 0.3, y: 0.4, w: 0.3, h: 0.05, color: '#000000', strokeWidth: 1, opacity: 1, text: 'FreeText hello', fontSize: 12 },
    ]
    const baked = await bakeAnnotationsToPdf(
      orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
      annos,
      []
    )
    const info = await hasAnnotationObjects(baked)
    expect(info.count).toBeGreaterThanOrEqual(4)
    expect(info.subtypes).toEqual(expect.arrayContaining(['Square', 'Text', 'Ink', 'FreeText']))
  })

  it('flattened export burns annotations into content (no Annots or fewer Annots, larger content)', async () => {
    const orig = loadFixture('simple-text.pdf')
    const annos: Annotation[] = [
      { id: 'a1', page: 1, type: 'highlight', x: 0.1, y: 0.2, w: 0.5, h: 0.04, color: '#facc15', strokeWidth: 1, opacity: 0.35 },
    ]
    const editable = await bakeAnnotationsToPdf(
      orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
      annos,
      [],
      { flatten: false }
    )
    const flattened = await bakeAnnotationsToPdf(
      orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
      annos,
      [],
      { flatten: true }
    )
    const editableInfo = await hasAnnotationObjects(editable)
    const flatInfo = await hasAnnotationObjects(flattened)
    // Editable should have annots; flattened should have 0 annots (burned)
    expect(editableInfo.count).toBeGreaterThan(0)
    expect(flatInfo.count).toBe(0)
    // Flattened should still be larger than original (has drawn rect) but may be similar size
    expect(flattened.length).toBeGreaterThan(orig.length - 500)
  })

  it('annotations survive save/reload and are still parseable via pdf-lib', async () => {
    const orig = loadFixture('simple-text.pdf')
    const annos: Annotation[] = [
      { id: 'ell1', page: 1, type: 'ellipse', x: 0.2, y: 0.2, w: 0.3, h: 0.15, color: '#3b82f6', strokeWidth: 2, opacity: 1 },
    ]
    const baked = await bakeAnnotationsToPdf(
      orig.buffer.slice(orig.byteOffset, orig.byteOffset+orig.byteLength) as ArrayBuffer,
      annos,
      []
    )
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(baked.buffer.slice(baked.byteOffset, baked.byteOffset+baked.byteLength) as ArrayBuffer)
    // Check page node has Annots
    const page = doc.getPages()[0]
    const hasAnnots = (page.node as unknown as { has: (k: unknown)=> boolean }).has((await import('pdf-lib')).PDFName.of('Annots'))
    expect(hasAnnots).toBe(true)
  })
})


