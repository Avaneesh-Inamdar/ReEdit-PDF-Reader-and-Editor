import * as pdfjsLib from 'pdfjs-dist'
// pdfjs 4.x: worker is separate mjs. Vite will bundle via ?url
// In Electron file:// context, worker must resolve relative to assets; fallback to disableWorker if fails
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

if (pdfjsLib.GlobalWorkerOptions) {
  // @ts-ignore
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
  } catch {}
}

// Helper: load document with fallback to disableWorker if worker fails (fixes black screen on file://)
export async function getPdfDoc(data: ArrayBuffer): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  try {
    const task = pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0) } as never)
    return await task.promise
  } catch (e) {
    console.warn('pdf.js getDocument fallback to disableWorker', e)
    const task = pdfjsLib.getDocument({ ...pdfAssetOptions(), data: data.slice(0), disableWorker: true } as never)
    return await task.promise
  }
}
export async function loadPdfDocument(data: ArrayBuffer): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  return getPdfDoc(data)
}

export { pdfjsLib }
export const { getDocument } = pdfjsLib

export function pdfAssetOptions(): { standardFontDataUrl: string; cMapUrl: string; cMapPacked: boolean; fontExtraProperties: boolean } {
  return { standardFontDataUrl: new URL('./pdfjs/standard_fonts/', window.location.href).href, cMapUrl: new URL('./pdfjs/cmaps/', window.location.href).href, cMapPacked: true, fontExtraProperties: true }
}
