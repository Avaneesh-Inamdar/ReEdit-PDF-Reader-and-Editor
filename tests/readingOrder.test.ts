import { describe, expect, it } from 'vitest'
import { readingOrder } from '../src/renderer/src/lib/readingOrder'

const word = (text: string, left: number, top: number, width = 80) => ({ text, box: { left, right: left + width, top, bottom: top + 12, height: 12 } })
describe('geometric text reading order', () => {
  it('keeps 20 fragmented lines together despite word-major PDF drawing passes', () => {
    const items = Array.from({ length: 20 }, (_, line) => [word(`${line}-start`, 20, line * 18), word(`${line}-end`, 105, line * 18)])
    const painted = [...items.map(row => row[0]).reverse(), ...items.map(row => row[1])]
    expect(readingOrder(painted).map(x => x.text)).toEqual(items.flat().map(x => x.text))
  })
  it('keeps obvious columns separate instead of alternating between blocks', () => {
    const items = [word('left-bottom', 20, 50), word('right-top', 250, 10), word('left-top', 20, 10), word('right-bottom', 250, 50)]
    expect(readingOrder(items).map(x => x.text)).toEqual(['left-top', 'left-bottom', 'right-top', 'right-bottom'])
  })
})
