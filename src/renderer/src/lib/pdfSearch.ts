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
  annotationId?: string
  preview?: string
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
  const needle = query.trim().normalize('NFKC').replace(/\s+/g, ' ')
  if (!needle) return []
  let text = ''
  const positions: { index: number; offset: number }[] = []
  const indexed = items.map((item, index) => ({
    item,
    index,
    box: {
      left: item.transform?.[4] || 0,
      right: (item.transform?.[4] || 0) + (item.width || 0),
      top: -(item.transform?.[5] || 0),
      bottom: -(item.transform?.[5] || 0) + Math.abs(item.transform?.[3] || 12),
      height: Math.abs(item.transform?.[3] || 12)
    }
  }))
  const ordered = items.every((item) => item.transform && Math.abs(item.transform[1]) < 0.01)
    ? readingOrder(indexed)
    : indexed
  ordered.forEach(({ item, index }, orderIndex) => {
    const previous = ordered[orderIndex - 1]?.item
    const gap =
      previous?.transform && item.transform
        ? Math.hypot(
            item.transform[4] - previous.transform[4],
            item.transform[5] - previous.transform[5]
          ) - (previous.width || 0)
        : 0
    const height = Math.abs(item.transform?.[3] || 12)
    const differentLine =
      previous?.transform &&
      item.transform &&
      Math.abs(item.transform[1]) < 0.01 &&
      Math.abs(item.transform[5] - previous.transform[5]) > height * 0.5
    if (previous?.hasEOL || differentLine || gap > height * 0.15) {
      text += ' '
      positions.push({ index: -1, offset: 0 })
    }
    for (let offset = 0; offset < (item.str || '').length; offset++) {
      const value = item.str![offset]
      if (value === '\u00ad') continue
      const normalized = value.normalize('NFKC')
      text += normalized
      for (let count = 0; count < normalized.length; count++) positions.push({ index, offset })
    }
  })
  const expression = new RegExp(
    needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
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
      if (previous?.index === position.index && previous.end > position.offset) continue
      if (previous?.index === position.index && previous.end === position.offset) previous.end++
      else
        segments.push({ index: position.index, start: position.offset, end: position.offset + 1 })
    }
    if (segments.length)
      matches.push({
        page,
        preview: text.slice(Math.max(0, start - 28), Math.min(text.length, end + 40)).trim(),
        index: segments[0].index,
        start: segments[0].start,
        end: segments[0].end,
        segments
      })
  }
  return matches
}
import { readingOrder } from './readingOrder'
