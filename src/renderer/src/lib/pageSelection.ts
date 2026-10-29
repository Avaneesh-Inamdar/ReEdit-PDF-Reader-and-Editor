/** Compute selection in the page organizer. Indices are zero-based. */
export function selectPage(
  selected: ReadonlySet<number>,
  page: number,
  anchor: number | null,
  options: { toggle: boolean; range: boolean }
): Set<number> {
  if (options.range && anchor !== null) {
    const next = options.toggle ? new Set(selected) : new Set<number>()
    for (let i = Math.min(anchor, page); i <= Math.max(anchor, page); i++) next.add(i)
    return next
  }
  if (!options.toggle) return new Set([page])
  const next = new Set(selected)
  if (next.has(page)) next.delete(page)
  else next.add(page)
  return next
}
