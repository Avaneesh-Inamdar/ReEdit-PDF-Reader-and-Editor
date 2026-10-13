import { pdfjsLib, pdfAssetOptions } from './pdfjs'
import { prepareDocument } from './documentActions'
import type { PrintOptions } from '../../../shared/printing'

let printing = false
export async function printDocument(
  progress: (message: string | null) => void,
  options: PrintOptions,
  prepared?: Uint8Array
): Promise<void> {
  if (printing) return
  printing = true
  let doc: import('pdfjs-dist').PDFDocumentProxy | undefined
  try {
    progress('Preparing document for printing…')
    if (window.api.printPdf) {
      const data = prepared || await prepareDocument(true)
      progress('Sending document to printer…')
      await window.api.printPdf(data, options)
      return
    }
    doc = await pdfjsLib.getDocument({
      ...pdfAssetOptions(),
      data: prepared?.slice() || (await prepareDocument(true))
    }).promise
    const pages: { image: string; width: number; height: number }[] = []
    for (const number of options.pages) {
      progress(`Preparing page ${number} of ${doc.numPages}…`)
      const page = await doc.getPage(number)
      const size = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: Math.min(2, Math.sqrt(16000000 / (size.width * size.height)))
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      pages.push({ image: canvas.toDataURL('image/png'), width: size.width, height: size.height })
      canvas.width = canvas.height = 0
      page.cleanup()
    }
    progress('Sending document to printer…')
    await window.api.print(pages, options)
  } catch (error) {
    throw error
  } finally {
    await doc?.destroy()
    printing = false
    progress(null)
  }
}
