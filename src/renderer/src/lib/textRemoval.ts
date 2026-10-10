import type { Annotation } from '../stores/useAnnotationStore'
import type { RemovalRegion } from '../../../shared/pdfOperations'

export function textRemovalRegions(annotations: Annotation[]): RemovalRegion[] {
  return annotations.flatMap(a => (a.maskTexts || (a.sourceText ? [a.sourceText] : [])).map(r => {
    if (r.pdfAnnotationId) return { page: a.page, annotationId: r.pdfAnnotationId }
    const [ma, mb, c, d] = r.matrix || [Math.cos(r.angle), Math.sin(r.angle), -Math.sin(r.angle), Math.cos(r.angle)]
    const x = r.x + c * r.ascent, y = r.y + d * r.ascent
    const bx = r.x - c * r.descent, by = r.y - d * r.descent
    return { page: a.page, quad: [x, y, x + ma * r.width, y + mb * r.width, bx, by, bx + ma * r.width, by + mb * r.width] as RemovalRegion['quad'] }
  }))
}
