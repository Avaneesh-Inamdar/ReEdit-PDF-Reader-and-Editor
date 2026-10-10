import { describe, expect, it } from 'vitest'
import { findTextMatches } from '../src/renderer/src/lib/pdfSearch'

describe('document search', () => {
  it('treats regex punctuation as literal PDF text', () => {
    expect(findTextMatches([{ str: 'a+b [word]' }], 'a+b [word]', 1)).toHaveLength(1)
  })
  it('counts every occurrence and records only matching character ranges', () => {
    const matches = findTextMatches([{ str: 'hello hello HELLO' }], 'hello', 2)
    expect(matches).toHaveLength(3)
    expect(matches.map((match) => match.segments)).toEqual([
      [{ index: 0, start: 0, end: 5 }],
      [{ index: 0, start: 6, end: 11 }],
      [{ index: 0, start: 12, end: 17 }]
    ])
  })
  it('finds fragmented words without inventing spaces between glyph runs', () => {
    expect(findTextMatches([{ str: 'Hel' }, { str: 'lo world' }], 'hello', 1)[0].segments).toEqual([
      { index: 0, start: 0, end: 3 },
      { index: 1, start: 0, end: 2 }
    ])
  })
  it('finds phrases across lines and retains segment offsets', () => {
    const matches = findTextMatches(
      [{ str: 'Hello', hasEOL: true }, { str: 'world' }],
      'hello world',
      1
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].segments).toHaveLength(2)
  })
  it('supports case and Unicode word boundaries without matching substrings', () => {
    const items = [{ str: 'art artist Art artística' }]
    expect(findTextMatches(items, 'art', 1, true, true)).toHaveLength(1)
    expect(findTextMatches(items, 'art', 1, false, true)).toHaveLength(2)
  })
})
