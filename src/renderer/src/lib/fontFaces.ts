import { useEffect } from 'react'
import { useAnnotationStore, type Annotation } from '../stores/useAnnotationStore'
import { useTabStore } from '../stores/useTabStore'

type Entry = { face: FontFace; data: WeakRef<Uint8Array>; ready: Promise<void> }
const faces = new Map<string, Entry>()
const keys = new WeakMap<Uint8Array, Set<string>>()
const activePreviews = new Map<string, number>()
let schedulePrune: (() => void) | undefined
export function retainPreviewFont(name: string): () => void {
  activePreviews.set(name, (activePreviews.get(name) || 0) + 1)
  return () => {
    const count = (activePreviews.get(name) || 1) - 1
    if (count) activePreviews.set(name, count)
    else activePreviews.delete(name)
    schedulePrune?.()
  }
}

export async function registerPreviewFont(
  data: Uint8Array,
  bold = false,
  italic = false
): Promise<{ name: string; data: Uint8Array }> {
  const digest = await crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer)
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('')
  const key = hash + ':' + Number(bold) + Number(italic),
    name = 'ReEdit-' + hash.slice(0, 24) + '-' + Number(bold) + Number(italic)
  const aliases = keys.get(data) || new Set<string>()
  aliases.add(key)
  keys.set(data, aliases)
  const previous = faces.get(key)
  if (previous) {
    await previous.ready
    return { name, data: previous.data.deref() || data }
  }
  const face = new FontFace(name, data.slice().buffer as ArrayBuffer, {
    weight: bold ? '700' : '400',
    style: italic ? 'italic' : 'normal'
  })
  const ready = face
    .load()
    .then(() => {
      if (faces.get(key)?.face === face) document.fonts.add(face)
      schedulePrune?.()
    })
    .catch((error) => {
      faces.delete(key)
      throw error
    })
  // The resolved promise must not hold a permanent strong reference to font bytes.
  const entry: Entry = { face, data: new WeakRef(data), ready }
  faces.set(key, entry)
  await ready
  return { name, data }
}
export function useManagedFontFaces(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const prune = (): void => {
      const keep = new Set<string>(),
        names = new Set<string>(activePreviews.keys())
      const collect = (annotations: Annotation[]): void => {
        for (const annotation of annotations) {
          if (annotation.previewFont) names.add(annotation.previewFont)
          for (const data of [annotation.fontData, annotation.sourceText?.fontData])
            if (data) keys.get(data)?.forEach((key) => keep.add(key))
        }
      }
      const state = (value: ReturnType<typeof useAnnotationStore.getState>): void => {
        collect(value.annotations)
        for (const history of [...value.past, ...value.future]) collect(history.annotations)
      }
      state(useAnnotationStore.getState())
      for (const tab of useTabStore.getState().tabs) if (tab.session) state(tab.session.annotations)
      for (const [key, entry] of faces)
        if (entry.face.status !== 'loading' && !keep.has(key) && !names.has(entry.face.family)) {
          document.fonts.delete(entry.face)
          faces.delete(key)
        }
    }
    const schedule = (): void => {
      clearTimeout(timer)
      timer = setTimeout(prune, 300)
    }
    schedulePrune = schedule
    const offAnnotations = useAnnotationStore.subscribe(schedule),
      offTabs = useTabStore.subscribe(schedule)
    schedule()
    return () => {
      schedulePrune = undefined
      clearTimeout(timer)
      offAnnotations()
      offTabs()
      for (const entry of faces.values()) document.fonts.delete(entry.face)
      faces.clear()
    }
  }, [])
}
