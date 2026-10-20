import { describe, expect, it } from 'vitest'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import type { Annotation } from '../src/renderer/src/stores/useAnnotationStore'
import { selectablePageText } from '../src/renderer/src/lib/pdfSelectAll'

const item = (str: string, x: number, y: number, width = str.length * 6) => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width,
  height: 12,
  fontName: 'f1',
  dir: 'ltr',
  hasEOL: false
})
const content = (...items: ReturnType<typeof item>[]) => ({ items, styles: {} }) as TextContent
const annotation = (patch: Partial<Annotation>): Annotation => ({
  id: 'edit',
  page: 1,
  type: 'text',
  text: 'Replacement',
  x: 0.1,
  y: 0.1,
  w: 0.5,
  h: 0.03,
  fontSize: 12,
  color: '#000000',
  opacity: 1,
  strokeWidth: 0,
  ...patch
})
const run = (key: string) => ({
  key,
  text: 'Old text',
  x: 40,
  y: 700,
  width: 100,
  size: 12,
  ascent: 9,
  descent: 3,
  angle: 0,
  fontFamily: 'Helvetica'
})

describe('PDF Select All text', () => {
  it('orders paint fragments by line and preserves word gaps and Unicode', () => {
    expect(
      selectablePageText(
        content(
          item('second line', 40, 680),
          item('world', 76, 700),
          item('Hello', 40, 700, 30),
          item('café 日本語', 40, 660)
        ),
        [],
        1,
        612,
        792
      )
    ).toBe('Hello world\nsecond line\ncafé 日本語')
  })
  it('copies replacement Unicode once and excludes masked source text', () => {
    const edit = annotation({
      text: 'New text',
      sourceText: run('1:0'),
      maskTexts: [run('1:0'), run('1:1')]
    })
    expect(
      selectablePageText(
        content(item('Old text', 40, 700), item('duplicate', 150, 700), item('Next line', 40, 680)),
        [edit],
        1,
        612,
        792
      )
    ).toBe('New text\nNext line')
  })
  it('unions partial deletion offsets against the original text', () => {
    const edits = [annotation({ text: '', maskTexts: [run('1:0:0-3'), run('1:0:2-5')] })]
    expect(selectablePageText(content(item('0123456789', 40, 700)), edits, 1, 612, 792)).toBe(
      '56789'
    )
  })
  it('includes placed text and ignores comments and edits on another page', () => {
    const edits = [
      annotation({ text: 'Placed', y: 0.2 }),
      annotation({ type: 'note', text: 'Comment' }),
      annotation({ page: 2, text: 'Other page' })
    ]
    expect(selectablePageText(content(item('Original', 40, 700)), edits, 1, 612, 792)).toBe(
      'Original\nPlaced'
    )
  })
  it('handles image-only pages and deliberately emptied replacements', () => {
    expect(selectablePageText(content(), [], 1, 612, 792)).toBe('')
    expect(
      selectablePageText(
        content(item('Old text', 40, 700)),
        [annotation({ text: '', sourceText: run('1:0') })],
        1,
        612,
        792
      )
    ).toBe('')
  })
})
