import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { fillFormAndSave, inspectForms } from '../src/renderer/src/lib/forms'
import { bakeAnnotationsToPdf, mergePdfs } from '../src/renderer/src/lib/pdfEditing'
import { openTool } from '../src/renderer/src/lib/toolActions'
import { useUIStore } from '../src/renderer/src/stores/useUIStore'
import { usePdfStore } from '../src/renderer/src/stores/usePdfStore'
import { useTabStore } from '../src/renderer/src/stores/useTabStore'
import { restoreSession } from '../src/renderer/src/lib/documentSession'

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer

beforeEach(() => {
  restoreSession()
  useTabStore.setState({ tabs: [], activeTabId: null })
  useUIStore.setState({ activeView: 'tools', activeModal: 'none', rightPane: 'none' })
})

describe('desktop workflows', () => {
  it('opens the chosen tool directly and repeated selection keeps it open; cancellation keeps the current view', async () => {
    const openFile = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('window', { api: { openFile } })
    await openTool('edit')
    expect(useUIStore.getState().activeView).toBe('tools')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    openFile.mockResolvedValue({ filePath: 'C:\\test.pdf', data: buffer(await pdf.save()) })
    await openTool('edit')
    await openTool('edit')
    expect(useUIStore.getState().activeView).toBe('document')
    expect(useUIStore.getState().rightPane).toBe('edit')
    expect(openFile).toHaveBeenCalledTimes(2)
    await openTool('organize')
    expect(useUIStore.getState().activeModal).toBe('organizePages')
    expect(usePdfStore.getState().data).not.toBeNull()
  })

  it('round-trips checkboxes, radio choices and dropdown selections and reports invalid values', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const form = pdf.getForm()
    const dropdown = form.createDropdown('country')
    dropdown.setOptions(['India', 'Japan'])
    dropdown.select('India')
    const radio = form.createRadioGroup('choice')
    radio.addOptionToPage('A', pdf.getPage(0))
    radio.addOptionToPage('B', pdf.getPage(0))
    radio.select('A')
    const checkbox = form.createCheckBox('accepted')
    checkbox.check()
    const source = buffer(await pdf.save())
    const fields = (await inspectForms(source)).fields
    expect(fields.find((f) => f.name === 'country')).toMatchObject({
      type: 'PDFDropdown',
      value: 'India',
      options: ['India', 'Japan']
    })
    const saved = await PDFDocument.load(
      await fillFormAndSave(source, { country: 'Japan', choice: 'B', accepted: 'false' }, false)
    )
    expect(saved.getForm().getDropdown('country').getSelected()).toEqual(['Japan'])
    expect(saved.getForm().getRadioGroup('choice').getSelected()).toBe('B')
    expect(saved.getForm().getCheckBox('accepted').isChecked()).toBe(false)
    await expect(fillFormAndSave(source, { choice: 'missing' }, false)).rejects.toThrow()
  })

  it('combines documents in selected order while preserving page sizes and rotations', async () => {
    const first = await PDFDocument.create()
    first.addPage([300, 500]).setRotation({ type: 'degrees', angle: 90 } as never)
    const second = await PDFDocument.create()
    second.addPage([400, 600])
    second.addPage([200, 400])
    const merged = await PDFDocument.load(
      await mergePdfs([buffer(await second.save()), buffer(await first.save())])
    )
    expect(merged.getPages().map((page) => page.getSize())).toEqual([
      { width: 400, height: 600 },
      { width: 200, height: 400 },
      { width: 300, height: 500 }
    ])
    expect(merged.getPage(2).getRotation().angle).toBe(90)
  })

  it('embeds signature pixels from document state without a placeholder border in either save mode', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const source = buffer(await pdf.save())
    const bytes = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=',
        'base64'
      )
    )
    for (const flatten of [false, true]) {
      const saved = await PDFDocument.load(
        await bakeAnnotationsToPdf(
          source,
          [
            {
              id: 'signature',
              page: 1,
              type: 'image',
              x: 0.1,
              y: 0.1,
              w: 0.25,
              h: 0.08,
              color: '#000000',
              strokeWidth: 0,
              opacity: 1,
              image: { bytes, mime: 'image/png' }
            }
          ],
          [],
          { flatten }
        )
      )
      const resources = saved.getPage(0).node.Resources()!
      expect(resources.lookup(PDFName.of('XObject'), PDFDict).keys().length).toBeGreaterThan(0)
      expect(saved.getPage(0).node.Annots()?.size() || 0).toBe(0)
    }
  })

  it('preserves an indirect annotation array and saves text with its chosen font appearance', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const form = pdf.getForm()
    const name = form.createTextField('name')
    name.setText('Original')
    name.addToPage(page)
    const widgetCount = page.node.Annots()!.size()
    page.node.set(PDFName.of('Annots'), pdf.context.register(page.node.Annots()!))
    const saved = await PDFDocument.load(
      await bakeAnnotationsToPdf(
        buffer(await pdf.save()),
        [
          {
            id: 'text',
            page: 1,
            type: 'text',
            text: 'Bold italic',
            x: 0.1,
            y: 0.4,
            w: 0.3,
            h: 0.1,
            color: '#ff0000',
            strokeWidth: 0,
            opacity: 1,
            fontSize: 18,
            fontFamily: 'Times-Roman',
            bold: true,
            italic: true
          }
        ],
        []
      )
    )
    expect(saved.getForm().getTextField('name').getText()).toBe('Original')
    const annotations = saved.getPage(0).node.Annots() as PDFArray
    expect(annotations.size()).toBe(widgetCount + 1)
    const text = annotations.lookup(annotations.size() - 1, PDFDict)
    const appearance = text.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFRawStream)
    const resources = appearance.dict.lookup(PDFName.of('Resources'), PDFDict)
    const font = resources.lookup(PDFName.of('Font'), PDFDict).lookup(PDFName.of('F0'), PDFDict)
    expect(font.get(PDFName.of('BaseFont'))?.toString()).toBe('/Times-BoldItalic')
    expect(new TextDecoder().decode(decodePDFRawStream(appearance).decode())).toContain('/F0 18 Tf')
  })
})
