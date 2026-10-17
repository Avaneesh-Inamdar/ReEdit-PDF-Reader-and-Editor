import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFString } from 'pdf-lib'
import { usePdfStore } from '../src/renderer/src/stores/usePdfStore'
import { useFormStore } from '../src/renderer/src/stores/useFormStore'
import { connectedTextLine, lineSource, lineText } from '../src/renderer/src/lib/textLine'
import { fontIdentity, matchingSystemFonts } from '../src/renderer/src/lib/fontMatching'
import { removeDocumentAnnotation } from '../src/renderer/src/lib/documentObjects'
import type { PdfTextRun } from '../src/renderer/src/lib/pdfText'
import { securityPermissions } from '../src/renderer/src/lib/securityProperties'
import { PermissionFlag } from 'pdfjs-dist'
import { mergeRecognizedWords, ocrLuminance } from '../src/renderer/src/lib/ocrRecognition'

const run = (text: string, x: number, key: string, y = 500): PdfTextRun => ({
  key,
  text,
  x,
  y,
  width: text.length * 6,
  size: 12,
  ascent: 10,
  descent: 2,
  angle: 0,
  fontFamily: 'Arial',
  color: '#222'
})
describe('connected text editing', () => {
  it('edits all four connected words together instead of overprinting following words', () => {
    const runs = [
      run('one', 20, '1:0'),
      run('two', 42, '1:1'),
      run('three', 64, '1:2'),
      run('four', 98, '1:3'),
      run('Other column', 300, '1:4'),
      run('Next line', 20, '1:5', 480)
    ]
    const group = connectedTextLine(runs[0], runs)
    expect(lineText(group)).toBe('one two three four')
    expect(group).toHaveLength(4)
    expect(lineSource(group).width).toBe(102)
  })
  it('keeps rotated, differently styled, and independent annotation text separate', () => {
    const first = run('one', 20, '1:0'),
      second = { ...run('two', 42, '1:1'), fontFamily: 'Times-Roman' }
    expect(connectedTextLine(first, [first, second])).toEqual([first])
    expect(connectedTextLine({ ...first, pdfAnnotationId: '42R' }, [first, second])).toHaveLength(1)
  })
  it('matches PDF subset/full font names without selecting the wrong weight', () => {
    expect(fontIdentity('ABCDEF+Arial-BoldMT')).toBe('arial')
    const regular = { name: 'ArialMT', family: 'Arial', bold: false, italic: false },
      bold = { name: 'Arial-BoldMT', family: 'Arial', bold: true, italic: false }
    expect(matchingSystemFonts([regular, bold], 'ABCDEF+Arial-BoldMT', true)).toEqual([
      bold,
      regular
    ])
  })
})
describe('existing PDF annotation removal', () => {
  it('deletes an underline object and its popup without deleting page content or another annotation', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 400])
    page.drawText('Original text remains')
    const underline = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Underline',
        Rect: [20, 20, 120, 40],
        QuadPoints: [20, 40, 120, 40, 20, 20, 120, 20]
      })
    )
    const popup = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Popup',
        Parent: underline,
        Rect: [20, 20, 120, 40]
      })
    )
    const stamp = pdf.context.register(
      pdf.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [180, 20, 220, 40] })
    )
    page.node.addAnnot(underline)
    page.node.addAnnot(popup)
    page.node.addAnnot(stamp)
    const before = await pdf.save(),
      result = await removeDocumentAnnotation(
        before.slice().buffer as ArrayBuffer,
        1,
        `${underline.objectNumber}R`
      ),
      out = await PDFDocument.load(result)
    expect(
      out
        .getPages()[0]
        .node.Annots()
        ?.asArray()
        .map((ref) => ref.toString())
    ).toEqual([stamp.toString()])
    expect(out.getPages()[0].node.Contents()).toBeDefined()
    await expect(
      removeDocumentAnnotation(before.slice().buffer as ArrayBuffer, 1, 'not-a-reference')
    ).rejects.toThrow()
  })
  it('removes a signature widget through its form field without leaving a dangling certification pointer', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 400])
    const sig = pdf.context.register(
      pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached' })
    )
    const field = pdf.context.register(
      pdf.context.obj({ FT: 'Sig', T: PDFString.of('Signature1'), V: sig, Kids: [] })
    )
    const widget = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Parent: field,
        P: page.ref,
        Rect: [20, 20, 150, 70]
      })
    )
    const dict = pdf.context.lookup(field, PDFDict)
    dict.set(PDFName.of('Kids'), pdf.context.obj([widget]))
    page.node.addAnnot(widget)
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [field] }))
    pdf.catalog.set(PDFName.of('Perms'), pdf.context.obj({ DocMDP: sig }))
    const result = await removeDocumentAnnotation(
        (await pdf.save()).slice().buffer as ArrayBuffer,
        1,
        `${widget.objectNumber}R`
      ),
      out = await PDFDocument.load(result)
    expect(out.getForm().getFields()).toHaveLength(0)
    expect(out.catalog.has(PDFName.of('Perms'))).toBe(false)
  })
  it('restores removed form fields with PDF undo', () => {
    usePdfStore.getState().openFile('test.pdf', new Uint8Array([1, 2, 3]).buffer)
    useFormStore.getState().setFields([{ name: 'signature', type: 'Unsupported', value: '' }])
    usePdfStore.getState().pushHistory()
    usePdfStore.getState().setData(new Uint8Array([4, 5, 6]).buffer)
    useFormStore.getState().setFields([])
    expect(usePdfStore.getState().undoPdf()).toBe(true)
    expect(useFormStore.getState().fields[0].name).toBe('signature')
    usePdfStore.getState().closeFile()
    useFormStore.getState().setFields([])
  })
})
describe('OCR coverage and security details', () => {
  it('retains faint ink for adaptive thresholding', () => {
    expect(ocrLuminance(205, 0, 255)).toBe(205)
    expect(ocrLuminance(240, 230, 250)).toBe(127.5)
  })
  it('merges isolated text from the sparse pass without duplicate overlapping words', () => {
    const word = { text: 'Heading', confidence: 95, bbox: { x0: 10, y0: 10, x1: 90, y1: 30 } }
    expect(
      mergeRecognizedWords(
        [word],
        [
          { ...word, text: 'Heading' },
          { text: 'Footnote', confidence: 70, bbox: { x0: 10, y0: 300, x1: 80, y1: 310 } }
        ]
      ).map((w) => w.text)
    ).toEqual(['Heading', 'Footnote'])
  })
  it('distinguishes unrestricted, restricted and unassessed permissions', () => {
    expect(
      securityPermissions(null).every(
        (row) => row.value === 'Allowed' || row.value === 'High resolution'
      )
    ).toBe(true)
    expect(securityPermissions([]).every((row) => row.value === 'Not allowed')).toBe(true)
    expect(securityPermissions(undefined).every((row) => row.value === 'Not assessed')).toBe(true)
    expect(securityPermissions([PermissionFlag.PRINT])[0].value).toBe('Low resolution only')
  })
})
