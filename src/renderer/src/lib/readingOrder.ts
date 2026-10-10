export interface PositionedText { box: { left: number; right: number; top: number; bottom: number; height: number } }

// Resolve obvious column gutters before grouping rows. PDF paint order can be
// word-major, reverse, or grouped into separate drawing passes within a paragraph.
export function readingOrder<T extends PositionedText>(items: T[]): T[] {
  if (items.length < 2) return items.slice()
  const xs = [...items].sort((a, b) => a.box.left - b.box.left)
  const heights = items.map(item => item.box.height).sort((a, b) => a - b)
  const gutter = Math.max(24, heights[Math.floor(heights.length / 2)] * 2)
  let right = xs[0].box.right
  for (let i = 1; i < xs.length; i++) {
    if (xs[i].box.left - right > gutter) {
      const left = xs.slice(0, i), rest = xs.slice(i)
      if (left.length > 1 && rest.length > 1 &&
          Math.min(...left.map(x => x.box.top)) < Math.max(...rest.map(x => x.box.bottom)) &&
          Math.min(...rest.map(x => x.box.top)) < Math.max(...left.map(x => x.box.bottom)))
        return [...readingOrder(left), ...readingOrder(rest)]
    }
    right = Math.max(right, xs[i].box.right)
  }
  const rows: T[][] = []
  for (const item of [...items].sort((a, b) => a.box.top - b.box.top)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(item.box.top - row[0].box.top) < Math.min(item.box.height, row[0].box.height) * 0.4) row.push(item)
    else rows.push([item])
  }
  return rows.flatMap(row => row.sort((a, b) => a.box.left - b.box.left))
}
