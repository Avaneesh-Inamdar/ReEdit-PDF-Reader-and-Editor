import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useUIStore, type RightPane } from '../stores/useUIStore'
import { usePdfStore } from '../stores/usePdfStore'
import { useTabStore } from '../stores/useTabStore'

export async function openTool(pane: RightPane): Promise<void> {
  if (!usePdfStore.getState().data) {
    const file = await window.api.openFile()
    if (!file) return
    if (!usePdfStore.getState().data) useTabStore.getState().openTab(file.filePath, file.data)
  }
  const ui = useUIStore.getState()
  ui.setActiveView('document')
  ui.setPointerMode('select')
  useAnnotationStore.getState().setTool('select')
  if (pane === 'organize') ui.setActiveModal('organizePages')
  else ui.setRightPane(pane)
}
