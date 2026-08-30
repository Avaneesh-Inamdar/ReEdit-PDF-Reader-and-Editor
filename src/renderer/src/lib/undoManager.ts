import { useAnnotationStore } from '../stores/useAnnotationStore'
import { usePdfStore } from '../stores/usePdfStore'

export function performUndo(): boolean {
  const annotPast = useAnnotationStore.getState().past
  const pdfPast = usePdfStore.getState().past

  const lastAnnotTime = annotPast.length ? (annotPast[annotPast.length - 1].timestamp ?? 0) : 0
  const lastPdfTime = usePdfStore.getState().lastModifiedTime || 0

  if (pdfPast.length > 0 && (annotPast.length === 0 || lastPdfTime >= lastAnnotTime)) {
    return usePdfStore.getState().undoPdf()
  } else if (annotPast.length > 0) {
    useAnnotationStore.getState().undo()
    return true
  } else if (pdfPast.length > 0) {
    return usePdfStore.getState().undoPdf()
  }
  return false
}

export function performRedo(): boolean {
  const annotFuture = useAnnotationStore.getState().future
  const pdfFuture = usePdfStore.getState().future

  if (pdfFuture.length > 0 && annotFuture.length === 0) {
    return usePdfStore.getState().redoPdf()
  } else if (annotFuture.length > 0) {
    useAnnotationStore.getState().redo()
    return true
  } else if (pdfFuture.length > 0) {
    return usePdfStore.getState().redoPdf()
  }
  return false
}

export function canPerformUndo(): boolean {
  return useAnnotationStore.getState().past.length > 0 || usePdfStore.getState().past.length > 0
}

export function canPerformRedo(): boolean {
  return useAnnotationStore.getState().future.length > 0 || usePdfStore.getState().future.length > 0
}
