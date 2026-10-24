export interface DocumentKey {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}
export type DocumentNavigation =
  { type: 'page'; page: number } | { type: 'screen'; direction: -1 | 1 }

// Acrobat's page shortcuts are distinct from scrolling one screen. This is
// independent of the DOM so forms, menus and modal focus can be gated by callers.
export function documentNavigation(
  key: DocumentKey,
  page: number,
  count: number,
  singlePage: boolean
): DocumentNavigation | null {
  if (!count || key.altKey) return null
  const control = key.ctrlKey || key.metaKey
  const destination = (value: number): DocumentNavigation => ({
    type: 'page',
    page: Math.max(1, Math.min(count, value))
  })
  if (
    (key.key === 'Home' && !key.shiftKey) ||
    (control && key.shiftKey && (key.key === 'PageUp' || key.key === 'ArrowUp'))
  )
    return destination(1)
  if (
    (key.key === 'End' && !key.shiftKey) ||
    (control && key.shiftKey && (key.key === 'PageDown' || key.key === 'ArrowDown'))
  )
    return destination(count)
  if (key.shiftKey && key.key !== 'Enter') return null
  if ((control && key.key === 'PageUp') || (!control && key.key === 'ArrowLeft'))
    return destination(page - 1)
  if ((control && key.key === 'PageDown') || (!control && key.key === 'ArrowRight'))
    return destination(page + 1)
  if (control) return null
  const direction =
    key.key === 'PageUp' || (key.key === 'Enter' && key.shiftKey)
      ? -1
      : key.key === 'PageDown' || key.key === 'Enter'
        ? 1
        : 0
  return direction
    ? singlePage
      ? destination(page + direction)
      : { type: 'screen', direction }
    : null
}

export function isDocumentSurface(active: Element | null): boolean {
  if (!active || active === document.body || active === document.documentElement) return true
  return (
    !!active.closest('[data-pdf-viewer]') &&
    !active.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')
  )
}

export function cycleWorkspaceFocus(backward: boolean): void {
  const regions = [
    '.workspace-menu-anchor',
    '[data-pdf-viewer]',
    '.workspace-tools-pane',
    '.workspace-navigation-pane',
    '.workspace-document-rail'
  ]
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .filter((element): element is HTMLElement => !!element && element.getClientRects().length > 0)
  if (!regions.length) return
  const current = regions.findIndex((region) => region.contains(document.activeElement))
  const next =
    current < 0
      ? backward
        ? regions.length - 1
        : 0
      : (current + (backward ? -1 : 1) + regions.length) % regions.length
  const region = regions[next]
  const focus = region.matches('[data-pdf-viewer]')
    ? region
    : region.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
      ) || region
  if (!focus.hasAttribute('tabindex') && !focus.matches('button, input')) focus.tabIndex = -1
  focus.focus({ preventScroll: true })
}
