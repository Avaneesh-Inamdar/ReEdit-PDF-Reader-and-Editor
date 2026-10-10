import { breakTextIntoLines } from 'pdf-lib'
import type { Annotation } from '../stores/useAnnotationStore'
import { previewFont } from './fonts'

const cached = new WeakMap<Annotation, { width: number; height: number; zoom: number; value: number }>()
export function placedTextHeight(annotation: Annotation, width: number, height: number, zoom: number): number {
  if (annotation.type !== 'text') return annotation.h * height
  const previous = cached.get(annotation)
  if (previous?.width === width && previous.height === height && previous.zoom === zoom) return previous.value
  const context = document.createElement('canvas').getContext('2d')!
  const size = (annotation.fontSize || 12) * zoom
  context.font = `${annotation.italic ? 'italic' : 'normal'} ${annotation.bold ? 'bold' : 'normal'} ${size}px "${previewFont(annotation)}"`
  const lines = breakTextIntoLines(annotation.text || '', [' '], Math.max(1, annotation.w * width - 8), value => context.measureText(value).width)
  const value = Math.max(annotation.h * height, lines.length * size * 1.2 + 4)
  cached.set(annotation, { width, height, zoom, value })
  return value
}
