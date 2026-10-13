import type { Annotation } from '../stores/useAnnotationStore'

// Spacing belongs to the source face. Applying justified/monospaced advances
// to a replacement face produces unexpected gaps between its words.
export function replacementSpacing(annotation: Annotation): { character: number; word: number } {
  const source = annotation.sourceText
  if (
    !source ||
    annotation.fontData ||
    annotation.fontFamily !== source.fontFamily ||
    !!annotation.bold !== !!source.bold ||
    !!annotation.italic !== !!source.italic
  )
    return { character: 0, word: 0 }
  const scale = (annotation.fontSize || source.size) / source.size
  return {
    character: (source.characterSpacing || 0) * scale,
    word: (source.wordSpacing || 0) * scale
  }
}
