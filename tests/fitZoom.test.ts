import { describe, it, expect } from 'vitest'
import { fitZoom } from '../src/renderer/src/lib/fitZoom'
describe('stable page fitting', () => {
  it('does not round a landscape certificate past the available width', () => {
    const page = { width: 842, height: 595 },
      viewport = { width: 1000, height: 780 }
    expect(
      Number(((viewport.width - 32) / page.width).toFixed(2)) * page.width + 32
    ).toBeGreaterThan(viewport.width)
    expect(fitZoom(page, viewport, 'width')! * page.width + 32).toBeLessThanOrEqual(viewport.width)
  })
  it.each([595, 612, 792, 842, 841.89, 1133.858])(
    'fits fractional and rotated page widths %i without overflow',
    (width) => {
      for (const container of [400, 792.25, 992, 1000, 1007.4, 1536]) {
        const zoom = fitZoom({ width, height: 595 }, { width: container, height: 800 }, 'width')!
        expect(zoom * width + 32).toBeLessThanOrEqual(container + 0.00001)
      }
    }
  )
  it('fits the whole page including the actual top and bottom spacing', () => {
    const page = { width: 842, height: 595 },
      viewport = { width: 1000, height: 600 },
      zoom = fitZoom(page, viewport, 'page')!
    expect(zoom * page.height + 96).toBeLessThanOrEqual(viewport.height)
    expect(zoom * page.width + 32).toBeLessThanOrEqual(viewport.width)
  })
  it('rejects unavailable or invalid geometry without writing an invalid zoom', () => {
    expect(fitZoom({ width: 0, height: 595 }, { width: 1000, height: 800 }, 'width')).toBeNull()
    expect(fitZoom({ width: 842, height: 595 }, { width: 0, height: 0 }, 'page')).toBeNull()
    expect(fitZoom({ width: NaN, height: 595 }, { width: 1000, height: 800 }, 'width')).toBeNull()
  })
})
