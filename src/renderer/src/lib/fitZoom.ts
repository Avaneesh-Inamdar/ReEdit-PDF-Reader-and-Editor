// Floor rather than round: even a fraction of a pixel of overflow can add a
// scrollbar and feed a different width back into ResizeObserver.
export function fitZoom(
  page: { width: number; height: number },
  viewport: { width: number; height: number },
  mode: 'width' | 'page',
  padding = { width: 32, height: 96 }
): number | null {
  if (
    ![
      page.width,
      page.height,
      viewport.width,
      viewport.height,
      padding.width,
      padding.height
    ].every(Number.isFinite) ||
    page.width <= 0 ||
    page.height <= 0
  )
    return null
  const width = viewport.width - padding.width,
    height = viewport.height - padding.height
  if (width <= 0 || (mode === 'page' && height <= 0)) return null
  const scale =
    mode === 'page' ? Math.min(width / page.width, height / page.height) : width / page.width
  return Math.max(0.1, Math.min(10, Math.floor(scale * 10000) / 10000))
}
