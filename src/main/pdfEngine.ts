import type { RemovalRegion } from '../shared/pdfOperations'

export async function removePdfContent(bytes: Uint8Array, regions: RemovalRegion[], secure: boolean): Promise<Uint8Array> {
  const m = await import('mupdf')
  const doc = new m.PDFDocument(bytes)
  try {
    if (doc.needsPassword()) throw new Error('Unlock the PDF before removing content.')
    for (const number of new Set(regions.map(r => r.page))) {
      if (!Number.isInteger(number) || number < 1 || number > doc.countPages()) throw new Error('Invalid removal page')
      const page = doc.loadPage(number - 1)
      try {
        for (const r of regions.filter(r => r.page === number)) {
          const annotation = page.createAnnotation('Redact')
          if (r.quad) {
            if (r.quad.length !== 8 || !r.quad.every(Number.isFinite)) throw new Error('Invalid text region')
            const matrix = page.getTransform()
            const transform = (x: number, y: number): [number, number] => [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]]
            annotation.setQuadPoints([[...transform(r.quad[0],r.quad[1]), ...transform(r.quad[2],r.quad[3]), ...transform(r.quad[4],r.quad[5]), ...transform(r.quad[6],r.quad[7])]])
          } else {
            const {x=0,y=0,w=0,h=0}=r
            if (![x,y,w,h].every(Number.isFinite) || w<=0 || h<=0 || x<0 || y<0 || x+w>1.001 || y+h>1.001) throw new Error('Invalid redaction region')
            const [left,top,right,bottom]=page.getBounds()
            annotation.setRect([left+x*(right-left),top+y*(bottom-top),left+(x+w)*(right-left),top+(y+h)*(bottom-top)])
          }
          annotation.update()
        }
        page.applyRedactions(secure, secure ? m.PDFPage.REDACT_IMAGE_PIXELS : m.PDFPage.REDACT_IMAGE_NONE, secure ? m.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED : m.PDFPage.REDACT_LINE_ART_NONE, m.PDFPage.REDACT_TEXT_REMOVE)
      } finally { page.destroy() }
    }
    if (secure) {
      doc.getTrailer().delete('Info')
      const root=doc.getTrailer().get('Root')
      root.delete('Metadata')
      const names=root.get('Names')
      if (names.isDictionary()) { names.delete('EmbeddedFiles'); names.delete('JavaScript') }
      root.delete('OpenAction')
    }
    const buffer=doc.saveToBuffer('garbage=4,clean=yes,compress=yes')
    try { return buffer.asUint8Array().slice() } finally { buffer.destroy() }
  } finally { doc.destroy() }
}
