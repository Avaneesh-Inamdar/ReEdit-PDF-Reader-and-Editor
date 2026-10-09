import { pdfjsLib } from './pdfjs'
import { prepareDocument } from './documentActions'

let printing = false
export async function printDocument(progress: (message: string | null) => void): Promise<void> {
  if (printing) return
  printing = true
  let doc: import('pdfjs-dist').PDFDocumentProxy | undefined
  try {
    progress('Preparing document for printing…')
    doc = await pdfjsLib.getDocument({ data: await prepareDocument(true) }).promise
    const pages: { image: string; width: number; height: number }[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      progress(`Preparing page ${number} of ${doc.numPages}…`)
      const page = await doc.getPage(number)
      const size = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, Math.sqrt(16000000 / (size.width * size.height))) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      pages.push({ image: canvas.toDataURL('image/png'), width: size.width, height: size.height })
      canvas.width = canvas.height = 0
      page.cleanup()
    }
    progress('Choose your printer and page range…')
    await window.api.print(pages)
  } catch (error) {
    alert('Print failed: ' + String(error))
  } finally {
    await doc?.destroy()
    printing = false
    progress(null)
  }
}
