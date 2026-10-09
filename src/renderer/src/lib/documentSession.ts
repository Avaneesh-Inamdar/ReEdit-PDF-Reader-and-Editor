import { usePdfStore } from '../stores/usePdfStore'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useFormStore } from '../stores/useFormStore'
import { useEditStore } from '../stores/useEditStore'
import { useDetectionStore } from '../stores/useDetectionStore'
import { useOcrStore } from '../stores/useOcrStore'

export interface DocumentSession {
  pdf: ReturnType<typeof usePdfStore.getState>
  annotations: ReturnType<typeof useAnnotationStore.getState>
  forms: ReturnType<typeof useFormStore.getState>
  edits: ReturnType<typeof useEditStore.getState>
  detection: ReturnType<typeof useDetectionStore.getState>
  ocr: ReturnType<typeof useOcrStore.getState>
}

export function captureSession(): DocumentSession {
  return {
    pdf: usePdfStore.getState(),
    annotations: useAnnotationStore.getState(),
    forms: useFormStore.getState(),
    edits: useEditStore.getState(),
    detection: useDetectionStore.getState(),
    ocr: useOcrStore.getState()
  }
}

export let restoringSession = false

export function restoreSession(session?: DocumentSession): void {
  restoringSession = true
  try {
    useAnnotationStore.setState(session?.annotations ?? useAnnotationStore.getInitialState())
    useFormStore.setState(session?.forms ?? useFormStore.getInitialState())
    useEditStore.setState(session?.edits ?? useEditStore.getInitialState())
    useDetectionStore.setState(session?.detection ?? useDetectionStore.getInitialState())
    useOcrStore.setState(session?.ocr ?? useOcrStore.getInitialState())
    usePdfStore.setState(session?.pdf ?? usePdfStore.getInitialState())
  } finally {
    restoringSession = false
  }
}

function markEdited(): void {
  if (!restoringSession && usePdfStore.getState().data) usePdfStore.getState().setDirty(true)
}

useAnnotationStore.subscribe((state, previous) => {
  if (state.annotations !== previous.annotations) markEdited()
})
useFormStore.subscribe((state, previous) => {
  // Inspection populates fields; only changes to existing field values are edits.
  if (
    state.fields.some((field) =>
      previous.fields.some((old) => old.name === field.name && old.value !== field.value)
    )
  )
    markEdited()
})
useEditStore.subscribe((state, previous) => {
  if (state.redactions !== previous.redactions) markEdited()
})
