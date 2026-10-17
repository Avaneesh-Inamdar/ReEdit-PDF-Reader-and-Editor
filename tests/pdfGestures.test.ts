import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPdfGestures } from '../src/renderer/src/lib/pdfGestures'

afterEach(() => vi.unstubAllGlobals())
describe('PDF wheel gestures across the workspace', () => {
  it('zooms over the page or header, preserves normal scrolling, and removes listeners', () => {
    const surface = new EventTarget()
    vi.stubGlobal('window', surface)
    vi.stubGlobal('Element', class {})
    const viewer = Object.assign(new EventTarget(), {
      clientHeight: 600,
      getBoundingClientRect: () => ({
        left: 100,
        right: 900,
        top: 100,
        bottom: 700,
        width: 800,
        height: 600
      })
    }) as unknown as HTMLElement
    const zoom = vi.fn(),
      cleanup = installPdfGestures(viewer, zoom)
    const wheel = (ctrlKey: boolean, clientX: number, clientY: number): Event =>
      Object.assign(new Event('wheel', { cancelable: true }), {
        ctrlKey,
        metaKey: false,
        deltaY: -60,
        deltaMode: 0,
        clientX,
        clientY
      })
    const scroll = wheel(false, 400, 300)
    surface.dispatchEvent(scroll)
    expect(scroll.defaultPrevented).toBe(false)
    expect(zoom).not.toHaveBeenCalled()
    surface.dispatchEvent(wheel(true, 400, 300))
    expect(zoom).toHaveBeenLastCalledWith(expect.any(Number), 400, 300)
    surface.dispatchEvent(wheel(true, 180, 20))
    expect(zoom).toHaveBeenLastCalledWith(expect.any(Number), 500, 400)
    surface.dispatchEvent(Object.assign(wheel(true, 400, 300), { deltaY: 60 }))
    expect(zoom.mock.lastCall![0]).toBeLessThan(1)
    cleanup()
    surface.dispatchEvent(wheel(true, 400, 300))
    expect(zoom).toHaveBeenCalledTimes(3)
  })
})
