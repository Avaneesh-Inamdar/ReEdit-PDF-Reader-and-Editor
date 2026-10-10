export interface SearchSegment {
  index: number
  start: number
  end: number
}
export interface SearchMatch {
  page: number
  index: number
  start?: number
  end?: number
  segments?: SearchSegment[]
}
interface Item {
  type?: string
  str?: string
  hasEOL?: boolean
  transform?: number[]
  width?: number
}

export function findTextMatches(
  items: Item[],
  query: string,
  page: number,
  matchCase = false,
  wholeWords = false
): SearchMatch[] {
  const needle = query.trim()
  if (!needle) return []
  let text = ''
  const positions: { index: number; offset: number }[] = []
  items.forEach((item, index) => {
    const previous = items[index - 1]
    const gap =
      previous?.transform && item.transform
        ? Math.hypot(
            item.transform[4] - previous.transform[4],
            item.transform[5] - previous.transform[5]
          ) - (previous.width || 0)
        : 0
    if (previous?.hasEOL || gap > Math.abs(item.transform?.[3] || 12) * 0.15) {
      text += ' '
      positions.push({ index: -1, offset: 0 })
    }
    for (let offset = 0; offset < (item.str || '').length; offset++) {
      text += item.str![offset]
      positions.push({ index, offset })
    }
  })
  const expression = new RegExp(
    needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    matchCase ? 'gu' : 'giu'
  )
  const matches: SearchMatch[] = []
  const word = (character: string) => /[\p{L}\p{N}_]/u.test(character)
  for (let found = expression.exec(text); found; found = expression.exec(text)) {
    const start = found.index,
      end = start + found[0].length
    if (wholeWords && (word(text[start - 1] || '') || word(text[end] || ''))) continue
    const segments: SearchSegment[] = []
    for (const position of positions.slice(start, end)) {
      if (position.index < 0) continue
      const previous = segments[segments.length - 1]
      if (previous?.index === position.index && previous.end === position.offset) previous.end++
      else
        segments.push({ index: position.index, start: position.offset, end: position.offset + 1 })
    }
    if (segments.length)
      matches.push({
        page,
        index: segments[0].index,
        start: segments[0].start,
        end: segments[0].end,
        segments
      })
  }
  return matches
}
