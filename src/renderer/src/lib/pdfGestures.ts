export function installPdfGestures(
  element: HTMLElement,
  zoom: (factor: number, x: number, y: number) => void
): () => void {
  const point = (): { x: number; y: number } => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }
  const wheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return
    event.preventDefault()
    if (
      event.target instanceof Element &&
      event.target.closest('[role=dialog],dialog,.modal-overlay')
    )
      return
    const box = element.getBoundingClientRect(),
      inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
    const center = point(),
      delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
    zoom(
      Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.005),
      inside ? event.clientX : center.x,
      inside ? event.clientY : center.y
    )
  }
  let scale = 1
  const start = (event: Event): void => {
    scale = 1
    event.preventDefault()
  }
  const change = (event: Event): void => {
    const gesture = event as Event & { scale: number; clientX?: number; clientY?: number }
    if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return
    event.preventDefault()
    const center = point()
    zoom(gesture.scale / scale, gesture.clientX ?? center.x, gesture.clientY ?? center.y)
    scale = gesture.scale
  }
  const native = (event: Event): void => {
    const center = point()
    zoom(Number((event as CustomEvent).detail), center.x, center.y)
  }
  let previousScale = window.visualViewport?.scale || 1,
    resetting = false,
    disposed = false
  const viewport = (): void => {
    const scale = window.visualViewport?.scale || 1
    if (!window.api.resetPageScale || Math.abs(scale - previousScale) < 0.0001) return
    if (Math.abs(scale - 1) < 0.0001) {
      previousScale = 1
      return
    }
    const center = point()
    zoom(scale / previousScale, center.x, center.y)
    previousScale = scale
    if (!resetting) {
      resetting = true
      void window.api
        .resetPageScale()
        .catch(() => {})
        .finally(() => {
          resetting = false
          if (!disposed && (window.visualViewport?.scale || 1) !== 1) viewport()
        })
    }
  }
  window.addEventListener('wheel', wheel, { passive: false })
  element.addEventListener('gesturestart', start, { passive: false })
  element.addEventListener('gesturechange', change, { passive: false })
  window.addEventListener('desktop:pinch', native)
  window.visualViewport?.addEventListener('resize', viewport)
  return () => {
    disposed = true
    window.removeEventListener('wheel', wheel)
    element.removeEventListener('gesturestart', start)
    element.removeEventListener('gesturechange', change)
    window.removeEventListener('desktop:pinch', native)
    window.visualViewport?.removeEventListener('resize', viewport)
  }
}
